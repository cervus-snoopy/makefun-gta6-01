// entities.js — player, cars, traffic AI, pedestrians, police AI, wanted level.
// All state lives in the shared game object G; update(dt) advances one tick.
import { WORLD, PITCH, HALF_ROAD, isRoad, roadCentre, collides, moveWithCollision, randomRoadPoint, randomSidewalkPoint } from './world.js';

export const CAR_COLORS = ['#c0392b', '#2980b9', '#f1c40f', '#7f8c8d', '#27ae60', '#e67e22', '#8e44ad', '#ecf0f1', '#2c3e50', '#16a085'];
const PED_COLORS = ['#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#fd79a8', '#00cec9'];

export function makePlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, speed: 0,
    hp: 100, maxHp: 100, armor: 50, cash: 250, ammo: 24, reserveAmmo: 48,
    weapon: 'PISTOL', inCar: null, wanted: 0, lastCrime: -999, lastDecay: 0,
    punchCd: 0, shootCd: 0, invuln: 0,
  };
}

export function makeCar(x, y, angle, color, kind) {
  return { x, y, angle, speed: 0, color, kind: kind || 'sedan', parked: false, driver: true, hp: 100, wrecked: false, police: false, brakeLight: false };
}

export function spawnTraffic(world, rnd, n) {
  const cars = [];
  for (let i = 0; i < n; i++) {
    const p = randomRoadPoint(rnd);
    const vertical = rnd() < 0.5;
    const angle = vertical ? (rnd() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rnd() < 0.5 ? 0 : Math.PI);
    const c = makeCar(p.x, p.y, angle, CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)]);
    c.speed = 90 + rnd() * 60;
    cars.push(c);
  }
  return cars;
}

export function spawnParked(world, rnd, n) {
  const cars = [];
  let tries = 0;
  while (cars.length < n && tries++ < n * 20) {
    const p = randomRoadPoint(rnd);
    const vertical = rnd() < 0.5;
    const off = (rnd() < 0.5 ? -1 : 1) * (HALF_ROAD - 14);
    const x = vertical ? p.x + off : p.x;
    const y = vertical ? p.y : p.y + off;
    const angle = vertical ? (rnd() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rnd() < 0.5 ? 0 : Math.PI);
    if (collides(world, x, y, 20)) continue;
    const c = makeCar(x, y, angle, CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)]);
    c.parked = true; c.driver = false;
    cars.push(c);
  }
  return cars;
}

export function spawnPeds(world, rnd, n) {
  const peds = [];
  for (let i = 0; i < n; i++) {
    const p = randomSidewalkPoint(rnd);
    peds.push({ x: p.x, y: p.y, angle: rnd() * Math.PI * 2, speed: 28 + rnd() * 30, color: PED_COLORS[Math.floor(rnd() * PED_COLORS.length)], hp: 1, flee: 0, walkPhase: rnd() * 6, dead: false });
  }
  return peds;
}

// --- wanted ---
export function addWanted(G, stars) {
  const p = G.player;
  p.wanted = Math.min(5, p.wanted + stars);
  p.lastCrime = G.time;
}

export function updateWanted(G, dt) {
  const p = G.player;
  // Decay: no crime for 12s and no police nearby -> lose a star every 8s.
  if (p.wanted > 0 && G.time - p.lastCrime > 12) {
    let near = false;
    for (const c of G.police) if (Math.hypot(c.x - p.x, c.y - p.y) < 420) { near = true; break; }
    if (!near && G.time - p.lastDecay > 8) { p.wanted--; p.lastDecay = G.time; }
  }
  // Spawn police up to wanted count (max 4 active).
  const want = Math.min(p.wanted, 4);
  while (G.police.length < want) {
    const a = Math.random() * Math.PI * 2;
    const d = 500 + Math.random() * 250;
    const c = makeCar(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 0, '#1a1a2e', 'police');
    c.police = true; c.speed = 0;
    // clamp into world
    c.x = Math.max(40, Math.min(WORLD - 40, c.x));
    c.y = Math.max(40, Math.min(WORLD - 40, c.y));
    G.police.push(c);
  }
  // Despawn police when wanted is 0.
  if (p.wanted === 0) G.police.length = 0;
}

// --- traffic AI: follow road grid, turn at intersections, avoid car ahead ---
function carAhead(G, car, dist) {
  const dx = Math.cos(car.angle), dy = Math.sin(car.angle);
  for (const o of [...G.traffic, ...G.police]) {
    if (o === car || o.wrecked) continue;
    const rx = o.x - car.x, ry = o.y - car.y;
    const along = rx * dx + ry * dy;
    const side = Math.abs(rx * -dy + ry * dx);
    if (along > 0 && along < dist && side < 26) return true;
  }
  const p = G.player;
  if (p.inCar === car) return false;
  return false;
}

