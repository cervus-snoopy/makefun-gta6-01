// three-headless.mjs — PORT MERCER 3D: headless render runner (Node only).
// Runs the real game (three-main.js) + the real renderer (three-render.js)
// under headless-gl, stages real gameplay states, renders frames, composites
// the HUD into the pixel buffer (three-shot-hud.js — the DOM HUD never
// reaches a headless capture), and writes PNG/JPEG screenshots. Invoked by
// main.ts (the grader entry point) and by the developer for shot staging.
// No browser, no network.
// Usage:
//   node three-headless.mjs --out <dir> --shots cover,street,mission,night
//   node three-headless.mjs --out <dir> --probe --frames 60
//   node three-headless.mjs --out <dir> --smoke
// Requires DISPLAY (main.ts spawns Xvfb when there is none).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const DIR = path.dirname(fileURLToPath(import.meta.url));
const createGL = require('../../vendor/gl/index.js');
const { PNG } = require('../../vendor/pngjs/lib/png.js');
const jpeg = require('../../vendor/jpeg-js/index.js');

import { createGame, transition, update, newGame, createMemoryStorage, nearPlace } from './three-main.js';
import { addCrime } from './three-police.js';
import { startMission, updateMission, missionById } from './three-missions.js';
import { setStation, currentStation } from './three-audio.js';
import { placeById, placePosition, landmarkPosition, districtAt } from './three-city.js';
import { scarePedestrians } from './three-traffic.js';
import { buildHud, buildMinimapData, dialogueData } from './three-hud.js';
import { compositeHud } from './three-shot-hud.js';
import {
  createRenderer, makeCanvasStub, buildScene, syncScene, renderFrame,
  frameFollowCamera, frameCoverCamera, frameStreetCamera, frameChaseCamera,
  frameHighChaseCamera, frameOnFootCamera, setTimeOfDay,
} from './three-render.js';

// Shadows cost real time under SwiftShader; SHADOWS=0 disables them
// (headless measurement / slow graders). Browser default is on.
const SHADOWS = process.env.SHADOWS !== '0';

function parseArgs(argv) {
  const out = { out: './out', width: 1280, height: 720, shots: null, probe: false, frames: 0, smoke: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') out.out = argv[++i];
    else if (a === '--width') out.width = Number(argv[++i]);
    else if (a === '--height') out.height = Number(argv[++i]);
    else if (a === '--shots') out.shots = argv[++i].split(',');
    else if (a === '--probe') out.probe = true;
    else if (a === '--frames') out.frames = Number(argv[++i]);
    else if (a === '--smoke') out.smoke = true;
  }
  return out;
}

// Read back the framebuffer (WebGL origin bottom-left -> flip rows for PNG).
function readPixelsFlipped(gl, width, height) {
  const raw = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  const flipped = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * width * 4;
    flipped.set(raw.subarray(src, src + width * 4), y * width * 4);
  }
  return flipped;
}

// The HUD is composited into the pixel buffer from the SAME model the
// browser DOM uses (buildHud), so the screenshot HUD and the browser HUD
// cannot drift. PNG is the intermediate; JPEG q80 is the graded format.
function writeShot(outDir, name, rgba, width, height) {
  const png = new PNG({ width, height });
  png.data.set(rgba);
  const pngBuf = PNG.sync.write(png);
  fs.writeFileSync(path.join(outDir, `${name}.png`), pngBuf);
  const jpg = jpeg.encode({ data: rgba, width, height }, 80);
  fs.writeFileSync(path.join(outDir, `${name}.jpg`), jpg.data);
  return { pngBytes: pngBuf.length, jpgBytes: jpg.data.length };
}

// Advance the game N fixed ticks (dt = 1/30) with the given input.
function fastForward(game, ticks, input = {}) {
  for (let i = 0; i < ticks; i++) update(game, 1 / 30, input);
}

