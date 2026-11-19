// three-main.js — PORT MERCER 3D: game state machine + tick orchestration.
// Assembles city, traffic, police, missions, combat, radio and HUD; the
// render layer (three-render.js, Stage 2) only draws this state. No DOM
// access at module scope; localStorage is touched only through the storage
// object the caller passes (browser: localStorage, Node: memory storage).

import {
  DEFAULT_SEED, generateCity, districtAt, blockingBuilding, placeById,
  placePosition, landmarkPosition, distance, MOTEL_LAY_LOW_RADIUS,
  MOTEL_DECAY_MULTIPLIER,
} from './three-city.js';
import { createTraffic, createPedestrians, updateTraffic, updatePedestrians, scarePedestrians } from './three-traffic.js';
import {
  createPoliceSystem, updatePoliceSystem, addCrime, clearWanted,
  applyDistrictHeat, hitHeli, mulberry32,
} from './three-police.js';
import {
  SAVE_KEY, STARTING_CASH, createMissionState, createSideJobState,
  startMission, updateMission, chooseEnding, decayMultiplierForEnding,
  saveGame, loadGame, missionById, SIDE_JOBS, pullSlots, sellHotGood,
  buyArmour, buyAmmo, resprayCost,
} from './three-missions.js';
import {
  createPlayerCombat, punch, shoot, reload, finishReload, takeDamage,
  jackCar, exitCar, damageCar, isDead, PUNCH_RANGE, PISTOL_RANGE,
} from './three-combat.js';
import {
  createRadio, cycleStation, stationForCar, toggleMute, currentStation,
  irisLineFor, createSynthEngine, startStation, playSfx,
} from './three-audio.js';
import { createHudState, buildHud, tickClock, dialogueData } from './three-hud.js';

export const GAME_SEED = DEFAULT_SEED;
export const SAVE_KEY_EXPORT = SAVE_KEY;

export const STATES = ['menu', 'playing', 'paused', 'gameover', 'complete'];
export const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  punch: 'KeyF',
  jack: 'KeyE',
  brake: 'Space',
  reloadOrRadio: 'KeyR',
  nextJob: 'Enter',
  pause: 'Escape',
  mute: 'KeyM',
  photo: 'KeyP',
  hideHud: 'KeyH',
  timeOfDay: 'KeyT',
};

export const ON_FOOT_SPEED = 6;
export const CAR_MAX_SPEED = 38;
export const CAR_ACCEL = 22;
export const PALM_COURT_SPEED_LIMIT = 18; // v2: 1 star just for speeding here

export function createMemoryStorage() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

export function createGame(seed = GAME_SEED, storage = null) {
  const city = generateCity(seed);
  const missions = createMissionState();
  const side = createSideJobState();
  const radio = createRadio();
  radio.station = currentStation(radio);
  const game = {
    seed,
    state: 'menu',
    time: 0, // game time in seconds (drives wanted timers, heli, missions)
    city,
    player: {
      x: -360, z: 360, // Old Mercer, near Rook's Garage (M1 start)
      heading: 0, speed: 0, inCar: false, carId: null,
    },
    traffic: createTraffic(seed),
    pedestrians: createPedestrians(seed),
    police: createPoliceSystem(),
    missions,
    side,
    combat: createPlayerCombat(),
    radio,
    hud: createHudState(),
    clock: { minutes: 17 * 60 + 45 },
    rng: mulberry32(seed ^ 0x3d2a17),
    events: [], // per-tick event strings, consumed by missions
    eventData: {},
    toasts: [], // { speaker, line } dialogue lines to show
    storage,
    synth: null, // created lazily in the browser (createSynthEngine)
    renderer: null, // attached by Stage 2 (three-render.js)
    photoMode: false,
    hudHidden: false,
    timeOfDay: 'dusk', // 'day' | 'dusk' | 'night'; T cycles
    stats: { shotsFired: 0, crimes: 0, carsJacked: 0, heliKills: 0 },
  };
  game.radio.station = currentStation(game.radio);
  return game;
}

// --- State machine ---------------------------------------------------------

export function transition(game, event) {
  const from = game.state;
  switch (event) {
    case 'start': {
      if (from !== 'menu' && from !== 'gameover') return false;
      game.state = 'playing';
      if (game.missions.status['m1'] !== 'active' && game.missions.completed.length === 0) {
        startMission(game.missions, 'm1', game.time);
      }
      return true;
    }
    case 'pause':
      if (from !== 'playing') return false;
      game.state = 'paused';
      return true;
    case 'resume':
      if (from !== 'paused') return false;
      game.state = 'playing';
      return true;
    case 'gameover':
      game.state = 'gameover';
      return true;
    case 'retry': {
      if (from !== 'gameover') return false;
      const fresh = createGame(game.seed, game.storage);
      Object.assign(game, fresh, { state: 'playing' });
      startMission(game.missions, 'm1', 0);
      return true;
    }
    case 'complete':
      game.state = 'complete';
      return true;
    default:
      return false;
  }
}

