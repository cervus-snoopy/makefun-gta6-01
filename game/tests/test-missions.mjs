// test-missions.mjs — PORT MERCER 3D: mission + top-3 checklist tests.
//
// Re-derived from the mission definitions (game/src/three-missions.js),
// the Story Bible v2 (7-mission chain, ledger $8,400) and the top-3 study
// §8 shot checklist. Two suites:
//   fix2 — 22 tests: the mission state machine, the debt ledger, timers,
//            the ending choice, save/load, the side-job economy.
//   top3 — 32 tests: the four staged shots against the §8 checklist
//            (mission x/7, wanted 3–5, heli + spotlight, named radio,
//            district labels, dialogue with a name, response units).
// Run: node game/tests/test-missions.mjs   (exit 0 = all green)
// Pure Node, no browser, no GL: the tests stage real gameplay states
// through the same state machine the headless renderer drives.

import { createGame, transition, update, newGame, createMemoryStorage, nearPlace } from '../src/three-main.js';
import { addCrime } from '../src/three-police.js';
import {
  MISSIONS, CAST, castById, missionById, createMissionState, startMission,
  updateMission, applyReward, chooseEnding, verifyLedger,
  START_DEBT, STARTING_CASH, STORY_TOTAL_GROSS, ENDINGS, SIDE_JOBS,
  createSideJobState, startRace, finishRace, completeDelivery, nextDeliveryLine,
  pullSlots, resprayCost, buyArmour, buyAmmo, sellHotGood,
  saveGame, loadGame, saveData,
} from '../src/three-missions.js';
import { setStation, currentStation } from '../src/three-audio.js';
import { placeById, placePosition, landmarkPosition, districtAt } from '../src/three-city.js';
import { scarePedestrians } from '../src/three-traffic.js';
import {
  buildHud, buildMinimapData, dialogueData,
  SAFEHOUSE_LINE, SHOP_LINE, debtLine, searchingText, starDisplay,
} from '../src/three-hud.js';

