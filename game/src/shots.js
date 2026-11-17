// shots.js — ?shot=<scene>&seed=<n> autopilot for screenshots.
// On load with ?shot=, build a scripted scene deterministically (fixed seed +
// fast-forward N ticks), render one frame, set window.__shotReady = true.
// Scenes: cover (police chase in a car), street (on foot downtown),
// mission (mission in progress), night (dusk shootout).
import { PITCH } from './world.js';
import { jackCar, addWanted } from './entities.js';
import { startMission } from './missions.js';

export function setupShot(G, scene) {
  const p = G.player;
  G.state = 'play';
  G.timeOfDay = scene === 'night' ? 'dusk' : 'day';
  if (scene === 'cover') {
    // Police chase: player in a car downtown, 3 stars, 2 cruisers on the tail.
    const car = G.parked[0] || G.traffic[0];
    if (car) {
      car.x = 6 * PITCH; car.y = 6 * PITCH; car.angle = 0;
      p.x = car.x; p.y = car.y;
      jackCar(G, car);
      car.speed = 300;
    }
    p.wanted = 3; p.lastCrime = G.time;
    G.missions.phase = 'active'; G.missions.index = 1;
    G.missions.timer = 62;
    G.missions.target = { x: 11 * PITCH, y: 11 * PITCH, label: 'MARINA DROP' };
    G.missions.text = 'Drive to the MARINA DROP — 62s left';
    G.missions.sub = 'Lose the tail. The package has to get there.';
    // fast-forward: chase develops, traffic flows
    for (let i = 0; i < 90; i++) G.tick(1 / 60, { up: true, down: false, left: false, right: false, brake: false });
    car.speed = 320;
  } else if (scene === 'street') {
    p.x = 5 * PITCH + 30; p.y = 5 * PITCH + 20; p.aimAngle = -0.4;
    p.hp = 100; p.armor = 50; p.cash = 1250; p.wanted = 0;
    G.missions.text = 'Free roam — press ENTER to start the next job';
    G.missions.sub = 'Explore Port Mercer. Jack a car with E.';
    for (let i = 0; i < 60; i++) G.tick(1 / 60, { up: false, down: false, left: false, right: false, brake: false });
  } else if (scene === 'mission') {
    const car = G.parked[1] || G.traffic[1];
    if (car) {
      car.x = 4 * PITCH; car.y = 7 * PITCH; car.angle = Math.PI / 2;
      p.x = car.x; p.y = car.y;
      jackCar(G, car);
      car.speed = 240;
    }
    G.missions.phase = 'active'; G.missions.index = 1;
    G.missions.target = { x: 11 * PITCH, y: 11 * PITCH, label: 'MARINA DROP' };
    G.missions.timer = 58;
    G.missions.text = 'Drive to the MARINA DROP — 58s left';
    G.missions.sub = 'Follow the yellow marker. Stay in the car.';
    for (let i = 0; i < 45; i++) G.tick(1 / 60, { up: true, down: false, left: false, right: false, brake: false });
  } else if (scene === 'night') {
    // Dusk shootout: on foot, pistol out, muzzle flash, 2 stars, cruiser + peds fleeing.
    p.x = 6 * PITCH + 40; p.y = 6 * PITCH - 20; p.aimAngle = 0.5;
    p.hp = 78; p.armor = 25; p.ammo = 9; p.cash = 2100; p.wanted = 2; p.lastCrime = G.time;
    G.muzzle = 1;
    G.missions.phase = 'active'; G.missions.index = 2;
    G.missions.timer = 31;
    G.missions.target = { x: 11 * PITCH, y: 2 * PITCH, label: 'BEACH DROP' };
    G.missions.text = 'Survive the heat — 31s';
    G.missions.sub = 'Wanted 2 stars. The beach drop is north.';
    for (let i = 0; i < 30; i++) G.tick(1 / 60, { up: false, down: false, left: false, right: false, brake: false });
    G.muzzle = 1;
    // one bullet in flight for the shot
    G.bullets.push({ x: p.x + 60, y: p.y + 30, vx: 700, vy: 350, life: 0.4 });
  }
  G.camera.x = p.x; G.camera.y = p.y;
  window.__shotReady = true;
}
