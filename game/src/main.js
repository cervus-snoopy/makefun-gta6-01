// main.js — PORT MERCER: Leon Bay. Boot, game loop, state machine, input,
// combat, camera, save/load. 2D top-down open-world crime game, Canvas 2D.
import { createWorld, mulberry32, PITCH, WORLD } from './world.js';
import {
  makePlayer, spawnTraffic, spawnParked, spawnPeds, updateTraffic, updatePeds,
  updatePolice, updateWanted, updatePlayerOnFoot, updatePlayerDriving,
  nearestCar, jackCar, exitCar, damagePlayer, addWanted,
} from './entities.js';
import { makeMissions, updateMissions, startMission, MISSION_DEFS, STORY_INTRO } from './missions.js';
import { drawWorld, updateHUD, drawMinimap, createParticles } from './render.js';
import { createAudio } from './audio.js';
import { setupShot } from './shots.js';

const SAVE_KEY = 'portmercer-save-v1';
const params = new URLSearchParams(location.search);
const SEED = parseInt(params.get('seed') || '7', 10) || 7;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const audio = createAudio();
let vw = 1280, vh = 720;

function resize() {
  vw = window.innerWidth; vh = window.innerHeight;
  canvas.width = vw; canvas.height = vh;
}
window.addEventListener('resize', resize);
resize();

// --- build the game object ---
const rnd = mulberry32(SEED);
const G = {
  world: createWorld(SEED),
  player: makePlayer(2 * PITCH + 30, 2 * PITCH + 30),
  traffic: [], parked: [], peds: [], police: [],
  bullets: [], skids: [],
  particles: createParticles(),
  missions: makeMissions(),
  camera: { x: 2 * PITCH, y: 2 * PITCH },
  time: 0, timeOfDay: 'day',
  state: 'menu', // menu | play | pause | gameover
  trauma: 0, flashRed: 0, muzzle: 0, gunFiredRecently: 0,
  mouseWorld: null, nearCar: null, toastUntil: 0,
  shake(amount) { this.trauma = Math.min(1, this.trauma + amount); },
  sfx(name) { audio.play(name); },
  toast(msg) {
    const el = document.getElementById('toast');
    if (el) el.textContent = msg;
    this.toastUntil = this.time + 3.5;
  },
  onJack(car) {
    const m = this.missions;
    if (m.phase === 'active' && m.index === 0 && MISSION_DEFS[0].onJack) MISSION_DEFS[0].onJack(this);
  },
  autosave() { saveGame(true); },
};
G.traffic = spawnTraffic(G.world, rnd, 14);
G.parked = spawnParked(G.world, rnd, 10);
G.peds = spawnPeds(G.world, rnd, 26);
window.__game = G; // for debugging / shot checks