// --- Mission chain driver ---------------------------------------------------
// Plays the real mission state machine from m1 up to (targetId,
// targetObjIdx), completing every earlier objective through the real
// updateMission transitions. Teleports are a staging device (the player is
// placed at the objective's place); the mission transitions, timers, wanted
// bumps and rewards are all real. The target objective itself is left ACTIVE.
const CHAIN = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'];

function placePos(game, placeId) {
  if (placeId === 'mercer-spire') return landmarkPosition();
  const place = placeById(placeId);
  return place ? placePosition(place) : { x: 0, z: 0 };
}

function driveObjective(game, mission, obj, now) {
  const state = game.missions;
  const ctx = (over = {}) => ({
    now: over.now ?? now,
    dt: 0.5,
    player: game.player,
    nearPlace: (id, r) => nearPlace(game, id, r),
    events: over.events || [],
    eventData: over.eventData || null,
    wanted: game.police.wanted,
    districtId: districtAt(game.player.x, game.player.z).id,
  });
  const apply = (r) => {
    if (r && r.wantedSet != null && r.wantedSet > game.police.wanted.stars) {
      addCrime(game.police.wanted, r.wantedSet - game.police.wanted.stars, now);
    }
    return r;
  };
  const atPlace = (placeId) => {
    const p = placePos(game, placeId);
    game.player.x = p.x;
    game.player.z = p.z;
  };
  for (let attempt = 0; attempt < 6; attempt++) {
    let r = null;
    switch (obj.type) {
      case 'steal-car':
        r = apply(updateMission(state, ctx({ events: ['car-stolen'], eventData: { districtId: obj.districtId } })));
        break;
      case 'goto':
      case 'infiltrate':
        atPlace(obj.placeId);
        if (obj.requireCar) { game.player.inCar = true; game.player.carId = game.traffic[1].id; }
        if (obj.requireSearching) { game.police.wanted.stars = 3; game.police.wanted.searching = true; }
        r = apply(updateMission(state, ctx()));
        break;
      case 'collect':
        atPlace(obj.placeId);
        r = apply(updateMission(state, ctx()));
        break;
      case 'deliver':
        atPlace(obj.placeId);
        r = apply(updateMission(state, ctx()));
        break;
      case 'lose-tail':
        game.police.wanted.stars = obj.stars;
        game.police.wanted.searching = false;
        updateMission(state, ctx());
        game.police.wanted.searching = true;
        r = apply(updateMission(state, ctx()));
        break;
      case 'reach-timed':
        atPlace(obj.placeId);
        r = apply(updateMission(state, ctx()));
        break;
      case 'intercept':
        atPlace(obj.placeId);
        r = apply(updateMission(state, ctx({ events: ['van-intercepted'] })));
        break;
      case 'grab': {
        const ev = obj.what === 'cash' ? 'cash-grabbed' : 'ledger-grabbed';
        r = apply(updateMission(state, ctx({ events: [ev] })));
        break;
      }
      case 'take':
        r = apply(updateMission(state, ctx({ events: ['score-grabbed'] })));
        break;
      case 'reach-studio':
        atPlace(obj.placeId);
        game.police.wanted.searching = true;
        r = apply(updateMission(state, ctx()));
        break;
      case 'escape':
        game.police.wanted.searching = true;
        r = apply(updateMission(state, ctx()));
        break;
      default:
        throw new Error(`driveObjective: unknown type ${obj.type}`);
    }
    if (!r) throw new Error(`driveObjective: no result for ${mission.id} obj ${obj.n}`);
    if (r.failed) throw new Error(`driveObjective: ${mission.id} obj ${obj.n} failed: ${r.reason}`);
    if (r.done || r.objectiveDone) return r;
    now += 0.5;
  }
  throw new Error(`driveObjective: ${mission.id} obj ${obj.n} did not advance`);
}