// --- Helpers ---------------------------------------------------------------

export function nearPlace(game, placeId, radius = 26) {
  // The Spire is the landmark, not a place in PLACES — it needs the
  // landmark position (without this, M3's final objective could never
  // complete: nearPlace('mercer-spire') always returned false).
  if (placeId === 'mercer-spire') {
    return distance(game.player, landmarkPosition()) < radius;
  }
  const place = placeById(placeId);
  if (!place) return false;
  const pos = place.id === 'mercer-spire'
    ? landmarkPosition()
    : placePosition(place);
  return distance(game.player, pos) < radius;
}

function toast(game, speakerId, line) {
  const d = dialogueData(speakerId, line);
  game.toasts.push(d);
  if (game.toasts.length > 4) game.toasts.shift();
  return d;
}

// v2 decay multiplier: BROADCAST ending 2x in free roam, Coral Motel lay-low
// 2x while near the motel; both at once multiply (4x).
export function decayMultiplier(game) {
  let m = decayMultiplierForEnding(game.missions.ending);
  if (nearPlace(game, 'coral-motel', MOTEL_LAY_LOW_RADIUS)) m *= MOTEL_DECAY_MULTIPLIER;
  return m;
}

function movePlayer(game, input, dt) {
  const p = game.player;
  const fwd = (input.up ? 1 : 0) - (input.down ? 1 : 0);
  const steer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  if (!p.inCar) {
    p.speed = fwd !== 0 ? ON_FOOT_SPEED : 0;
    if (steer !== 0) p.heading += steer * 2.4 * dt;
    if (fwd !== 0) p.heading += 0; // on foot: WASD steers heading directly
    const nx = p.x + Math.cos(p.heading) * p.speed * fwd * dt;
    const nz = p.z + Math.sin(p.heading) * p.speed * fwd * dt;
    if (!blockingBuilding(game.city, nx, nz, 1)) {
      p.x = nx;
      p.z = nz;
    }
    return;
  }
  // Driving: accelerate / brake / coast, steer scales with speed.
  if (fwd > 0) p.speed = Math.min(CAR_MAX_SPEED, p.speed + CAR_ACCEL * dt);
  else if (fwd < 0) p.speed = Math.max(-10, p.speed - CAR_ACCEL * dt);
  else p.speed *= Math.max(0, 1 - 1.4 * dt);
  if (input.brake) p.speed *= Math.max(0, 1 - 4 * dt);
  // Drifting: handbrake at speed — tyre smoke + the action-shot look.
  p.drifting = !!(input.brake && Math.abs(p.speed) > 15);
  p.heading += steer * 1.9 * dt * Math.min(1, Math.abs(p.speed) / 12) * Math.sign(p.speed || 1);
  const nx = p.x + Math.cos(p.heading) * p.speed * dt;
  const nz = p.z + Math.sin(p.heading) * p.speed * dt;
  if (!blockingBuilding(game.city, nx, nz, 2)) {
    p.x = nx;
    p.z = nz;
  } else {
    p.speed *= 0.4; // bumped a building — and the car shows it
    const car = game.traffic.find((c) => c.id === p.carId);
    if (car) car.health = Math.max(0, car.health - 5);
  }
}

// Resolve a pistol shot: nearest police unit in the aim cone, else the heli.
function resolveShot(game, aim) {
  const p = game.player;
  const aimLen = Math.hypot(aim.x, aim.z) || 1;
  const ax = aim.x / aimLen;
  const az = aim.z / aimLen;
  let best = null;
  let bestD = Infinity;
  for (const u of game.police.units) {
    const dx = u.x - p.x;
    const dz = u.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d > PISTOL_RANGE || d < 1) continue;
    if ((dx * ax + dz * az) / d < 0.7) continue;
    if (d < bestD) {
      bestD = d;
      best = { kind: 'police', unit: u };
    }
  }
  const heli = game.police.heli;
  if (heli.active && heli.state === 'chase') {
    const dx = heli.x - p.x;
    const dz = heli.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 80 && (!best || d < bestD)) best = { kind: 'heli', unit: heli };
  }
  return best;
}

// --- Actions (called from input handling) ----------------------------------