export function updateTraffic(G, dt) {
  for (const c of G.traffic) {
    if (c.wrecked) continue;
    // snap to lane centre on the axis of travel
    const vertical = Math.abs(Math.sin(c.angle)) > 0.7;
    if (vertical) c.x += (roadCentre(c.x) - c.x) * Math.min(1, dt * 3);
    else c.y += (roadCentre(c.y) - c.y) * Math.min(1, dt * 3);
    // intersection? near both road axes -> maybe turn
    const nearX = Math.min(((c.x % PITCH) + PITCH) % PITCH, PITCH - (((c.x % PITCH) + PITCH) % PITCH));
    const nearY = Math.min(((c.y % PITCH) + PITCH) % PITCH, PITCH - (((c.y % PITCH) + PITCH) % PITCH));
    if (nearX < 10 && nearY < 10 && Math.random() < dt * 1.2) {
      c.angle += (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
    }
    const target = carAhead(G, c, 70) ? 0 : 90 + (c.cruise || 40);
    c.speed += (target - c.speed) * Math.min(1, dt * 2);
    const nx = c.x + Math.cos(c.angle) * c.speed * dt;
    const ny = c.y + Math.sin(c.angle) * c.speed * dt;
    if (!collides(G.world, nx, ny, 18)) { c.x = nx; c.y = ny; }
    else { c.angle += Math.PI / 2; } // blocked (building edge) -> turn
    // wrap around world edges so traffic never runs dry
    if (c.x < 20 || c.x > WORLD - 20 || c.y < 20 || c.y > WORLD - 20) {
      const p = randomRoadPoint(Math.random);
      c.x = p.x; c.y = p.y;
    }
  }
}

// --- pedestrians: wander sidewalks, flee from danger ---
export function updatePeds(G, dt) {
  const p = G.player;
  for (const ped of G.peds) {
    if (ped.dead) continue;
    const dPlayer = Math.hypot(ped.x - p.x, ped.y - p.y);
    if (dPlayer < 90 && (G.gunFiredRecently > 0 || p.inCar)) ped.flee = 2;
    if (ped.flee > 0) {
      ped.flee -= dt;
      const a = Math.atan2(ped.y - p.y, ped.x - p.x);
      ped.angle = a;
      const nx = ped.x + Math.cos(a) * 110 * dt, ny = ped.y + Math.sin(a) * 110 * dt;
      moveWithCollision(G.world, ped, nx, ny, 8);
    } else {
      if (Math.random() < dt * 0.4) ped.angle += (Math.random() - 0.5) * 2.2;
      const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
      const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
      if (!collides(G.world, nx, ny, 8) && !isRoad(nx, ny)) { ped.x = nx; ped.y = ny; }
      else ped.angle += Math.PI / 2;
    }
    ped.walkPhase += dt * 6;
  }
}

// --- police AI: chase + ram, shootable ---
export function updatePolice(G, dt) {
  const p = G.player;
  const px = p.inCar ? p.inCar.x : p.x, py = p.inCar ? p.inCar.y : p.y;
  for (const c of G.police) {
    if (c.wrecked) continue;
    const dx = px - c.x, dy = py - c.y;
    const dist = Math.hypot(dx, dy) || 1;
    const wantAngle = Math.atan2(dy, dx);
    let da = wantAngle - c.angle;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    c.angle += Math.max(-3.2 * dt, Math.min(3.2 * dt, da));
    const target = dist > 700 ? 260 : (dist > 120 ? 235 : 150);
    c.speed += (target - c.speed) * Math.min(1, dt * 1.5);
    const nx = c.x + Math.cos(c.angle) * c.speed * dt;
    const ny = c.y + Math.sin(c.angle) * c.speed * dt;
    if (!collides(G.world, nx, ny, 18)) { c.x = nx; c.y = ny; }
    // ram damage on contact
    if (dist < 34) {
      if (p.invuln <= 0) {
        damagePlayer(G, p.inCar ? 6 : 14);
        G.shake(0.55);
        G.sfx('hit');
        p.invuln = 0.7;
      }
      c.speed *= 0.4;
      // bounce off a little
      c.x -= Math.cos(c.angle) * 20 * dt * 10;
      c.y -= Math.sin(c.angle) * 20 * dt * 10;
    }
    if (dist > 1400) { // too far: respawn closer
      const a = Math.random() * Math.PI * 2;
      c.x = Math.max(40, Math.min(WORLD - 40, px + Math.cos(a) * 520));
      c.y = Math.max(40, Math.min(WORLD - 40, py + Math.sin(a) * 520));
    }
  }
}

export function damagePlayer(G, amount) {
  const p = G.player;
  if (p.invuln > 0 && amount < 20) return;
  let left = amount;
  if (p.armor > 0) { const absorbed = Math.min(p.armor, left); p.armor -= absorbed; left -= absorbed; }
  p.hp -= left;
  G.flashRed = Math.max(G.flashRed, 0.35);
  if (p.hp <= 0) { p.hp = 0; G.state = 'gameover'; G.sfx('gameover'); }
}

// Player on foot movement.
export function updatePlayerOnFoot(G, dt, input) {
  const p = G.player;
  let mx = 0, my = 0;
  if (input.up) my -= 1;
  if (input.down) my += 1;
  if (input.left) mx -= 1;
  if (input.right) mx += 1;
  const len = Math.hypot(mx, my);
  const speed = 185;
  if (len > 0) {
    mx /= len; my /= len;
    p.angle = Math.atan2(my, mx);
    moveWithCollision(G.world, p, p.x + mx * speed * dt, p.y + my * speed * dt, 12);
    p.moving = true;
  } else p.moving = false;
  // aim at mouse (world coords stored by main)
  if (G.mouseWorld) p.aimAngle = Math.atan2(G.mouseWorld.y - p.y, G.mouseWorld.x - p.x);
  // bump into peds = assault
  for (const ped of G.peds) {
    if (!ped.dead && Math.hypot(ped.x - p.x, ped.y - p.y) < 18 && Math.hypot(mx, my) > 0) {
      ped.dead = true; G.particles.burst(ped.x, ped.y, '#e74c3c', 10);
      addWanted(G, 1); G.sfx('hit'); G.shake(0.4);
    }
  }
}

// Player driving.
export function updatePlayerDriving(G, dt, input) {
  const p = G.player, car = p.inCar;
  if (!car) return;
  const accel = input.up ? 420 : 0;
  const brake = input.down || input.brake;
  if (accel) car.speed += accel * dt;
  if (brake) car.speed -= (input.down ? 500 : 700) * dt;
  car.speed -= car.speed * 0.9 * dt; // drag
  car.speed = Math.max(-90, Math.min(420, car.speed));
  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  const dir = car.speed >= 0 ? 1 : -1;
  car.angle += steer * 2.4 * dt * Math.min(1, Math.abs(car.speed) / 120) * dir;
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const hitWall = collides(G.world, nx, ny, 18);
  if (!hitWall) {
    car.x = nx; car.y = ny;
    if (Math.abs(car.speed) > 200 && steer !== 0) G.skids.push({ x: car.x, y: car.y, a: car.angle, life: 1.2 });
  } else {
    if (Math.abs(car.speed) > 120) { G.shake(0.5); G.sfx('hit'); G.particles.burst(car.x, car.y, '#f1c40f', 12); }
    car.speed *= -0.25;
  }
  p.x = car.x; p.y = car.y; p.angle = car.angle;
  // ramming peds
  if (Math.abs(car.speed) > 60) {
    for (const ped of G.peds) {
      if (!ped.dead && Math.hypot(ped.x - car.x, ped.y - car.y) < 26) {
        ped.dead = true; G.particles.burst(ped.x, ped.y, '#e74c3c', 12);
        addWanted(G, 1); G.shake(0.5); G.sfx('hit');
      }
    }
  }
  // skid marks age
  for (const s of G.skids) s.life -= dt;
  G.skids = G.skids.filter(s => s.life > 0);
}

// Nearest stealable car within range of the player.
export function nearestCar(G, maxDist) {
  const p = G.player;
  let best = null, bestD = maxDist;
  for (const c of [...G.traffic, ...G.parked, ...G.police]) {
    if (c.wrecked) continue;
    const d = Math.hypot(c.x - p.x, c.y - p.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

// Jack a car: driver flees, wanted +1, mission hook via G.onJack callback.
export function jackCar(G, car) {
  const p = G.player;
  if (!car) return false;
  if (car.police) { addWanted(G, 2); }
  else addWanted(G, 1);
  car.parked = false; car.driver = false;
  // remove from traffic list so it stops its AI
  const ti = G.traffic.indexOf(car);
  if (ti >= 0) G.traffic.splice(ti, 1);
  p.inCar = car;
  p.x = car.x; p.y = car.y;
  G.sfx('jack'); G.shake(0.25);
  G.particles.burst(car.x, car.y, '#f1c40f', 8);
  if (G.onJack) G.onJack(car);
  return true;
}

export function exitCar(G) {
  const p = G.player, car = p.inCar;
  if (!car) return;
  p.inCar = null;
  const a = car.angle + Math.PI / 2;
  p.x = car.x + Math.cos(a) * 30;
  p.y = car.y + Math.sin(a) * 30;
  if (collides(G.world, p.x, p.y, 12)) { p.x = car.x - Math.cos(a) * 30; p.y = car.y - Math.sin(a) * 30; }
  car.speed = 0;
  G.parked.push(car);
  G.sfx('door');
}