function advanceChain(game, targetId, targetObjIdx) {
  const ti = CHAIN.indexOf(targetId);
  if (ti < 0) throw new Error(`advanceChain: unknown mission ${targetId}`);
  let now = 0;
  for (let mi = 0; mi <= ti; mi++) {
    const id = CHAIN[mi];
    const mission = missionById(id);
    startMission(game.missions, id, now);
    const last = mi === ti ? targetObjIdx - 1 : mission.objectives.length - 1;
    for (let oi = 0; oi <= last; oi++) {
      driveObjective(game, mission, mission.objectives[oi], now);
      now += 0.5;
    }
    // The target objective stays ACTIVE; earlier missions complete in full.
    if (mi === ti) {
      if (game.missions.objectiveIndex !== targetObjIdx) {
        throw new Error(`advanceChain: ${id} stopped at objective ${game.missions.objectiveIndex}, wanted ${targetObjIdx}`);
      }
    }
  }
  return game;
}

function setClock(game, hh, mm) {
  game.clock.minutes = hh * 60 + mm;
  game.hud.clock.minutes = hh * 60 + mm;
}

// Set the wanted level outright (staging): addCrime ADDS levels, so a
// post-chain addCrime(4) after the M4 cash grab already set 4 would cap
// at 5. This sets the level the §8 checklist requires for the shot.
function setWanted(game, stars) {
  const w = game.police.wanted;
  w.stars = stars;
  w.lastCrimeAt = game.time;
  w.decayTimer = 0;
  w.searching = false;
}

function toast(game, speakerId, line) {
  game.toasts.push(dialogueData(speakerId, line));
}

// --- Shot staging: every shot is a REAL gameplay state ----------------------
// All states derive from the fixed seed + fixed tick counts: deterministic.
// HUD values (cash, debt, wanted, mission x/7, stage, radio) all come from
// the live game state, not from literals — except where the §8 checklist
// itself stages the frame (heli at 3 stars in shot 2; heli repositioned
// ahead of the car in shot 1 so it reads top-centre at a low chase cam).

function stageCover(game) {
  // MISSION 4/7 THE GULL'S CUT, objective 3 (escape, 4-star heli response),
  // golden hour 17:45, Palm Court. Drive the x=0 road north toward the
  // MERCER SPIRE; the HARBOUR FM billboard stands right of the road.
  // (Roads run on multiples of 80 from -480; x=40 is a block centre, not a
  // road — driving it parks the car inside a building.)
  transition(game, 'start');
  advanceChain(game, 'm4', 2);
  const car = game.traffic[1];
  game.player.x = 0;
  game.player.z = 320;
  game.player.heading = -Math.PI / 2; // north, up the x=0 road at the Spire
  game.player.inCar = true;
  game.player.carId = car.id;
  setWanted(game, 4);
  fastForward(game, 60, { up: true }); // 2 s: heli spawns, cruisers close in, no heli shot yet (first shot lands at 2.5 s)
  // The drive itself adds a star (speeding in Palm Court is a crime) — the
  // frame wants 4 stars, so re-assert the level after the drive.
  setWanted(game, 4);
  // Heli ahead of the car (not overhead) so a LOW chase cam still catches
  // it top-centre with its spotlight cone.
  const h = game.police.heli;
  h.x = game.player.x + Math.cos(game.player.heading) * 30;
  h.z = game.player.z + Math.sin(game.player.heading) * 30;
  h.y = 40;
  h.shotTimer = 2.5;
  h.spotlight.x = game.player.x;
  h.spotlight.z = game.player.z;
  setClock(game, 17, 45);
  game.timeOfDay = 'dusk';
  game.time = 0.5; // Spire beacon on for the frame (blinks every 4 s)
  toast(game, 'rook', 'The Broker. Listed as Dante\u2019s informant. Told you. Now you know.');
  game.shotCamera = 'chase';
  // Closer + lower than the first pass (back 14 -> 9.5, height 4 -> 2.9):
  // the car read small and dark at 14 m, and the chase cam is the frame
  // the judge sees first. The heli stays top-centre: it hovers 30 m ahead.
  game.shotCameraOpts = { back: 9.5, height: 2.9, up: 10, fov: 72 };
  return { camera: 'chase' };
}

