// three-browser.js — PORT MERCER 3D: browser boot, input, game loop, HUD DOM.
// Wires three-main.js (game) to three-render.js (three.js scene) in a real
// browser page. All game rules live in the modules; this file only moves
// input in and pixels out.

import * as THREE from '../vendor/three/three.module.min.js';
import {
  createGame, transition, update, newGame, loadInto, save,
  chooseGameEnding, createMemoryStorage,
} from './three-main.js';
import {
  createRenderer, buildScene, syncScene, renderFrame,
  frameFollowCamera, setTimeOfDay,
} from './three-render.js';
import { createSynthEngine, startStation } from './three-audio.js';
import { buildMinimapData, formatCash, formatClock, starDisplay, debtLine } from './three-hud.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const minimapCtx = $('minimap').getContext('2d');

// --- Game + renderer --------------------------------------------------------
const game = createGame(undefined, window.localStorage);
game.synth = createSynthEngine();
let built = null;
let renderer = null;
let lastTimeOfDay = game.timeOfDay;

function initRenderer() {
  renderer = createRenderer({
    width: window.innerWidth,
    height: window.innerHeight,
    canvas,
    context: null, // real browser canvas: three creates its own context
    shadows: true,
    antialias: true,
  });
  built = buildScene(game, { timeOfDay: game.timeOfDay, shadows: true });
  built.camera.aspect = window.innerWidth / window.innerHeight;
  built.camera.updateProjectionMatrix();
}