// --- input ---
const input = { up: false, down: false, left: false, right: false, brake: false };
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'brake',
};
window.addEventListener('keydown', (e) => {
  audio.init();
  if (KEYMAP[e.code] !== undefined) { input[KEYMAP[e.code]] = true; e.preventDefault(); }
  if (e.code === 'KeyE' && G.state === 'play') interact();
  if (e.code === 'Enter' && G.state === 'play') startMission(G);
  if (e.code === 'Enter' && G.state === 'menu') startGame();
  if (e.code === 'Escape') togglePause();
  if (e.code === 'KeyR') reload();
  if (e.code === 'KeyM') { const m = audio.toggleMute(); G.toast(m ? 'Sound muted' : 'Sound on'); }
  if (e.code === 'KeyF' && G.state === 'play') punch();
});
window.addEventListener('keyup', (e) => {
  if (KEYMAP[e.code] !== undefined) input[KEYMAP[e.code]] = false;
});
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
  const zoom = G.player.inCar ? 0.78 : 1.0;
  G.mouseWorld = {
    x: G.camera.x + (sx - vw / 2) / zoom,
    y: G.camera.y + (sy - vh / 2) / zoom,
  };
});
canvas.addEventListener('mousedown', (e) => {
  audio.init();
  if (G.state === 'play') shoot();
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// --- actions ---
function interact() {
  const p = G.player;
  if (p.inCar) { exitCar(G); return; }
  const car = nearestCar(G, 46);
  if (car) jackCar(G, car);
}

function reload() {
  const p = G.player;
  if (p.inCar || p.ammo >= 12 || p.reserveAmmo <= 0) return;
  const need = 12 - p.ammo;
  const take = Math.min(need, p.reserveAmmo);
  p.ammo += take; p.reserveAmmo -= take;
  audio.play('reload');
}

function punch() {
  const p = G.player;
  if (p.inCar || p.punchCd > 0) return;
  p.punchCd = 0.45;
  audio.play('punch');
  G.shake(0.12);
  const ax = p.x + Math.cos(p.aimAngle || p.angle) * 26;
  const ay = p.y + Math.sin(p.aimAngle || p.angle) * 26;
  for (const ped of G.peds) {
    if (!ped.dead && Math.hypot(ped.x - ax, ped.y - ay) < 26) {
      ped.dead = true;
      G.particles.burst(ped.x, ped.y, '#e74c3c', 10);
      addWanted(G, 1);
    }
  }
  for (const c of G.police) {
    if (!c.wrecked && Math.hypot(c.x - ax, c.y - ay) < 30) {
      c.hp -= 20; G.particles.burst(c.x, c.y, '#f1c40f', 8);
      if (c.hp <= 0) { c.wrecked = true; G.particles.burst(c.x, c.y, '#e67e22', 24); }
    }
  }
}

function shoot() {
  const p = G.player;
  if (p.inCar || p.shootCd > 0) return;
  if (p.ammo <= 0) { punch(); return; }
  p.shootCd = 0.22;
  p.ammo--;
  const a = p.aimAngle || p.angle;
  G.bullets.push({ x: p.x + Math.cos(a) * 24, y: p.y + Math.sin(a) * 24, vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, life: 0.6 });
  G.muzzle = 0.08;
  G.gunFiredRecently = 0.6;
  G.shake(0.14);
  audio.play('shoot');
  addWanted(G, 0); // firing draws attention: ensure at least 1 star if police near
  if (p.wanted === 0) { for (const c of G.police) { if (Math.hypot(c.x - p.x, c.y - p.y) < 500) { p.wanted = 1; p.lastCrime = G.time; break; } } }
}

function updateBullets(dt) {
  for (const b of G.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    // hit police
    for (const c of G.police) {
      if (!c.wrecked && Math.hypot(c.x - b.x, c.y - b.y) < 26) {
        b.life = 0;
        c.hp -= 34;
        G.particles.burst(b.x, b.y, '#f1c40f', 8);
        addWanted(G, 1);
        if (c.hp <= 0) { c.wrecked = true; G.particles.burst(c.x, c.y, '#e67e22', 26); G.shake(0.4); }
        break;
      }
    }
    // hit peds
    for (const ped of G.peds) {
      if (!ped.dead && Math.hypot(ped.x - b.x, ped.y - b.y) < 14) {
        b.life = 0;
        ped.dead = true;
        G.particles.burst(ped.x, ped.y, '#e74c3c', 10);
        addWanted(G, 1);
        break;
      }
    }
  }
  G.bullets = G.bullets.filter(b => b.life > 0);
}

// --- save / load ---
function saveGame(quiet) {
  try {
    const p = G.player;
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: p.cash, hp: p.hp, armor: p.armor, ammo: p.ammo, reserveAmmo: p.reserveAmmo,
      missionIndex: G.missions.index, x: p.x, y: p.y, wanted: p.wanted,
    }));
    if (!quiet) G.toast('Game saved.');
  } catch (e) { /* storage unavailable */ }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) { G.toast('No save found.'); return false; }
    const s = JSON.parse(raw);
    const p = G.player;
    p.cash = s.cash; p.hp = s.hp; p.armor = s.armor; p.ammo = s.ammo; p.reserveAmmo = s.reserveAmmo;
    p.x = s.x; p.y = s.y; p.wanted = s.wanted || 0;
    G.missions.index = Math.min(s.missionIndex || 0, 2);
    G.camera.x = p.x; G.camera.y = p.y;
    G.toast('Save loaded.');
    return true;
  } catch (e) { return false; }
}