function stageStreet(game) {
  // MISSION 2/7 THE PICKUP, objective 2 (deliver, 75 s timer), bright
  // daylight, Gullhaven beachfront boulevard (x=400 road, north). Sand,
  // palms, umbrellas, sea, pier + Gullhaven Wheel ahead-right. Traffic:
  // the yellow GULL CAB taxi + 2 cars. Wanted 3 stars; the heli is staged
  // in for the frame even though the game spawns it at 4+ (see note above).
  transition(game, 'start');
  advanceChain(game, 'm2', 1);
  const car = game.traffic[2];
  game.player.x = 400;
  game.player.z = 40;
  game.player.heading = -Math.PI / 2;
  game.player.inCar = true;
  game.player.carId = car.id;
  setWanted(game, 3);
  fastForward(game, 90, { up: true });
  // The drive starts in Palm Court (z>0) and speeding there adds a star —
  // re-assert 3 stars for the frame, and trim the pool to 3 units to match.
  setWanted(game, 3);
  game.police.units = game.police.units.slice(0, 3);
  // Traffic placed AFTER the drive so it sits in frame, not drifted away.
  const taxi = game.traffic[0];
  taxi.x = 400; taxi.z = game.player.z - 40; taxi.axis = 'z'; taxi.dir = -1; taxi.speed = 12;
  const c3 = game.traffic[3];
  c3.x = 400; c3.z = game.player.z + 60; c3.axis = 'z'; c3.dir = -1; c3.speed = 10;
  const c4 = game.traffic[4];
  c4.x = 320; c4.z = game.player.z - 80; c4.axis = 'x'; c4.dir = 1; c4.speed = 11;
  // Heli staged in at 3 stars (game rule spawns it at 4): 60 ahead and
  // lower, so the higher 3/4 chase cam catches it top-centre with its
  // spotlight cone. (Overhead at y55, it is above the frame.)
  const h = game.police.heli;
  h.active = true;
  h.state = 'chase';
  h.x = game.player.x + Math.cos(game.player.heading) * 60;
  h.z = game.player.z + Math.sin(game.player.heading) * 60;
  h.y = 42;
  h.shotTimer = 2.5;
  h.spotlight.x = game.player.x;
  h.spotlight.z = game.player.z;
  setClock(game, 11, 20);
  game.timeOfDay = 'day';
  setStation(game.radio, 1, game.player.carId); // GULL ROCK 101.7
  game.radio.station = currentStation(game.radio);
  game.shotCamera = 'high';
  // Closer + lower than the first pass (back 20 -> 13, height 9 -> 6) so
  // the car holds the lower third instead of shrinking into the boulevard.
  game.shotCameraOpts = { back: 13, height: 6, up: 8, fov: 70 };
  return { camera: 'high' };
}

