// three-police.js — PORT MERCER 3D: wanted level, ground police, helicopter.
// Pure state machines over plain objects. Render-independent: Stage 2 draws
// the units, the spotlight cone, and the crash from this state.

import { distance, mulberry32 } from './three-city.js';

export const MAX_WANTED = 5;
export const MAX_GROUND_UNITS = 4;
export const DECAY_NO_CRIME_S = 12; // seconds with no crime before decay starts
export const DECAY_PER_STAR_S = 8; // seconds per star once decay is running
export const POLICE_NEAR_RADIUS = 90; // a unit this close blocks decay
export const HELI_MIN_WANTED = 4;
export const HELI_COOLDOWN_S = 25; // after a heli is shot down
export const HELI_DAMAGE_PER_HIT = 34; // damage a heli shot deals to the player
export const HELI_SHOT_INTERVAL_S = 2.5;
export const HELI_HITS_TO_CRASH = 3;
export const HELI_BURN_S = 1.6; // spin + smoke + burn before the explosion
export const HELI_HEIGHT = 55;
export const HELI_SPEED = 26;

// LBPD response-unit callsigns (bird/fish names, top-3 template): the HUD
// response list names each unit, its distance in metres and its status.
export const UNIT_NAMES = ['GULL', 'MARLIN', 'TARPON', 'HERON', 'KESTREL', 'IBIS', 'SNAPPER'];
export const HELI_CALLSIGN = 'GULL-1';

// Status of one ground unit relative to the player, for the response list.
export function policeUnitStatus(unit, player) {
  if (unit.roadblock) return 'ROADBLOCK';
  const d = distance(unit, player);
  if (d < 12 || unit.state === 'ram') return 'RAMMING';
  return 'PURSUIT';
}

// Escalation labels shown in the HUD (REPORT §2 idea 6).
export function escalationLabel(stars) {
  if (stars <= 0) return 'PATROL';
  if (stars <= 3) return 'PURSUIT';
  return 'HELI PURSUIT';
}

// --- Wanted state ----------------------------------------------------------

export function createWanted() {
  return {
    stars: 0,
    lastCrimeAt: -Infinity, // game time (s) of the last crime
    decayTimer: 0, // accumulated decay progress toward losing one star
    searching: false, // wanted > 0, nobody near, no crime for 12 s
    lastDistrictHeatAt: -Infinity, // last Palm Court speeding star (cooldown)
  };
}

// Crime levels: stealing a car +1, hitting a pedestrian +1, shooting +1,
// shooting a cop +2, mission bumps as defined in three-missions.js.
export function addCrime(wanted, levels, now) {
  wanted.stars = Math.max(0, Math.min(MAX_WANTED, wanted.stars + levels));
  wanted.lastCrimeAt = now;
  wanted.decayTimer = 0;
  wanted.searching = false;
  return wanted;
}

export function clearWanted(wanted) {
  wanted.stars = 0;
  wanted.decayTimer = 0;
  wanted.searching = false;
  return wanted;
}

// v2: speeding in Palm Court costs 1 star ("1 star just for speeding
// here"). Cooldown-gated so it cannot farm a star every frame; the caller
// passes speeding = true while the player drives over the speed limit.
// Palm Court's limit is deliberately low — money watches its streets.
export function applyDistrictHeat(wanted, districtId, speeding, now) {
  if (districtId !== 'palm-court' || !speeding) return false;
  if (now - wanted.lastDistrictHeatAt < 10) return false; // cooldown (s)
  wanted.lastDistrictHeatAt = now;
  addCrime(wanted, 1, now);
  return true;
}