export function doJack(game) {
  const p = game.player;
  if (p.inCar) {
    const car = game.traffic.find((c) => c.id === p.carId);
    exitCar(p, car);
    return { ok: true, exited: true };
  }
  let best = null;
  let bestD = 4.5;
  for (const c of game.traffic) {
    const d = distance(p, c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  if (!best) return { ok: false, reason: 'no-car-near' };
  const res = jackCar(p, best, game.time);
  if (!res.ok) return res;
  addCrime(game.police.wanted, 1, game.time);
  game.stats.crimes += 1;
  game.stats.carsJacked += 1;
  game.events.push('car-stolen');
  game.eventData = { districtId: districtAt(p.x, p.z).id };
  stationForCar(game.radio, best.id);
  game.radio.station = currentStation(game.radio);
  return { ok: true, car: best };
}

export function doShoot(game, aim) {
  const res = shoot(game.combat, game.time);
  if (!res.ok) return res;
  game.stats.shotsFired += 1;
  addCrime(game.police.wanted, 1, game.time); // shooting is a crime
  game.stats.crimes += 1;
  scarePedestrians(game.pedestrians, game.player, game.time, 60);
  playSfx(game.synth, game.radio, 'gunshot');
  const hit = resolveShot(game, aim);
  if (!hit) return { ...res, hit: false };
  if (hit.kind === 'heli') {
    const h = hitHeli(game.police.heli, game.time);
    if (h.crashed) {
      game.stats.heliKills += 1;
      playSfx(game.synth, game.radio, 'heliDown');
      toast(game, 'iris', 'A police helicopter is down over Leon Bay. Repeat: a helicopter is DOWN.');
    }
    return { ...res, hit: true, target: 'heli', heliHits: h.hits, crashed: h.crashed };
  }
  // Police unit hit: pistol damage removes the unit (it is a game unit, not a sim).
  game.police.units = game.police.units.filter((u) => u !== hit.unit);
  return { ...res, hit: true, target: 'police' };
}

export function doPunch(game) {
  const res = punch(game.combat, game.time, true);
  if (!res || !res.hit) return res || { type: 'punch', hit: false };
  // Nearest pedestrian in range takes the punch; hitting one is a crime.
  let best = null;
  let bestD = PUNCH_RANGE;
  for (const ped of game.pedestrians) {
    const d = distance(game.player, ped);
    if (d < bestD) {
      bestD = d;
      best = ped;
    }
  }
  if (best) {
    addCrime(game.police.wanted, 1, game.time);
    game.stats.crimes += 1;
    scarePedestrians(game.pedestrians, game.player, game.time, 40);
  }
  return { ...res, target: best ? 'pedestrian' : 'air' };
}

export function doRadioOrReload(game) {
  if (game.player.inCar) {
    const station = cycleStation(game.radio, game.player.carId);
    game.radio.station = station;
    if (game.synth) startStation(game.synth, game.radio, game.police.wanted.stars);
    return { ok: true, action: 'radio', station: station.name };
  }
  const res = reload(game.combat, game.time);
  return { ok: res.ok, action: 'reload', ...res };
}

export function doRespray(game, colourIndex = 0) {
  if (!nearPlace(game, 'rooks-garage', 30)) return { ok: false, reason: 'not-at-garage' };
  if (!game.player.inCar) return { ok: false, reason: 'not-in-car' };
  if (game.missions.cash < resprayCost()) return { ok: false, reason: 'not-enough-cash' };
  game.missions.cash -= resprayCost();
  clearWanted(game.police.wanted); // resets the police description
  const colour = SIDE_JOBS.respray.colours[colourIndex % SIDE_JOBS.respray.colours.length];
  return { ok: true, colour };
}

export function doSlots(game) {
  if (!nearPlace(game, 'coral-motel', 30)) return { ok: false, reason: 'not-at-motel' };
  if (game.missions.cash < SIDE_JOBS.slots.pull) return { ok: false, reason: 'not-enough-cash' };
  game.missions.cash -= SIDE_JOBS.slots.pull;
  const res = pullSlots(game.side, game.rng);
  game.missions.cash += res.payout;
  return { ok: true, ...res };
}

export function doBuyArmour(game) {
  if (!nearPlace(game, 'bayview-pawn', 30)) return { ok: false, reason: 'not-at-pawn' };
  const item = buyArmour();
  if (game.missions.cash < item.cost) return { ok: false, reason: 'not-enough-cash' };
  game.missions.cash -= item.cost;
  game.combat.armour = item.armour;
  return { ok: true, ...item };
}

export function doBuyAmmo(game) {
  if (!nearPlace(game, 'bayview-pawn', 30)) return { ok: false, reason: 'not-at-pawn' };
  const item = buyAmmo();
  if (game.missions.cash < item.cost) return { ok: false, reason: 'not-enough-cash' };
  game.missions.cash -= item.cost;
  game.combat.ammoReserve += item.rounds;
  return { ok: true, ...item };
}

export function doSellHotGood(game, value) {
  if (!nearPlace(game, 'bayview-pawn', 30)) return { ok: false, reason: 'not-at-pawn' };
  const res = sellHotGood(value, game.rng);
  game.missions.cash += res.paid;
  return { ok: true, ...res };
}

// --- Tick ------------------------------------------------------------------

export function update(game, dt, input = {}) {
  if (game.state !== 'playing') return game;
  game.time += dt;
  tickClock(game.clock, dt);
  game.events = [];
  game.eventData = {};

  if (input.pause) {
    transition(game, 'pause');
    return game;
  }
  if (input.mute) {
    toggleMute(game.radio);
    if (game.synth) startStation(game.synth, game.radio, game.police.wanted.stars);
  }
  if (input.jack) doJack(game);
  if (input.punch) doPunch(game);
  if (input.shoot && input.aim) doShoot(game, input.aim);
  if (input.radioOrReload) doRadioOrReload(game);
  if (input.timeOfDay) {
    game.timeOfDay = game.timeOfDay === 'dusk' ? 'night' : game.timeOfDay === 'night' ? 'day' : 'dusk';
  }
  if (input.photo) game.photoMode = !game.photoMode;
  if (input.hideHud) game.hudHidden = !game.hudHidden;

  movePlayer(game, input, dt);
  updateTraffic(game.traffic, dt);
  updatePedestrians(game.pedestrians, dt, game.time);

  // v2: speeding in Palm Court costs 1 star (cooldown-gated in the module).
  const district = districtAt(game.player.x, game.player.z);
  if (game.player.inCar && Math.abs(game.player.speed) > PALM_COURT_SPEED_LIMIT) {
    applyDistrictHeat(game.police.wanted, district.id, true, game.time);
  }

  const sys = updatePoliceSystem(game.police, dt, game.time, game.player, game.rng, {
    decayMultiplier: decayMultiplier(game),
  });
  if (sys.damage > 0) {
    const res = takeDamage(game.combat, sys.damage);
    if (res.dead) {
      transition(game, 'gameover');
      return game;
    }
  }
  if (sys.heliExploded) playSfx(game.synth, game.radio, 'crash');

  // Reload completion.
  if (game.combat.reloadingUntil && game.time >= game.combat.reloadingUntil) {
    finishReload(game.combat);
  }

  // Missions.
  const ctx = {
    now: game.time,
    dt,
    player: game.player,
    nearPlace: (id, r) => nearPlace(game, id, r),
    events: game.events,
    eventData: game.eventData,
    wanted: game.police.wanted,
    districtId: district.id,
  };
  const outcome = updateMission(game.missions, ctx);
  if (outcome.wantedSet !== null && outcome.wantedSet !== undefined) {
    const w = game.police.wanted;
    if (w.stars < outcome.wantedSet) addCrime(w, outcome.wantedSet - w.stars, game.time);
  }
  if (outcome.done) {
    const mission = missionById(outcome.missionId);
    if (mission) {
      const line = irisLineFor(mission.id, game.missions.ending);
      if (line) toast(game, 'iris', line);
    }
    if (game.missions.ending === null && outcome.missionId === 'm7') {
      // Objectives done — the ending choice is offered (UI), not auto-picked.
    }
    saveGame(game.missions, game.side, game.storage); // autosave on completion
  }
  if (outcome.failed) {
    toast(game, 'rook', 'That went sideways, Lee. Shake it off — the job\u2019s still there when you\u2019re ready.');
  }

  // HUD refresh.
  game.hud = buildHud(game.hud, game);

  // Render (Stage 2 attaches a renderer; headless logic runs without one).
  if (game.renderer) game.renderer.sync(game, dt);

  return game;
}

// Choose the M6 ending (BROADCAST or BURN). Applies the $3,000 + the
// free-roam consequence (broadcast: wanted decays 2x faster from now on).
export function chooseGameEnding(game, choice) {
  const res = chooseEnding(game.missions, choice);
  if (!res.ok) return res;
  const line = irisLineFor('m7', choice);
  if (line) toast(game, 'iris', line);
  transition(game, 'complete');
  saveGame(game.missions, game.side, game.storage);
  return res;
}

// --- Save / load -----------------------------------------------------------

export function save(game) {
  return saveGame(game.missions, game.side, game.storage);
}

export function loadInto(game) {
  const loaded = loadGame(game.storage);
  if (!loaded) return false;
  game.missions = loaded.state;
  game.side = loaded.side;
  return true;
}

export function newGame(storage = null) {
  const game = createGame(GAME_SEED, storage);
  transition(game, 'start');
  return game;
}