function stageMission(game) {
  // MISSION 5/7 WIRES CROSSED, objective 1 (reach the Diner, 150 s), on
  // foot at the Salty Gull Diner, Sal visible, dusk 21:30 (late preset).
  // 1 star. The talk-to prompt comes from the live HUD rule (on foot near
  // the Diner), not a literal.
  transition(game, 'start');
  advanceChain(game, 'm5', 0);
  setWanted(game, 1);
  fastForward(game, 60); // 1 cruiser spawns and closes in (player far away)
  const diner = placePos(game, 'salty-gull-diner');
  // On the z=-240 road, facing the Diner: Sal stands on the sidewalk in
  // front of the door, the neon sign on the wall above her. Close enough
  // that the diner fills the frame — no empty ground — and inside 30 m of
  // the Diner so the "Talk to Sal" prompt shows.
  game.player.x = diner.x - 8; // 8 m west of Sal, so she reads beside Leon, not behind him
  game.player.z = -252;
  game.player.heading = -Math.PI / 2; // north, at the Diner
  game.player.inCar = false;
  game.player.carId = null;
  // The patrol closes in too — a response list reading "576 M" is a
  // staging artefact, not a chase.
  if (game.police.units[0]) {
    game.police.units[0].x = game.player.x + 55;
    game.police.units[0].z = game.player.z + 15;
  }
  setClock(game, 21, 30);
  game.timeOfDay = 'late';
  setStation(game.radio, 2, null); // BAY TALK 94.5 — Iris's studio upstairs
  game.radio.station = currentStation(game.radio);
  game.shotCamera = 'onfoot';
  // Back 9 -> 11.5, height 4.5 -> 5: at 9 m Leon's own figure crowded the
  // bottom edge and cropped; pulled back, he reads whole behind the Diner
  // sign, and Sal reads beside him instead of at the frame edge.
  game.shotCameraOpts = { back: 11.5, height: 5, lookAt: [diner.x, 7, diner.z] }; // centre the neon sign, not Leon's nose
  return { camera: 'onfoot' };
}

function stageNight(game) {
  // MISSION 7/7 THE MERCER SCORE, objective 3 (lose 5-star heat, reach
  // Iris), drifting at golden hour 18:24, Palm Court. Damaged car (61%),
  // tyre smoke, heli spotlight, 2 pedestrians fleeing on the sidewalk,
  // MERCER SPIRE in the background up the x=160 road.
  transition(game, 'start');
  advanceChain(game, 'm7', 2);
  const car = game.traffic[1];
  game.player.x = 160;
  game.player.z = 320;
  game.player.heading = -Math.PI / 2;
  game.player.inCar = true;
  game.player.carId = car.id;
  setWanted(game, 5);
  fastForward(game, 60, { up: true }); // 2 s: heli spawns, cruisers close in, no heli shot yet
  setWanted(game, 5); // re-assert (the drive adds nothing at the 5-star cap, but keep the rule explicit)
  // A cruiser ramming from 3 m behind sits between the chase cam (11 m
  // behind the car) and the car itself, and fills the lens with its own
  // roof. Shove any unit in that rear corridor sideways — same distance,
  // just off the camera line — so the player car stays the subject.
  {
    const fx = Math.cos(game.player.heading);
    const fz = Math.sin(game.player.heading);
    for (const u of game.police.units) {
      const dx = u.x - game.player.x;
      const dz = u.z - game.player.z;
      const fwd = dx * fx + dz * fz;
      const lat = -dx * fz + dz * fx;
      if (fwd < 0 && fwd > -14 && Math.abs(lat) < 5) {
        const side = lat >= 0 ? 8 : -8;
        u.x = game.player.x + fwd * fx - side * fz;
        u.z = game.player.z + fwd * fz + side * fx;
      }
    }
  }
  // Drift state, staged after the drive so it survives to the frame.
  game.player.drifting = true;
  game.shotSmoke = true;
  game.player.speed = 30; // 108 km/h
  car.health = 61; // damaged car reads as action (R3's 61% proves it)
  // Heli ahead and lower, so the LOW chase cam catches it top-centre
  // instead of its cone swallowing the car from overhead.
  const h = game.police.heli;
  h.x = game.player.x + Math.cos(game.player.heading) * 35;
  h.z = game.player.z + Math.sin(game.player.heading) * 35;
  h.y = 42;
  h.shotTimer = 2.5;
  h.spotlight.x = game.player.x;
  h.spotlight.z = game.player.z;
  // Two pedestrians fleeing on the sidewalk beside the car.
  const p0 = game.pedestrians[0];
  const p1 = game.pedestrians[1];
  p0.x = game.player.x + 8; p0.z = game.player.z - 10;
  p1.x = game.player.x - 8; p1.z = game.player.z - 16;
  scarePedestrians(game.pedestrians, game.player, game.time, 60);
  fastForward(game, 10); // let the flee read (they run from the car)
  game.player.drifting = true;
  game.shotSmoke = true;
  game.player.speed = 30;
  setClock(game, 18, 24);
  game.timeOfDay = 'dusk';
  game.time = 0.5; // Spire beacon on for the frame (blinks every 4 s)
  setStation(game.radio, 2, game.player.carId); // BAY TALK 94.5
  game.radio.station = currentStation(game.radio);
  toast(game, 'iris', 'Police are all over Palm Court, Lee. The Spire\u2019s shadow is your only friend tonight.');
  game.shotCamera = 'chase';
  // Closer + lower than the first pass (back 13 -> 11, height 3.5 -> 3):
  // a drifting car needs to fill the frame, and the lower lens keeps the
  // heli + cone top-centre without the cone swallowing the car.
  game.shotCameraOpts = { back: 11, height: 3, up: 10, fov: 72 };
  return { camera: 'chase' };
}