// --- Tiny test framework ----------------------------------------------------
const results = [];
function test(suite, name, fn) {
  try {
    fn();
    results.push({ suite, name, ok: true });
    console.log(`PASS ${suite} ${name}`);
  } catch (err) {
    results.push({ suite, name, ok: false, error: err.message });
    console.log(`FAIL ${suite} ${name}: ${err.message}`);
  }
}
function eq(actual, expected, what) {
  if (actual !== expected) throw new Error(`${what}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}
function ok(cond, what) {
  if (!cond) throw new Error(`expected true: ${what}`);
}
function approx(actual, expected, tol, what) {
  if (Math.abs(actual - expected) > tol) throw new Error(`${what}: got ${actual}, want ${expected} ± ${tol}`);
}

// --- Mission driver ---------------------------------------------------------
// Plays the real state machine the way the headless stager does: teleport
// the player to the objective's place (a staging device — the transitions,
// timers, wanted bumps and rewards are all real) and feed each objective
// the event it waits for. `now` advances 0.5 s per call, like the stager.
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
      case 'deliver':
      case 'reach-timed':
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
        throw new Error(`unknown objective type ${obj.type}`);
    }
    if (!r) throw new Error(`no result for ${mission.id} obj ${obj.n}`);
    if (r.failed) throw new Error(`${mission.id} obj ${obj.n} failed: ${r.reason}`);
    if (r.done || r.objectiveDone) return r;
    now += 0.5;
  }
  throw new Error(`${mission.id} obj ${obj.n} did not advance`);
}

function playMission(game, id, now = 0) {
  const mission = missionById(id);
  startMission(game.missions, id, now);
  for (const obj of mission.objectives) {
    driveObjective(game, mission, obj, now);
    now += 0.5;
  }
  return now;
}

// Complete every mission before `targetId`, then complete objectives
// 0..activeObjIdx-1 of the target, leaving objective activeObjIdx ACTIVE.
function playTo(game, targetId, activeObjIdx) {
  const ti = CHAIN.indexOf(targetId);
  if (ti < 0) throw new Error(`unknown mission ${targetId}`);
  let now = 0;
  for (let mi = 0; mi <= ti; mi++) {
    const id = CHAIN[mi];
    const mission = missionById(id);
    startMission(game.missions, id, now);
    const last = mi === ti ? activeObjIdx - 1 : mission.objectives.length - 1;
    for (let oi = 0; oi <= last; oi++) {
      driveObjective(game, mission, mission.objectives[oi], now);
      now += 0.5;
    }
    if (mi === ti) eq(game.missions.objectiveIndex, activeObjIdx, `${id} active objective`);
  }
  return game;
}

function freshGame() {
  const game = newGame(createMemoryStorage());
  transition(game, 'start');
  return game;
}

function setWanted(game, stars) {
  const w = game.police.wanted;
  w.stars = stars;
  w.lastCrimeAt = game.time;
  w.decayTimer = 0;
  w.searching = false;
}

function fastForward(game, ticks, input = {}) {
  for (let i = 0; i < ticks; i++) update(game, 1 / 30, input);
}

function setClock(game, hh, mm) {
  game.clock.minutes = hh * 60 + mm;
  game.hud.clock.minutes = hh * 60 + mm;
}

function toast(game, speakerId, line) {
  game.toasts.push(dialogueData(speakerId, line));
}

// A bare mission-state ctx (no full game) for the state-machine tests.
function bareCtx(state, over = {}) {
  return {
    now: over.now ?? 0,
    dt: over.dt ?? 0.5,
    player: over.player ?? { x: 0, z: 0, inCar: false },
    nearPlace: over.nearPlace ?? (() => false),
    events: over.events ?? [],
    eventData: over.eventData ?? null,
    wanted: over.wanted ?? { stars: 0, searching: false },
    districtId: over.districtId ?? 'old-mercer',
  };
}

// --- fix2: the mission state machine + ledger (22 tests) --------------------

test('fix2', 'F01 seven-missions-in-order', () => {
  eq(MISSIONS.length, 7, 'mission count');
  eq(MISSIONS.map((m) => m.id).join(','), 'm1,m2,m3,m4,m5,m6,m7', 'mission ids');
});

test('fix2', 'F02 every-mission-has-shape', () => {
  for (const m of MISSIONS) {
    ok(m.name && m.act && m.actName && m.giver && m.location && m.route && m.hint, `${m.id} fields`);
    ok(Array.isArray(m.objectives) && m.objectives.length >= 2, `${m.id} objectives`);
    ok(m.reward && typeof m.reward.gross === 'number', `${m.id} reward`);
    ok(typeof m.debtAfter === 'number', `${m.id} debtAfter`);
    m.objectives.forEach((o, i) => eq(o.n, i + 1, `${m.id} objective numbering`));
  }
});

test('fix2', 'F03 every-mission-has-beats', () => {
  for (const m of MISSIONS) {
    ok(m.beats.some((b) => b.when === 'brief'), `${m.id} brief beat`);
    ok(m.beats.some((b) => b.when === 'complete'), `${m.id} complete beat`);
    for (const b of m.beats) {
      ok(b.speaker && b.line && b.line.length > 0, `${m.id} beat shape`);
    }
  }
});

test('fix2', 'F04 beat-speakers-are-cast', () => {
  // 'clerk' is the one minor voice (Coral Motel desk, m2) with no cast card.
  for (const m of MISSIONS) {
    for (const b of m.beats) {
      ok(castById(b.speaker) !== null || b.speaker === 'clerk', `${m.id} speaker ${b.speaker}`);
    }
  }
  eq(CAST.length, 7, 'cast size');
});

test('fix2', 'F05 briefs-are-specific', () => {
  // Every brief names a place, a person, a thing, or an amount — no generic line.
  const specific = /(\$[\d,]+|Rook|Broker|Sal|Kline|Dante|Iris|Leon|Lee|Spire|Diner|Garage|Motel|Pawn|Palm Court|Gullhaven|Old Mercer|Furnace Row|counting house|ledger|coupe|shoebox|van|tile)/;
  for (const m of MISSIONS) {
    const brief = m.beats.find((b) => b.when === 'brief');
    ok(brief.line.length >= 25, `${m.id} brief length`);
    ok(specific.test(brief.line), `${m.id} brief names something: ${brief.line}`);
  }
});

test('fix2', 'F06 ledger-constants', () => {
  eq(START_DEBT, 2500, 'start debt');
  eq(STARTING_CASH, 250, 'starting cash');
  eq(STORY_TOTAL_GROSS, 8400, 'story gross');
});

test('fix2', 'F07 ledger-table', () => {
  const v = verifyLedger();
  eq(v.storyGross, 8400, 'story gross');
  eq(v.debtAfterM4, 0, 'debt after m4');
  eq(v.cashAfterM4, 1850, 'cash after m4 (250 + 1600 kept)');
  const byId = Object.fromEntries(v.rows.map((r) => [r.mission, r]));
  eq(byId.m1.debtAfter, 2000, 'm1 debt');
  eq(byId.m2.debtAfter, 1200, 'm2 debt');
  eq(byId.m3.fee, 700, 'm3 broker fee');
  eq(byId.m3.debtAfter, 400, 'm3 debt');
  eq(byId.m4.toCash, 1600, 'm4 kept');
  eq(byId.m5.gross, 0, 'm5 no cash');
  eq(byId.m6.gross, 600, 'm6 drop');
});

test('fix2', 'F08 m3-fee-skim', () => {
  const s = createMissionState();
  s.debt = 1200;
  const r = applyReward(s, missionById('m3'));
  eq(r.gross, 1500, 'gross');
  eq(r.fee, 700, 'fee');
  eq(r.net, 800, 'net');
  eq(r.toDebt, 800, 'to debt');
  eq(r.debtAfter, 400, 'debt after');
});

test('fix2', 'F09 m4-clears-debt-keeps-1600', () => {
  const s = createMissionState();
  s.debt = 400;
  s.cash = 250;
  const r = applyReward(s, missionById('m4'));
  eq(r.toDebt, 400, 'to debt');
  eq(r.toCash, 1600, 'kept');
  eq(s.debt, 0, 'debt zero');
  eq(s.cash, 1850, 'cash');
});

test('fix2', 'F10 m5-pays-the-ledger-not-cash', () => {
  const s = createMissionState();
  const r = applyReward(s, missionById('m5'));
  eq(r.gross, 0, 'gross');
  eq(r.toCash, 0, 'no cash');
  const game = freshGame();
  playMission(game, 'm1');
  playMission(game, 'm2');
  playMission(game, 'm3');
  playMission(game, 'm4');
  playMission(game, 'm5');
  eq(game.missions.ledger, true, 'ledger held after m5');
});

test('fix2', 'F11 m6-drop-is-leons', () => {
  const s = createMissionState();
  s.debt = 0;
  s.cash = 1850;
  const r = applyReward(s, missionById('m6'));
  eq(r.toCash, 600, 'all 600 to Leon');
  eq(s.cash, 2450, 'cash');
});

test('fix2', 'F12 m7-pays-on-the-choice', () => {
  const game = freshGame();
  playTo(game, 'm7', 2);
  const before = game.missions.cash;
  // Finish the last objective: lose 5-star heat, reach Iris's studio.
  const mission = missionById('m7');
  const obj = mission.objectives[2];
  const p = placePos(game, obj.placeId);
  game.player.x = p.x;
  game.player.z = p.z;
  game.police.wanted.searching = true;
  const r = updateMission(game.missions, {
    now: 0, dt: 0.5, player: game.player,
    nearPlace: (id, rad) => nearPlace(game, id, rad),
    events: [], eventData: null, wanted: game.police.wanted,
    districtId: districtAt(game.player.x, game.player.z).id,
  });
  ok(r.done, 'm7 objectives done');
  eq(game.missions.status.m7, 'choice', 'ending choice open');
  eq(game.missions.cash, before, 'no pay before the choice');
  const chosen = chooseEnding(game.missions, 'broadcast');
  ok(chosen.ok, 'choice accepted');
  eq(chosen.ledger.toCash, 3000, 'payoff $3,000');
  eq(game.missions.ending, 'broadcast', 'ending recorded');
  eq(game.missions.cash, before + 3000, 'cash after choice');
});

test('fix2', 'F13 endings-differ', () => {
  eq(ENDINGS.broadcast.decayMultiplier, 2, 'broadcast decay 2x');
  eq(ENDINGS.burn.decayMultiplier, 1, 'burn decay 1x');
  ok(ENDINGS.broadcast.line !== ENDINGS.burn.line, 'ending lines differ');
  ok(ENDINGS.broadcast.consequence !== ENDINGS.burn.consequence, 'consequences differ');
  eq(ENDINGS.broadcast.line, 'Tonight, Leon Bay learns every name.', 'broadcast line');
});

test('fix2', 'F14 ending-gates', () => {
  const s = createMissionState();
  eq(chooseEnding(s, 'broadcast').ok, false, 'choice before finale');
  const game = freshGame();
  playTo(game, 'm7', 2);
  eq(chooseEnding(game.missions, 'neither').ok, false, 'unknown ending');
});

test('fix2', 'F15 chain-m1-to-m4-clears-debt', () => {
  const game = freshGame();
  playMission(game, 'm1');
  eq(game.missions.currentId, 'm2', 'm2 after m1');
  eq(game.missions.debt, 2000, 'debt after m1');
  eq(game.missions.cash, 250, 'cash after m1 (all to debt)');
  playMission(game, 'm2');
  eq(game.missions.debt, 1200, 'debt after m2');
  playMission(game, 'm3');
  eq(game.missions.debt, 400, 'debt after m3');
  playMission(game, 'm4');
  eq(game.missions.debt, 0, 'debt after m4');
  eq(game.missions.cash, 1850, 'cash after m4');
  eq(game.missions.unlockedRespray, true, 'respray unlocked by m1');
  eq(game.missions.completed.join(','), 'm1,m2,m3,m4', 'completed in order');
});

test('fix2', 'F16 m1-needs-the-car', () => {
  const s = createMissionState();
  startMission(s, 'm1', 0);
  updateMission(s, bareCtx(s, { events: ['car-stolen'], eventData: { districtId: 'old-mercer' } }));
  eq(s.objectiveIndex, 1, 'steal advances');
  const noCar = updateMission(s, bareCtx(s, {
    player: { x: 0, z: 0, inCar: false }, nearPlace: () => true,
  }));
  eq(noCar.done, false, 'no advance on foot');
  eq(s.objectiveIndex, 1, 'still on objective 2');
  const withCar = updateMission(s, bareCtx(s, {
    player: { x: 0, z: 0, inCar: true }, nearPlace: () => true,
  }));
  ok(withCar.done, 'drive it to the garage completes m1');
});

test('fix2', 'F17 m1-needs-the-right-district', () => {
  const s = createMissionState();
  startMission(s, 'm1', 0);
  updateMission(s, bareCtx(s, { events: ['car-stolen'], eventData: { districtId: 'gullhaven' } }));
  eq(s.objectiveIndex, 0, 'wrong district does not advance');
  updateMission(s, bareCtx(s, { events: ['car-stolen'], eventData: { districtId: 'old-mercer' } }));
  eq(s.objectiveIndex, 1, 'old mercer advances');
});

test('fix2', 'F18 m3-lose-tail-needs-searching', () => {
  const s = createMissionState();
  startMission(s, 'm3', 0);
  const wanted = { stars: 2, searching: false };
  updateMission(s, bareCtx(s, { wanted }));
  eq(s.objectiveIndex, 0, '2 stars is not the tail');
  wanted.stars = 3;
  updateMission(s, bareCtx(s, { wanted }));
  eq(s.objectiveIndex, 0, '3 stars but still seen');
  wanted.searching = true;
  updateMission(s, bareCtx(s, { wanted }));
  eq(s.objectiveIndex, 1, 'lost the tail at 3 stars + searching');
  // Objective 2: the Spire drop only counts while SEARCHING (unseen).
  wanted.searching = false;
  updateMission(s, bareCtx(s, { wanted, nearPlace: () => true }));
  eq(s.objectiveIndex, 1, 'seen at the Spire does not count');
  wanted.searching = true;
  const done = updateMission(s, bareCtx(s, { wanted, nearPlace: () => true }));
  ok(done.done, 'unseen at the Spire completes m3');
});

test('fix2', 'F19 m2-delivery-timer-fails', () => {
  const s = createMissionState();
  startMission(s, 'm2', 0);
  updateMission(s, bareCtx(s, { nearPlace: (id) => id === 'bayview-pawn' }));
  eq(s.objectiveIndex, 1, 'collected the shoebox');
  ok(s.objectiveTimer !== null && s.objectiveTimer <= 75, '75 s delivery clock running');
  let failed = null;
  for (let i = 0; i < 200 && !failed; i++) {
    const r = updateMission(s, bareCtx(s, { now: i * 0.5, nearPlace: () => false }));
    if (r.failed) failed = r;
  }
  ok(failed, 'timer expiry fails the mission');
  ok(failed.reason.startsWith('time-up:'), 'time-up reason');
  eq(s.failedCount, 1, 'failed count');
});

test('fix2', 'F20 m5-raid-timer-fails', () => {
  const s = createMissionState();
  startMission(s, 'm5', 0);
  eq(s.objectiveTimer, 150, '150 s raid clock at start');
  let failed = null;
  for (let i = 0; i < 400 && !failed; i++) {
    const r = updateMission(s, bareCtx(s, { now: i * 0.5, nearPlace: () => false }));
    if (r.failed) failed = r;
  }
  ok(failed, 'missing the Diner window fails m5');
});

test('fix2', 'F21 m4-intercept-needs-the-van', () => {
  const s = createMissionState();
  startMission(s, 'm4', 0);
  const near = { v: true };
  updateMission(s, bareCtx(s, { events: [], nearPlace: () => near.v }));
  eq(s.objectiveIndex, 0, 'no van, no intercept');
  updateMission(s, bareCtx(s, { events: ['van-intercepted'], nearPlace: () => near.v }));
  eq(s.objectiveIndex, 1, 'van intercepted');
  const grab = updateMission(s, bareCtx(s, { events: ['cash-grabbed'] }));
  eq(grab.wantedSet, 4, 'cash grab spikes wanted to 4');
  eq(s.objectiveIndex, 2, 'cash grabbed');
});

test('fix2', 'F22 save-load-round-trip', () => {
  const game = freshGame();
  playMission(game, 'm1');
  playMission(game, 'm2');
  const side = createSideJobState();
  side.deliveriesDone = 2;
  ok(saveGame(game.missions, side, game.storage), 'save writes');
  const loaded = loadGame(game.storage);
  ok(loaded, 'load reads');
  eq(loaded.state.cash, game.missions.cash, 'cash survives');
  eq(loaded.state.debt, 1200, 'debt survives');
  eq(loaded.state.currentId, 'm3', 'current mission survives');
  eq(loaded.state.completed.join(','), 'm1,m2', 'completed survives');
  eq(loaded.side.deliveriesDone, 2, 'side jobs survive');
  eq(loadGame(createMemoryStorage()), null, 'empty storage loads nothing');
  game.storage.setItem('portmercer-save-v1', JSON.stringify({ version: 99, saveKey: 'portmercer-save-v1' }));
  eq(loadGame(game.storage), null, 'wrong version loads nothing');
  const data = saveData(game.missions, side);
  eq(data.saveKey, 'portmercer-save-v1', 'save key');
  eq(data.version, 1, 'save version');
});

// --- top3: the four staged shots against the §8 checklist -------------------
// The same staging the headless renderer uses, rebuilt here so the tests
// read the live game state, not literals.

function stageCover(game) {
  playTo(game, 'm4', 2);
  const car = game.traffic[1];
  game.player.x = 0;
  game.player.z = 320;
  game.player.heading = -Math.PI / 2;
  game.player.inCar = true;
  game.player.carId = car.id;
  setWanted(game, 4);
  fastForward(game, 60, { up: true });
  setWanted(game, 4);
  const h = game.police.heli;
  h.x = game.player.x + Math.cos(game.player.heading) * 30;
  h.z = game.player.z + Math.sin(game.player.heading) * 30;
  h.y = 40;
  h.spotlight.x = game.player.x;
  h.spotlight.z = game.player.z;
  setClock(game, 17, 45);
  game.timeOfDay = 'dusk';
  toast(game, 'rook', 'The Broker. Listed as Dante\u2019s informant. Told you. Now you know.');
  return game;
}

function stageStreet(game) {
  playTo(game, 'm2', 1);
  const car = game.traffic[2];
  game.player.x = 400;
  game.player.z = 40;
  game.player.heading = -Math.PI / 2;
  game.player.inCar = true;
  game.player.carId = car.id;
  setWanted(game, 3);
  fastForward(game, 90, { up: true });
  setWanted(game, 3);
  game.police.units = game.police.units.slice(0, 3);
  const h = game.police.heli;
  h.active = true;
  h.state = 'chase';
  h.x = game.player.x + Math.cos(game.player.heading) * 60;
  h.z = game.player.z + Math.sin(game.player.heading) * 60;
  h.y = 42;
  h.spotlight.x = game.player.x;
  h.spotlight.z = game.player.z;
  setClock(game, 11, 20);
  game.timeOfDay = 'day';
  setStation(game.radio, 1, game.player.carId);
  game.radio.station = currentStation(game.radio);
  return game;
}

function stageMission(game) {
  playTo(game, 'm5', 0);
  setWanted(game, 1);
  fastForward(game, 60);
  const diner = placePos(game, 'salty-gull-diner');
  game.player.x = diner.x - 8;
  game.player.z = -252;
  game.player.heading = -Math.PI / 2;
  game.player.inCar = false;
  game.player.carId = null;
  setClock(game, 21, 30);
  game.timeOfDay = 'late';
  setStation(game.radio, 2, null);
  game.radio.station = currentStation(game.radio);
  return game;
}

function stageNight(game) {
  playTo(game, 'm7', 2);
  const car = game.traffic[1];
  game.player.x = 160;
  game.player.z = 320;
  game.player.heading = -Math.PI / 2;
  game.player.inCar = true;
  game.player.carId = car.id;
  setWanted(game, 5);
  fastForward(game, 60, { up: true });
  setWanted(game, 5);
  game.player.drifting = true;
  game.shotSmoke = true;
  game.player.speed = 30;
  car.health = 61;
  const h = game.police.heli;
  h.x = game.player.x + Math.cos(game.player.heading) * 35;
  h.z = game.player.z + Math.sin(game.player.heading) * 35;
  h.y = 42;
  h.spotlight.x = game.player.x;
  h.spotlight.z = game.player.z;
  const p0 = game.pedestrians[0];
  const p1 = game.pedestrians[1];
  p0.x = game.player.x + 8; p0.z = game.player.z - 10;
  p1.x = game.player.x - 8; p1.z = game.player.z - 16;
  scarePedestrians(game.pedestrians, game.player, game.time, 60);
  fastForward(game, 10);
  game.player.drifting = true;
  game.shotSmoke = true;
  game.player.speed = 30;
  setClock(game, 18, 24);
  game.timeOfDay = 'dusk';
  setStation(game.radio, 2, game.player.carId);
  game.radio.station = currentStation(game.radio);
  toast(game, 'iris', 'Police are all over Palm Court, Lee. The Spire\u2019s shadow is your only friend tonight.');
  return game;
}

function shotHud(stageFn) {
  const game = freshGame();
  stageFn(game);
  return { game, hud: buildHud(game.hud, game) };
}

test('top3', 'T01 seven-missions-meets-the-bar', () => {
  // Top-3 titles claim 7, 12 and 7 missions. Six would sit below the bar.
  ok(MISSIONS.length >= 7, 'at least 7 missions');
  eq(MISSIONS.length, 7, 'exactly 7 (one arc, not padding)');
});

test('top3', 'T02 seven-named-cast', () => {
  eq(CAST.length, 7, 'cast size');
  for (const c of CAST) {
    ok(c.name && c.age && c.look && c.speech && c.line, `${c.id} cast card`);
  }
  eq(castById('iris').name, 'Iris Vale', 'iris');
  eq(castById('kline').line, 'I don\u2019t want an arrest, Cross. I want a name.', 'kline line');
});

test('top3', 'T03 every-mission-place-resolves', () => {
  const seen = new Set();
  for (const m of MISSIONS) {
    seen.add(m.location);
    for (const o of m.objectives) if (o.placeId) seen.add(o.placeId);
  }
  for (const id of seen) {
    const okPlace = id === 'mercer-spire' ? landmarkPosition() : placeById(id);
    ok(okPlace, `place resolves: ${id}`);
    if (id !== 'mercer-spire') {
      const p = placePosition(placeById(id));
      ok(Number.isFinite(p.x) && Number.isFinite(p.z), `place coords: ${id}`);
    }
  }
  const spire = landmarkPosition();
  ok(Number.isFinite(spire.x) && Number.isFinite(spire.z), 'spire coords');
});

test('top3', 'T04 districts-are-real', () => {
  // The four shot positions sit in the districts their HUD labels claim.
  const cover = shotHud(stageCover);
  eq(cover.hud.districtLabel, 'PALM COURT', 'cover district');
  const street = shotHud(stageStreet);
  eq(street.hud.districtLabel, 'GULLHAVEN', 'street district');
  const mission = shotHud(stageMission);
  eq(mission.hud.districtLabel, 'GULLHAVEN', 'mission district');
  const night = shotHud(stageNight);
  eq(night.hud.districtLabel, 'PALM COURT', 'night district');
});

test('top3', 'T05 cover-shot', () => {
  const { game, hud } = shotHud(stageCover);
  eq(hud.mission.title, 'MISSION 4/7 THE GULL\u2019S CUT', 'mission panel');
  eq(hud.wanted, 4, 'wanted 4');
  eq(hud.cash, 250, 'cash');
  eq(hud.debt, 400, 'debt');
  eq(hud.districtLabel, 'PALM COURT', 'district');
  eq(hud.clock.minutes, 17 * 60 + 45, 'golden hour 17:45');
  eq(game.timeOfDay, 'dusk', 'dusk');
  eq(hud.stationLabel, 'HARBOUR FM 88.3', 'station');
  ok(hud.songLine.length > 0, 'song line');
  eq(hud.car.name, 'MERCER GT', 'car name');
  eq(hud.speedKmh, 137, 'speed');
  ok(game.police.heli.active, 'heli up');
});

test('top3', 'T06 street-shot-daylight', () => {
  const { game, hud } = shotHud(stageStreet);
  eq(hud.mission.title, 'MISSION 2/7 THE PICKUP', 'mission panel');
  eq(hud.wanted, 3, 'wanted 3');
  eq(hud.clock.minutes, 11 * 60 + 20, 'daylight 11:20');
  eq(game.timeOfDay, 'day', 'day');
  eq(hud.stationLabel, 'GULL ROCK 101.7', 'race station');
  // The 75 s delivery clock is live: 3 s of driving have already ticked.
  ok(hud.mission.timer !== null && hud.mission.timer > 0 && hud.mission.timer <= 75, `delivery timer live: ${hud.mission.timer}`);
  approx(hud.mission.timer, 72, 0.01, 'timer after 3 s of driving');
  ok(game.police.heli.active, 'heli staged in at 3 stars');
});

test('top3', 'T07 mission-shot-on-foot', () => {
  const { game, hud } = shotHud(stageMission);
  eq(hud.mission.title, 'MISSION 5/7 WIRES CROSSED', 'mission panel');
  eq(hud.wanted, 1, 'wanted 1');
  eq(hud.car, null, 'on foot');
  eq(hud.speedKmh, 0, 'standing still');
  eq(hud.clock.minutes, 21 * 60 + 30, 'dusk 21:30');
  eq(game.timeOfDay, 'late', 'late');
  eq(hud.stationLabel, 'BAY TALK 94.5', 'iris upstairs');
  ok(hud.prompt && hud.prompt.includes('Sal'), `talk-to prompt: ${hud.prompt}`);
});

test('top3', 'T08 night-shot-finale', () => {
  const { game, hud } = shotHud(stageNight);
  eq(hud.mission.title, 'MISSION 7/7 THE MERCER SCORE', 'mission panel');
  eq(hud.wanted, 5, 'wanted 5');
  eq(hud.clock.minutes, 18 * 60 + 24, 'golden hour 18:24');
  eq(game.timeOfDay, 'dusk', 'dusk');
  eq(hud.car.condition, 61, 'damaged car reads as action');
  eq(hud.speedKmh, 108, 'speed');
  eq(hud.stationLabel, 'BAY TALK 94.5', 'station');
  ok(game.player.drifting, 'drifting');
});

test('top3', 'T09 wanted-3-to-5-in-driving-shots', () => {
  for (const [name, fn] of [['cover', stageCover], ['street', stageStreet], ['night', stageNight]]) {
    const { hud } = shotHud(fn);
    ok(hud.wanted >= 3 && hud.wanted <= 5, `${name} wanted ${hud.wanted}`);
  }
});

test('top3', 'T10 heli-in-shots-1-2-4', () => {
  for (const [name, fn] of [['cover', stageCover], ['street', stageStreet], ['night', stageNight]]) {
    const { game } = shotHud(fn);
    ok(game.police.heli.active, `${name} heli active`);
    ok(game.police.heli.y > 30, `${name} heli aloft`);
  }
});

test('top3', 'T11 radio-every-shot', () => {
  for (const [name, fn] of [['cover', stageCover], ['street', stageStreet], ['mission', stageMission], ['night', stageNight]]) {
    const { hud } = shotHud(fn);
    ok(hud.stationLabel.length > 0, `${name} station`);
    ok(hud.songLine.length > 0, `${name} song`);
  }
  eq(shotHud(stageCover).hud.stationLabel, 'HARBOUR FM 88.3', 'cover station');
  eq(shotHud(stageStreet).hud.stationLabel, 'GULL ROCK 101.7', 'street station');
  eq(shotHud(stageMission).hud.stationLabel, 'BAY TALK 94.5', 'mission station');
  eq(shotHud(stageNight).hud.stationLabel, 'BAY TALK 94.5', 'night station');
});

test('top3', 'T12 district-label-every-shot', () => {
  for (const [name, fn] of [['cover', stageCover], ['street', stageStreet], ['mission', stageMission], ['night', stageNight]]) {
    const { hud } = shotHud(fn);
    ok(hud.districtLabel.length > 0, `${name} district label`);
  }
});

test('top3', 'T13 dialogue-with-a-name', () => {
  const cover = shotHud(stageCover);
  ok(cover.hud.dialogue, 'cover dialogue');
  ok(cover.hud.dialogue.name.startsWith('Rook'), `cover speaker: ${cover.hud.dialogue.name}`);
  ok(cover.hud.dialogue.line.includes('Broker'), 'cover line names the Broker');
  const night = shotHud(stageNight);
  ok(night.hud.dialogue, 'night dialogue');
  ok(night.hud.dialogue.name.startsWith('Iris Vale'), `night speaker: ${night.hud.dialogue.name}`);
  const d = dialogueData('sal', 'Heavier than it looks, that one.');
  ok(d.name.startsWith('Sal'), `dialogue data names Sal: ${d.name}`);
});

test('top3', 'T14 response-units-are-named', () => {
  const { hud } = shotHud(stageCover);
  ok(hud.response.units.length >= 4, 'response units');
  for (const u of hud.response.units) {
    ok(/^[A-Z]+-\d+$/.test(u.name), `unit name ${u.name}`);
    ok(typeof u.distM === 'number' && u.distM >= 0, `unit distance ${u.name}`);
    ok(u.status.length > 0, `unit status ${u.name}`);
  }
  eq(hud.response.code, 'CODE 4', 'response code');
  ok(hud.response.units.some((u) => u.status === 'SPOTLIGHT ON YOU'), 'spotlight unit present');
});

test('top3', 'T15 cash-stars-weapons-top-right', () => {
  const { hud } = shotHud(stageCover);
  ok(typeof hud.cash === 'number', 'cash');
  eq(hud.wanted, 4, 'stars');
  eq(hud.weapons.length, 4, 'weapon slots');
  ok(hud.escalation.length > 0, 'escalation line');
});

test('top3', 'T16 speed-car-condition', () => {
  const cover = shotHud(stageCover);
  eq(cover.hud.car.name, 'MERCER GT', 'cover car');
  eq(cover.hud.speedKmh, 137, 'cover speed');
  ok(cover.hud.gear.length > 0, 'cover gear');
  eq(cover.hud.car.condition, 100, 'cover car clean');
  const night = shotHud(stageNight);
  eq(night.hud.car.condition, 61, 'night car damaged');
  eq(night.hud.gear, 'G4', 'night gear');
});

test('top3', 'T17 weapon-slots-locked-states', () => {
  const { hud } = shotHud(stageCover);
  eq(hud.weapons[0].locked, false, 'fists open');
  eq(hud.weapons[2].locked, true, 'smg locked at this stage');
  eq(hud.weapons[3].locked, true, 'shotgun locked at this stage');
});

test('top3', 'T18 minimap-data', () => {
  // The street shot's active objective is a delivery: the minimap carries
  // a mission diamond. (The cover's active objective is an escape, which
  // has no target place, so its diamond is correctly absent.)
  const game = freshGame();
  stageStreet(game);
  const mm = buildMinimapData(game.city, game);
  ok(mm.bounds && Number.isFinite(mm.bounds.half), 'bounds');
  ok(mm.player && Number.isFinite(mm.player.x), 'player arrow');
  ok(Array.isArray(mm.places) && mm.places.length > 0, 'places');
  ok(mm.landmark, 'spire landmark');
  ok(mm.missionTarget, 'mission diamond');
});

test('top3', 'T19 safehouse-and-shop-named', () => {
  ok(SAFEHOUSE_LINE.includes('Coral Motel'), 'safehouse is the Coral Motel');
  ok(SAFEHOUSE_LINE.includes('2x'), 'safehouse decays wanted 2x faster');
  ok(SHOP_LINE.includes('Bayview Pawn'), 'shop is Bayview Pawn');
  ok(SHOP_LINE.includes('$400'), 'armour price named');
});

test('top3', 'T20 iris-reports-the-crimes', () => {
  // Iris narrates the player's own crimes, one line per mission (bible).
  const withIris = MISSIONS.filter((m) => m.beats.some((b) => b.speaker === 'iris'));
  ok(withIris.length >= 4, `iris beats in ${withIris.length} missions`);
  const m3 = missionById('m3');
  ok(m3.beats.some((b) => b.speaker === 'iris' && b.line.includes('Spire')), 'm3 iris line');
});

test('top3', 'T21 searching-reads-in-the-hud', () => {
  ok(searchingText(true).length > 0, 'searching text');
  eq(starDisplay(4, false).length, 5, 'five stars');
  eq(starDisplay(4, false).filter((s) => s.filled).length, 4, 'four filled');
});

test('top3', 'T22 heli-spotlight-locks-the-player', () => {
  const { game } = shotHud(stageCover);
  eq(game.police.heli.spotlight.x, game.player.x, 'spotlight x on player');
  eq(game.police.heli.spotlight.z, game.player.z, 'spotlight z on player');
});

test('top3', 'T23 ending-saved', () => {
  const game = freshGame();
  playTo(game, 'm7', 2);
  const mission = missionById('m7');
  const p = placePos(game, mission.objectives[2].placeId);
  game.player.x = p.x;
  game.player.z = p.z;
  game.police.wanted.searching = true;
  updateMission(game.missions, {
    now: 0, dt: 0.5, player: game.player,
    nearPlace: (id, rad) => nearPlace(game, id, rad),
    events: [], eventData: null, wanted: game.police.wanted,
    districtId: districtAt(game.player.x, game.player.z).id,
  });
  chooseEnding(game.missions, 'burn');
  const data = saveData(game.missions, createSideJobState());
  eq(data.ending, 'burn', 'save records the ending');
  eq(data.completed.includes('m7'), true, 'finale completed');
});

test('top3', 'T24 debt-shows-until-zero', () => {
  ok(debtLine(400).includes('400'), 'debt line names the amount');
  const cover = shotHud(stageCover);
  eq(cover.hud.debt, 400, 'debt live in cover');
  const night = shotHud(stageNight);
  eq(night.hud.debt, 0, 'debt gone by the finale');
});

test('top3', 'T25 respray-is-the-wanted-break', () => {
  eq(missionById('m1').unlock, 'respray', 'm1 unlocks respray');
  eq(resprayCost(), 300, 'respray $300');
  eq(SIDE_JOBS.respray.colours.length, 5, 'five colours');
});

test('top3', 'T26 five-side-jobs', () => {
  eq(Object.keys(SIDE_JOBS).join(','), 'race,deliveries,slots,respray,pawn', 'side jobs');
});

test('top3', 'T27 race-economy', () => {
  const side = createSideJobState();
  eq(startRace(null, side, 199).ok, false, 'cannot enter broke');
  const entered = startRace(null, side, 200);
  eq(entered.ok, true, 'entry $200');
  eq(entered.cashAfter, 0, 'entry taken');
  const won = finishRace(null, side, true, 90000);
  eq(won.prize, 600, 'prize $600');
  eq(side.racesWon, 1, 'win counted');
  eq(side.bestRaceTimeMs, 90000, 'best time saved');
});

test('top3', 'T28 diner-deliveries', () => {
  const side = createSideJobState();
  eq(SIDE_JOBS.deliveries.pay, 150, 'pay $150');
  eq(SIDE_JOBS.deliveries.timeS, 90, '90 s per drop');
  const first = completeDelivery(side);
  eq(first.pay, 150, 'delivery pays');
  const second = completeDelivery(side);
  const third = completeDelivery(side);
  const fourth = completeDelivery(side);
  ok(first.line !== second.line || second.line !== third.line, 'lines rotate');
  eq(fourth.line, first.line, 'three lines cycle');
  eq(side.deliveriesDone, 4, 'deliveries counted');
  ok(nextDeliveryLine(side).length > 0, 'next line');
});

test('top3', 'T29 slots-table', () => {
  eq(SIDE_JOBS.slots.pull, 50, 'pull $50');
  eq(SIDE_JOBS.slots.jackpot, 1000, 'jackpot $1,000');
  const total = SIDE_JOBS.slots.payouts.reduce((a, p) => a + p.chance, 0);
  approx(total, 1, 1e-9, 'payout chances sum to 1');
  ok(SIDE_JOBS.slots.payouts.some((p) => p.amount === 1000), 'jackpot in table');
  const side = createSideJobState();
  for (let i = 0; i < 200; i++) {
    const r = pullSlots(side, () => (i * 7919) % 100 / 100);
    ok([0, 100, 250, 1000].includes(r.payout), `payout ${r.payout}`);
  }
  eq(side.slotsPulled, 200, 'pulls counted');
});

test('top3', 'T30 pawn-economy', () => {
  eq(buyArmour().cost, 400, 'armour $400');
  eq(buyArmour().armour, 100, 'armour full');
  eq(buyAmmo().cost, 50, 'ammo $50/box');
  eq(buyAmmo().rounds, 12, '12 rounds a box');
  for (const seed of [1, 2, 3, 7, 42]) {
    const r = sellHotGood(1000, () => (seed * 37) % 100 / 100);
    ok(r.paid >= 100 && r.paid <= 400, `pawn pays 10-40%: ${r.paid}`);
  }
});

test('top3', 'T31 no-empty-corners', () => {
  const { hud } = shotHud(stageCover);
  for (const key of ['mission', 'response', 'cash', 'wanted', 'weapons', 'rep', 'districtLabel', 'stationLabel', 'car', 'speedKmh', 'gear', 'health', 'armour']) {
    ok(hud[key] !== null && hud[key] !== undefined, `hud zone ${key}`);
  }
});

test('top3', 'T32 determinism', () => {
  const pick = (hud) => JSON.stringify({
    title: hud.mission.title, wanted: hud.wanted, cash: hud.cash, debt: hud.debt,
    district: hud.districtLabel, station: hud.stationLabel, car: hud.car.name,
    speed: hud.speedKmh, gear: hud.gear, code: hud.response.code,
    units: hud.response.units.map((u) => `${u.name}:${u.distM}:${u.status}`).join(','),
  });
  eq(pick(shotHud(stageCover).hud), pick(shotHud(stageCover).hud), 'cover stages identical');
  eq(pick(shotHud(stageNight).hud), pick(shotHud(stageNight).hud), 'night stages identical');
});

// --- Runner -----------------------------------------------------------------
const failed = results.filter((r) => !r.ok);
const bySuite = {};
for (const r of results) {
  bySuite[r.suite] = bySuite[r.suite] || { pass: 0, fail: 0 };
  bySuite[r.suite][r.ok ? 'pass' : 'fail'] += 1;
}
console.log('');
for (const [suite, counts] of Object.entries(bySuite)) {
  console.log(`${suite}: ${counts.pass} passed, ${counts.fail} failed`);
}
console.log(`total: ${results.length - failed.length}/${results.length} passed`);
if (failed.length > 0) {
  console.log('failures:');
  for (const f of failed) console.log(`  ${f.suite} ${f.name}: ${f.error}`);
  process.exit(1);
}