// --- state machine ---
function show(id, on) {
  const el = document.getElementById(id);
  if (el) el.style.display = on ? 'flex' : 'none';
}
function startGame() {
  show('menu', false); show('gameover', false);
  G.state = 'play';
  G.missions.text = 'Press ENTER to start the first job';
  G.missions.sub = STORY_INTRO;
  audio.init();
}
function togglePause() {
  if (G.state === 'play') { G.state = 'pause'; show('pause', true); }
  else if (G.state === 'pause') { G.state = 'play'; show('pause', false); }
}
function gameOver() {
  show('gameover', true);
  document.getElementById('go-cash').textContent = '$' + Math.floor(G.player.cash).toLocaleString('en-US');
  document.getElementById('go-missions').textContent = G.missions.index + ' / 3 jobs done';
}

// --- one simulation tick (also used by the shot autopilot) ---
G.tick = function (dt, inp) {
  const p = G.player;
  G.time += dt;
  p.shootCd = Math.max(0, p.shootCd - dt);
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  G.muzzle = Math.max(0, G.muzzle - dt);
  G.gunFiredRecently = Math.max(0, G.gunFiredRecently - dt);
  G.flashRed = Math.max(0, G.flashRed - dt * 1.5);
  G.trauma = Math.max(0, G.trauma - dt * 1.4);
  if (p.inCar) updatePlayerDriving(G, dt, inp);
  else updatePlayerOnFoot(G, dt, inp);
  updateTraffic(G, dt);
  updatePeds(G, dt);
  updateWanted(G, dt);
  updatePolice(G, dt);
  updateBullets(dt);
  updateMissions(G, dt);
  G.particles.update(dt);
  G.nearCar = p.inCar ? null : nearestCar(G, 46);
  // camera follows player with a little look-ahead
  const tx = p.x + (p.inCar ? Math.cos(p.angle) * 60 : 0);
  const ty = p.y + (p.inCar ? Math.sin(p.angle) * 60 : 0);
  G.camera.x += (tx - G.camera.x) * Math.min(1, dt * 5);
  G.camera.y += (ty - G.camera.y) * Math.min(1, dt * 5);
  audio.engine(p.inCar ? p.inCar.speed : 0, !!p.inCar);
  if (p.hp <= 0 && G.state === 'play') gameOver();
};

// --- main loop ---
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (G.state === 'play') G.tick(dt, input);
  else {
    // menu: slow camera drift over the city so the title screen is alive
    G.time += dt;
    G.camera.x += Math.sin(G.time * 0.05) * 0.2;
    G.particles.update(dt);
  }
  drawWorld(ctx, G, vw, vh);
  updateHUD(G);
  drawMinimap(G);
  requestAnimationFrame(frame);
}

// --- menu buttons ---
document.getElementById('btn-start').addEventListener('click', () => { audio.init(); startGame(); });
document.getElementById('btn-load').addEventListener('click', () => { audio.init(); if (loadGame()) { show('menu', false); G.state = 'play'; } });
document.getElementById('btn-resume').addEventListener('click', togglePause);
document.getElementById('btn-save').addEventListener('click', () => saveGame(false));
document.getElementById('btn-quit').addEventListener('click', () => { saveGame(true); show('pause', false); show('menu', true); G.state = 'menu'; });
document.getElementById('btn-retry').addEventListener('click', () => {
  const p = G.player;
  p.hp = 100; p.armor = 50; p.x = 2 * PITCH + 30; p.y = 2 * PITCH + 30;
  if (p.inCar) { p.inCar = null; }
  p.wanted = 0; G.police.length = 0;
  show('gameover', false);
  G.state = 'play';
});
document.getElementById('story').textContent = STORY_INTRO;
document.getElementById('btn-mute').addEventListener('click', () => { audio.init(); const m = audio.toggleMute(); G.toast(m ? 'Sound muted' : 'Sound on'); });

// --- shot autopilot: ?shot=cover|street|mission|night ---
const shot = params.get('shot');
if (shot) {
  setupShot(G, shot);
  // hide menu/pause/game-over overlays: shots show live gameplay, never a title card
  for (const id of ['menu', 'pause', 'gameover']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
  // render one frame immediately so the screenshot is never blank
  drawWorld(ctx, G, vw, vh);
  updateHUD(G);
  drawMinimap(G);
}
requestAnimationFrame(frame);