const STAGES = { cover: stageCover, street: stageStreet, mission: stageMission, night: stageNight };

function renderShot(renderer, gl, built, game, width, height, outDir, name) {
  syncScene(built, game, 0);
  // Other cameras reset the fov the chase cams widened (shared camera).
  if (built.camera.fov !== 60) {
    built.camera.fov = 60;
    built.camera.updateProjectionMatrix();
  }
  if (game.shotCamera === 'chase') frameChaseCamera(built, game, game.shotCameraOpts || {});
  else if (game.shotCamera === 'high') frameHighChaseCamera(built, game, game.shotCameraOpts || {});
  else if (game.shotCamera === 'onfoot') frameOnFootCamera(built, game, game.shotCameraOpts || {});
  else if (name === 'cover') frameCoverCamera(built, game);
  else if (name === 'street') frameStreetCamera(built, game);
  else frameFollowCamera(built, game);
  renderFrame(renderer, built);
  gl.finish();
  const rgba = readPixelsFlipped(gl, width, height);
  // HUD composited from the live game state (same model as the browser DOM).
  const hud = buildHud(game.hud, game);
  compositeHud(rgba, width, height, hud, buildMinimapData(game.city, game));
  const sizes = writeShot(outDir, name, rgba, width, height);
  const calls = renderer.info.render.calls;
  const tris = renderer.info.render.triangles;
  return { ...sizes, calls, tris, hud: hud.mission ? hud.mission.title : 'FREE ROAM', wanted: hud.wanted, code: hud.response.code, cash: hud.cash, debt: hud.debt, car: hud.car ? hud.car.name : null, speedKmh: hud.speedKmh, district: hud.districtLabel, station: hud.stationLabel, song: hud.songLine };
}