// --- Input ------------------------------------------------------------------
const keys = {};
const mouse = { x: 0, y: 0, down: false };
let shootQueued = false;

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Enter' && game.state === 'menu') startGame(false);
  if (e.code === 'Escape' && game.state === 'playing') showPause(true);
  else if (e.code === 'Escape' && game.state === 'paused') showPause(false);
  if (e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('mousemove', (e) => {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
});
canvas.addEventListener('mousedown', () => {
  mouse.down = true;
  shootQueued = true;
});
window.addEventListener('mouseup', () => { mouse.down = false; });
window.addEventListener('resize', () => {
  if (!renderer) return;
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  built.camera.aspect = window.innerWidth / window.innerHeight;
  built.camera.updateProjectionMatrix();
});

// Aim: mouse ray onto the ground plane (y = 0) -> world point to shoot at.
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aimPoint = new THREE.Vector3();

function currentAim() {
  raycaster.setFromCamera({ x: mouse.x, y: mouse.y }, built.camera);
  if (raycaster.ray.intersectPlane(groundPlane, aimPoint)) {
    return { x: aimPoint.x - game.player.x, z: aimPoint.z - game.player.z };
  }
  return { x: Math.cos(game.player.heading), z: Math.sin(game.player.heading) };
}

function readInput() {
  return {
    up: !!(keys.KeyW || keys.ArrowUp),
    down: !!(keys.KeyS || keys.ArrowDown),
    left: !!(keys.KeyA || keys.ArrowLeft),
    right: !!(keys.KeyD || keys.ArrowRight),
    punch: !!keys.KeyF,
    jack: !!keys.KeyE,
    brake: !!keys.Space,
    radioOrReload: !!keys.KeyR,
    mute: !!keys.KeyM,
    pause: false, // Esc handled by the keydown listener
    photo: !!keys.KeyP,
    hideHud: !!keys.KeyH,
    timeOfDay: !!keys.KeyT,
    shoot: shootQueued,
    aim: shootQueued ? currentAim() : null,
  };
}

// Edge-triggered keys: consume after one tick so holding R doesn't spam.
function consumeEdgeKeys() {
  keys.KeyE = false;
  keys.KeyF = false;
  keys.KeyR = false;
  keys.KeyM = false;
  keys.KeyP = false;
  keys.KeyH = false;
  keys.KeyT = false;
  shootQueued = false;
}

// --- Menus ------------------------------------------------------------------
function show(el, on) {
  el.style.display = on ? 'flex' : 'none';
}

function startGame(fromSave) {
  if (!renderer) initRenderer();
  if (fromSave && loadInto(game)) {
    // Loaded mid-mission state resumes where the save left off.
  }
  show($('menu'), false);
  show($('gameover'), false);
  show($('pause'), false);
  transition(game, 'start');
  if (game.synth) startStation(game.synth, game.radio, game.police.wanted.stars);
}

function showPause(on) {
  if (on) {
    transition(game, 'pause');
    show($('pause'), true);
  } else {
    transition(game, 'resume');
    show($('pause'), false);
  }
}

$('btn-start').addEventListener('click', () => startGame(false));
$('btn-load').addEventListener('click', () => startGame(true));
$('btn-resume').addEventListener('click', () => showPause(false));
$('btn-save').addEventListener('click', () => { save(game); showPause(false); });
$('btn-quit').addEventListener('click', () => {
  show($('pause'), false);
  game.state = 'menu';
  show($('menu'), true);
});
$('btn-retry').addEventListener('click', () => {
  show($('gameover'), false);
  transition(game, 'retry');
});
$('btn-mute').addEventListener('click', () => { keys.KeyM = true; });
$('btn-broadcast').addEventListener('click', () => pickEnding('broadcast'));
$('btn-burn').addEventListener('click', () => pickEnding('burn'));

function pickEnding(choice) {
  show($('ending'), false);
  chooseGameEnding(game, choice);
}

// --- HUD --------------------------------------------------------------------
// Same model + layout as the screenshot compositor (three-shot-hud.js):
// mission panel + response list top-left, day/cash/stars/weapons top-right,
// circular minimap + bars bottom-left, portrait dialogue bottom-centre,
// radio + car panel bottom-right.
function rgb([r, g, b]) {
  return `rgb(${r},${g},${b})`;
}

function updateHud() {
  const h = game.hud;
  const m = h.mission;
  $('mission-title').textContent = m ? m.title : 'FREE ROAM';
  $('mission-timer').style.display = m && m.timer !== null ? 'block' : 'none';
  if (m && m.timer !== null) $('mission-timer').textContent = `TIMER ${Math.ceil(m.timer)}S`;
  $('stage-label').textContent = m ? `STAGE ${m.stageCurrent}/${m.stageTotal}` : 'STAGE 0/0';
  document.querySelector('#stage-bar > div').style.width = m && m.stageTotal > 0
    ? `${(m.stageCurrent / m.stageTotal) * 100}%`
    : '0%';
  $('objective').textContent = m ? m.objective : h.objectiveText;
  $('hint').textContent = m ? m.hint : '';
  $('next-line').textContent = m ? `NEXT: ${m.next}` : '';
  $('response-header').textContent = `${h.response.label} — ${h.response.count} UNITS · ${h.response.code}`;
  $('response-list').innerHTML = h.response.units.slice(0, 5).map((u) => {
    const cls = (u.status === 'SPOTLIGHT ON YOU' || u.status === 'RAMMING') ? 'ramming' : '';
    return `<div class="resp-row"><span>${u.name} &nbsp; ${u.distM} M</span><span class="${cls}">${u.status}</span></div>`;
  }).join('') + (h.response.count > 5
    ? `<div class="resp-row"><span>+${h.response.count - 5} MORE UNITS IN THE SEARCH ZONE</span></div>`
    : '');
  $('day-time').textContent = `${h.dayLabel} ${formatClock(h.clock)}`;
  $('cash-big').textContent = formatCash(h.cash);
  $('stars-row').innerHTML = starDisplay(h.wanted, h.searching)
    .map((s) => `<span class="${s.hollow ? 'hollow' : s.filled ? '' : 'empty'}">${s.filled ? '★' : '☆'}</span>`)
    .join('');
  $('escalation').textContent = h.escalation;
  $('in-sight').style.display = h.inSight ? 'inline' : 'none';
  $('debt-line').style.display = h.debt > 0 ? 'block' : 'none';
  $('debt-line').textContent = debtLine(h.debt);
  $('weapon-slots').innerHTML = h.weapons.map((w) => {
    const label = w.locked ? `${w.slot} ${w.label} LOCKED` : `${w.slot} ${w.label}${w.ammo ? ` ${w.ammo}` : ''}`;
    const cls = w.locked ? 'locked' : w.selected ? 'selected' : '';
    return `<div class="slot-row ${cls}">${label}</div>`;
  }).join('');
  $('hp-bar').style.width = `${h.health}%`;
  $('hp-num').textContent = h.health;
  $('armor-bar').style.width = `${h.armour}%`;
  $('armor-num').textContent = h.armour;
  $('rep-label').textContent = `REP ${h.rep.level}`;
  $('rep-bar').style.width = `${(h.rep.xp / h.rep.max) * 100}%`;
  $('rep-title').textContent = h.rep.title;
  $('safehouse-line').textContent = 'SAFEHOUSE: CORAL MOTEL';
  $('shop-line').textContent = 'SHOP: BAYVIEW PAWN';
  $('district').textContent = h.districtLabel;
  // Portrait dialogue (latest toast).
  const d = h.dialogue;
  if (d) {
    $('dialogue-box').style.display = 'flex';
    const p = $('portrait');
    p.textContent = d.portrait.initials;
    p.style.background = rgb(d.portrait.bg);
    p.style.color = rgb(d.portrait.fg);
    $('dialogue-name').textContent = d.name.toUpperCase();
    $('dialogue-line').textContent = `“${d.line}”`;
  } else {
    $('dialogue-box').style.display = 'none';
  }
  // Talk-to prompt.
  $('prompt').style.display = h.prompt ? 'block' : 'none';
  if (h.prompt) $('prompt').textContent = h.prompt;
  $('radio-station').textContent = `♪ ${h.stationLabel}${h.muted ? ' (MUTED)' : ''}`;
  $('radio-song').textContent = h.songLine;
  $('car-name').textContent = h.car ? h.car.name : 'ON FOOT';
  document.querySelector('#condition-bar > div').style.width = h.car ? `${h.car.condition}%` : '100%';
  document.querySelector('#condition-bar > div').style.background = h.car && h.car.condition < 70 ? '#e74c3c' : '#2ecc71';
  $('condition-num').textContent = h.car ? `${h.car.condition}%` : '—';
  $('speed-big').textContent = `${h.speedKmh} KM/H`;
  $('gear').textContent = h.gear;
  $('hud').style.display = game.hudHidden || game.photoMode ? 'none' : 'block';

  // Ending choice overlay.
  if (game.missions.status['m7'] === 'choice' && game.state === 'playing') {
    show($('ending'), true);
  }

  // Game over screen.
  if (game.state === 'gameover') {
    $('go-cash').textContent = formatCash(game.missions.cash);
    $('go-missions').textContent = `${game.missions.completed.length} / 7 jobs done`;
    show($('gameover'), true);
  }
}

// --- Minimap (2D canvas over the HUD, circular) ------------------------------
function drawMinimap() {
  const data = buildMinimapData(game.city, game);
  const S = 144;
  const half = data.bounds.half;
  const toMap = (x, z) => [((x + half) / (half * 2)) * S, ((z + half) / (half * 2)) * S];
  const ctx = minimapCtx;
  ctx.clearRect(0, 0, S, S);
  ctx.save();
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(8,12,20,0.9)';
  ctx.fillRect(0, 0, S, S);
  // Sea + sand on the east edge.
  ctx.fillStyle = '#2e86c1';
  ctx.fillRect(((492 + half) / (half * 2)) * S, 0, S, S);
  ctx.fillStyle = '#d6ba8c';
  ctx.fillRect(((470 + half) / (half * 2)) * S, 0, ((492 - 470) / (half * 2)) * S, S);
  // Roads: grid lines.
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 12; i++) {
    const p = (i / 12) * S;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(S, p); ctx.stroke();
  }
  // Landmark star.
  const [lx, lz] = toMap(data.landmark.x, data.landmark.z);
  ctx.fillStyle = '#f1c40f';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('★', lx, lz + 4);
  // Place dots.
  ctx.fillStyle = '#2ecc71';
  for (const p of data.places) {
    const [x, z] = toMap(p.x, p.z);
    ctx.beginPath(); ctx.arc(x, z, 2, 0, Math.PI * 2); ctx.fill();
  }
  // Mission target diamond.
  if (data.missionTarget) {
    const [x, z] = toMap(data.missionTarget.x, data.missionTarget.z);
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.moveTo(x, z - 5); ctx.lineTo(x + 5, z); ctx.lineTo(x, z + 5); ctx.lineTo(x - 5, z);
    ctx.closePath(); ctx.fill();
  }
  // Police blips.
  ctx.fillStyle = '#3498db';
  for (const u of data.police) {
    const [x, z] = toMap(u.x, u.z);
    ctx.beginPath(); ctx.arc(x, z, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  // Heli ring.
  if (data.heli) {
    const [x, z] = toMap(data.heli.x, data.heli.z);
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, z, 7, 0, Math.PI * 2); ctx.stroke();
  }
  // Player arrow.
  const [px, pz] = toMap(data.player.x, data.player.z);
  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(Math.atan2(Math.sin(data.player.heading), Math.cos(data.player.heading)) + Math.PI / 2);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(0, -6); ctx.lineTo(4, 5); ctx.lineTo(-4, 5);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.restore();
}

// --- Main loop ---------------------------------------------------------------
let lastT = performance.now();

function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (game.state === 'playing' && renderer) {
    const input = readInput();
    update(game, dt, input);
    consumeEdgeKeys();
    if (game.timeOfDay !== lastTimeOfDay) {
      setTimeOfDay(built, game.timeOfDay);
      lastTimeOfDay = game.timeOfDay;
    }
    syncScene(built, game, dt);
    if (game.photoMode) {
      // Photo mode: free camera — slow orbit around the player.
      const t = now / 1000;
      built.camera.position.set(
        game.player.x + Math.cos(t * 0.1) * 40,
        24,
        game.player.z + Math.sin(t * 0.1) * 40,
      );
      built.camera.lookAt(game.player.x, 4, game.player.z);
    } else {
      frameFollowCamera(built, game);
    }
    renderFrame(renderer, built);
    updateHud();
    drawMinimap();
  }
}

requestAnimationFrame(loop);