// now: game time in seconds. policeNear/heliNear: any unit within
// POLICE_NEAR_RADIUS of the player.
// decayMultiplier: v2 — 1 normally; 2 after the BROADCAST ending (the city
// owes Leon one: wanted decays twice as fast in free roam); 2 while laying
// low at the Coral Motel. The caller multiplies them (both at once = 4x).
export function updateWanted(wanted, dt, now, { policeNear, heliNear, decayMultiplier = 1 }) {
  const noCrimeFor = now - wanted.lastCrimeAt;
  const anyoneNear = policeNear || heliNear;

  // SEARCHING: wanted, nobody near, no crime for 12 s.
  wanted.searching = wanted.stars > 0 && !anyoneNear && noCrimeFor >= DECAY_NO_CRIME_S;

  if (wanted.stars === 0) {
    wanted.decayTimer = 0;
    return wanted;
  }
  // Decay only when the heat has cooled: 12 s with no crime AND no police near.
  // The decay clock runs decayMultiplier times as fast (v2 endings / motel).
  if (noCrimeFor >= DECAY_NO_CRIME_S && !anyoneNear) {
    wanted.decayTimer += dt * decayMultiplier;
    while (wanted.decayTimer >= DECAY_PER_STAR_S && wanted.stars > 0) {
      wanted.decayTimer -= DECAY_PER_STAR_S;
      wanted.stars -= 1;
    }
  } else {
    wanted.decayTimer = 0;
  }
  if (wanted.stars === 0) wanted.searching = false;
  return wanted;
}

// --- Ground police ---------------------------------------------------------

export function createPoliceUnit(id, x, z) {
  return {
    id,
    kind: 'police',
    x,
    z,
    speed: 22,
    state: 'chase', // chase | ram | stuck
    ramCooldownUntil: 0,
    name: null, // LBPD callsign, assigned on spawn (syncPoliceUnits)
    roadblock: false,
  };
}

// Spawn ground units up to the wanted count (max 4), at road positions
// around the player. `rng` is a mulberry32 stream supplied by the caller.
export function syncPoliceUnits(units, wantedStars, player, rng) {
  const target = Math.max(0, Math.min(wantedStars, MAX_GROUND_UNITS));
  while (units.length < target) {
    const angle = rng() * Math.PI * 2;
    const dist = 70 + rng() * 50;
    const unit = createPoliceUnit(
      `police-${units.length}-${Math.floor(rng() * 1e6)}`,
      player.x + Math.cos(angle) * dist,
      player.z + Math.sin(angle) * dist,
    );
    // Named callsign: bird/fish + number, in spawn order (deterministic
    // stream, so the same wanted level always names the same units).
    unit.name = `${UNIT_NAMES[units.length % UNIT_NAMES.length]}-${10 + Math.floor(rng() * 89)}`;
    units.push(unit);
  }
  while (units.length > target) units.pop();
  // At 4+ stars the last unit holds a roadblock instead of chasing.
  for (const u of units) u.roadblock = false;
  if (wantedStars >= 4 && units.length > 0) units[units.length - 1].roadblock = true;
  return units;
}

// Chase + ram: steer straight at the player (road-following is a Stage 2
// render concern for the visual; the pursuit vector is what matters here).
// Returns damage dealt to the player this tick (0 unless a ram lands).
export function updatePoliceUnit(unit, dt, now, player) {
  const d = distance(unit, player);
  if (d > 2) {
    const step = Math.min(unit.speed * dt, d - 2);
    unit.x += ((player.x - unit.x) / d) * step;
    unit.z += ((player.z - unit.z) / d) * step;
  }
  unit.state = d < 12 ? 'ram' : 'chase';
  if (d < 4 && now >= unit.ramCooldownUntil) {
    unit.ramCooldownUntil = now + 1.5;
    return 8; // ram damage
  }
  return 0;
}

export function updatePolice(units, dt, now, player) {
  let damage = 0;
  for (const u of units) damage += updatePoliceUnit(u, dt, now, player);
  return damage;
}

export function anyPoliceNear(units, player, radius = POLICE_NEAR_RADIUS) {
  return units.some((u) => distance(u, player) < radius);
}

// --- Helicopter ------------------------------------------------------------