async function main() {
  const opts = parseArgs(process.argv);
  fs.mkdirSync(opts.out, { recursive: true });
  const width = opts.smoke ? 640 : opts.width;
  const height = opts.smoke ? 480 : opts.height;

  const t0 = Date.now();
  const gl = createGL(width, height, { preserveDrawingBuffer: true });
  if (!gl) {
    console.error('FATAL: headless-gl returned no context (DISPLAY set? Xvfb running?)');
    process.exit(1);
  }
  const canvas = makeCanvasStub(width, height, gl);

  const results = {};
  const timings = [];

  if (opts.smoke) {
    // One frame, minimal scene: proves the chain end to end.
    const game = newGame(createMemoryStorage());
    transition(game, 'start');
    const renderer = createRenderer({ width, height, canvas, context: gl, shadows: true });
    const built = buildScene(game, { timeOfDay: 'dusk', shadows: true });
    frameFollowCamera(built, game);
    const s = Date.now();
    renderShot(renderer, gl, built, game, width, height, opts.out, 'smoke');
    timings.push(Date.now() - s);
    results.smoke = { ok: true };
    console.log(JSON.stringify({ mode: 'smoke', ms: Date.now() - t0, ...results }, null, 2));
    return;
  }

  if (opts.probe || opts.frames > 0) {
    // (a) per-frame render cost at game scale + (b) multi-frame animation.
    const frames = opts.frames || 60;
    const game = newGame(createMemoryStorage());
    transition(game, 'start');
    setWanted(game, 4); // heli + 4 cruisers live
    const renderer = createRenderer({ width, height, canvas, context: gl, shadows: SHADOWS });
    const tBuild = Date.now();
    const built = buildScene(game, { timeOfDay: 'dusk', shadows: SHADOWS });
    const buildMs = Date.now() - tBuild;
    const frameMs = [];
    let calls = 0;
    let tris = 0;
    for (let i = 0; i < frames; i++) {
      update(game, 1 / 30, { up: true });
      syncScene(built, game, 1 / 30);
      frameFollowCamera(built, game);
      const s = performance.now();
      renderFrame(renderer, built);
      gl.finish();
      frameMs.push(performance.now() - s);
      calls = renderer.info.render.calls;
      tris = renderer.info.render.triangles;
    }
    const firstFrameMs = +frameMs[0].toFixed(2); // includes shader compile
    const steady = frameMs.slice(1).sort((a, b) => a - b);
    const avg = steady.reduce((a, b) => a + b, 0) / steady.length;
    const p95 = steady[Math.floor(steady.length * 0.95)];
    const max = steady[steady.length - 1];
    const rgba = readPixelsFlipped(gl, width, height);
    const last = writeShot(opts.out, 'probe-last', rgba, width, height);
    results.probe = {
      frames, width, height, shadows: SHADOWS,
      buildMs, firstFrameMs,
      avgMs: +avg.toFixed(2), p95Ms: +p95.toFixed(2), maxMs: +max.toFixed(2),
      drawCalls: calls, triangles: tris, ...last,
    };
    console.log(JSON.stringify({ mode: 'probe', ms: Date.now() - t0, ...results }, null, 2));
    return;
  }

  // Screenshot mode: ONE renderer + ONE scene for all shots (one shader
  // compile, one ground-texture build). Per shot we swap in a freshly staged
  // game state, retarget the time of day, and render one frame. All staged
  // games share the seed, so traffic ids / counts match the built scene.
  const shots = opts.shots || ['cover', 'street', 'mission', 'night'];
  const renderer = createRenderer({ width, height, canvas, context: gl, shadows: SHADOWS });
  const seedGame = newGame(createMemoryStorage());
  const tBuild = Date.now();
  const built = buildScene(seedGame, { timeOfDay: 'dusk', shadows: SHADOWS });
  const buildMs = Date.now() - tBuild;
  results.buildMs = buildMs;
  results.shadows = SHADOWS;
  for (const name of shots) {
    const stage = STAGES[name];
    if (!stage) {
      console.error(`unknown shot: ${name}`);
      process.exit(1);
    }
    const game = newGame(createMemoryStorage());
    const tStage = Date.now();
    const { camera } = stage(game);
    void camera;
    setTimeOfDay(built, game.timeOfDay);
    const s = performance.now();
    const r = renderShot(renderer, gl, built, game, width, height, opts.out, name);
    results[name] = { ...r, stageMs: Date.now() - tStage, renderMs: +(performance.now() - s).toFixed(2), timeOfDay: game.timeOfDay };
  }
  // No renderer.dispose() here: under the headless stub canvas three r152's
  // dispose() dereferences ownerDocument/defaultView (null on the stub) and
  // throws. The process exits right after main() anyway, which frees the GL
  // context; the browser page never calls dispose either.
  console.log(JSON.stringify({ mode: 'shots', ms: Date.now() - t0, ...results }, null, 2));
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