export function createHeli() {
  return {
    kind: 'heli',
    name: HELI_CALLSIGN, // the response list names the heli too
    active: false,
    x: 0,
    z: 0,
    y: HELI_HEIGHT,
    state: 'idle', // idle | chase | crashing | dead
    hits: 0,
    cooldownUntil: -Infinity,
    burnTimer: 0,
    shotTimer: 0,
    spotlight: { x: 0, z: 0 }, // spotlight target = player position (locked)
  };
}

// Spawns at wanted >= 4 once the post-kill cooldown has elapsed; despawns
// (flies off) when wanted drops below 4. `now` is game time in seconds.
export function updateHeli(heli, dt, now, wantedStars, player) {
  if (heli.state === 'crashing') {
    heli.burnTimer -= dt;
    heli.y = Math.max(0, heli.y - 30 * dt); // spin down, smoke, burn 1.6 s
    if (heli.burnTimer <= 0) {
      heli.state = 'dead';
      heli.active = false;
      heli.cooldownUntil = now + HELI_COOLDOWN_S;
      return { exploded: true };
    }
    return { exploded: false };
  }
  if (heli.state === 'dead') {
    heli.active = false;
    return { exploded: false };
  }
  if (wantedStars < HELI_MIN_WANTED) {
    heli.active = false;
    heli.state = 'idle';
    heli.hits = 0;
    return { exploded: false };
  }
  if (!heli.active) {
    if (now < heli.cooldownUntil) return { exploded: false };
    heli.active = true;
    heli.state = 'chase';
    heli.hits = 0;
    heli.x = player.x + 60;
    heli.z = player.z - 60;
    heli.y = HELI_HEIGHT;
    heli.shotTimer = HELI_SHOT_INTERVAL_S;
  }
  // Chase / hover: close on the player, spotlight locked on them.
  const d = distance(heli, player);
  if (d > 18) {
    const step = Math.min(HELI_SPEED * dt, d - 18);
    heli.x += ((player.x - heli.x) / d) * step;
    heli.z += ((player.z - heli.z) / d) * step;
  }
  heli.spotlight.x = player.x;
  heli.spotlight.z = player.z;
  // The heli shoots while locked on: 34 dmg per hit, one shot per interval.
  heli.shotTimer -= dt;
  let damage = 0;
  if (heli.shotTimer <= 0) {
    heli.shotTimer = HELI_SHOT_INTERVAL_S;
    damage = HELI_DAMAGE_PER_HIT;
  }
  return { exploded: false, damage };
}

// A pistol hit on the heli. 3 hits = crash: spin, smoke, burn 1.6 s, explode.
export function hitHeli(heli, now) {
  if (!heli.active || heli.state !== 'chase') return { crashed: false, hits: heli.hits };
  heli.hits += 1;
  if (heli.hits >= HELI_HITS_TO_CRASH) {
    heli.state = 'crashing';
    heli.burnTimer = HELI_BURN_S;
    return { crashed: true, hits: heli.hits };
  }
  return { crashed: false, hits: heli.hits };
}

export function heliNear(heli, player, radius = POLICE_NEAR_RADIUS) {
  return heli.active && distance(heli, player) < radius;
}

// One-call helper for the main loop: advance wanted + police + heli.
// opts: { decayMultiplier } — v2 ending / motel lay-low (see updateWanted).
// Returns { damage } dealt to the player this tick.
export function updatePoliceSystem(sys, dt, now, player, rng, opts = {}) {
  syncPoliceUnits(sys.units, sys.wanted.stars, player, rng);
  let damage = updatePolice(sys.units, dt, now, player);
  const heliRes = updateHeli(sys.heli, dt, now, sys.wanted.stars, player);
  if (heliRes.damage) damage += heliRes.damage;
  updateWanted(sys.wanted, dt, now, {
    policeNear: anyPoliceNear(sys.units, player),
    heliNear: heliNear(sys.heli, player),
    decayMultiplier: opts.decayMultiplier ?? 1,
  });
  return { damage, heliExploded: !!heliRes.exploded };
}

export function createPoliceSystem() {
  return { wanted: createWanted(), units: [], heli: createHeli() };
}

export { mulberry32 };
