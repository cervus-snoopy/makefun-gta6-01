// three-missions.js — PORT MERCER 3D: story missions + side jobs + ending.
// Implemented FULLY from Story Bible v2 (18 Nov 2026) + the top-3 study
// (18 Nov): the bible's 6 missions plus a 7th job, "The Last Drop" (M6),
// so the HUD counter reads MISSION x/7 and the finale is M7/7.
// Pure state machine + timers + objectives; render-independent and
// unit-testable in Node.
// Debt ledger (v2, exact): $2,500 start; M1 $500 -> $2,000; M2 $800 -> $1,200;
// M3 $1,500 gross, Broker skims $700 fee, $800 to debt -> $400; M4 $2,000 ->
// $0 (Leon keeps $1,600); M5 $0 (the ledger); M6 $600 (the last drop);
// M7 $3,000. Story total $8,400.

import { mulberry32 } from './three-city.js';

export const SAVE_KEY = 'portmercer-save-v1';
export const START_DEBT = 2500;
// v2 does not restate starting cash; $250 follows the shipped game (README).
export const STARTING_CASH = 250;
export const STORY_TOTAL_GROSS = 8400;

// --- Cast (v2: name, age, look, how they talk, one signature line) --------
export const CAST = [
  {
    id: 'leon',
    name: 'Leon Cross',
    age: 27,
    role: 'player — ex-getaway driver',
    look: 'Worn leather jacket — his father\u2019s. Drives with one hand on the wheel, the other on the door.',
    speech: 'Speaks little.',
    line: 'I don\u2019t run. I drive.',
  },
  {
    id: 'broker',
    name: 'Marlon "The Broker" Vane',
    age: 54,
    role: 'holds Leon\u2019s debt; sells him to the police one job at a time',
    look: 'Grey suit, never raises his voice.',
    speech: 'Stirs his coffee exactly three times before every sentence that matters.',
    line: 'Everything\u2019s a transaction, Lee. Even loyalty. Especially loyalty.',
  },
  {
    id: 'rook',
    name: 'Rook',
    age: 31,
    role: 'runs Rook\u2019s Garage; Leon\u2019s oldest friend',
    look: 'Oil on his hands, always.',
    speech: 'Laughs loud enough to hear from the street.',
    line: 'You don\u2019t owe him money, Lee. You owe him fear.',
  },
  {
    id: 'sal',
    name: 'Sal',
    age: '60s',
    role: 'owns the Salty Gull Diner; the city\u2019s ear',
    look: 'Silver hair in a bun. Wipes the same counter while the city burns.',
    speech: 'Says one line per mission — the one that matters.',
    line: 'Heavier than it looks, that one.',
  },
  {
    id: 'kline',
    name: 'Detective Mara Kline',
    age: 38,
    role: 'Leon Bay PD; personal reason to close Leon\u2019s file',
    look: 'Dark coat, coffee gone cold, a file on Leon an inch thick.',
    speech: 'Her partner was crippled in the bad job three years ago.',
    line: 'I don\u2019t want an arrest, Cross. I want a name.',
  },
  {
    id: 'dante',
    name: 'Dante "The Gull" Ferro',
    age: 45,
    role: 'runs Palm Court\u2019s money — counting house, vans, muscle',
    look: 'White suit, gold watch, never touches anything twice.',
    speech: 'Calm. Everything is a collection.',
    line: 'The Gull always collects.',
  },
  {
    id: 'iris',
    name: 'Iris Vale',
    age: 33,
    role: 'host of BAY TALK 94.5, studio above the Salty Gull Diner',
    look: 'Voice like smoked honey.',
    speech: 'Reads the news Leon makes, live on air — and off air trades information for protection. The only person in Leon Bay the Broker can\u2019t buy.',
    line: 'Tonight, Leon Bay learns every name. Starting with mine.',
  },
];

export function castById(id) {
  return CAST.find((c) => c.id === id) || null;
}

// --- Mission definitions (v2: numbered objectives + timer + route + beats) --
// Objective types:
//   steal-car {districtId?} | goto {placeId, requireCar?, requireSearching?}
//   collect {placeId} | deliver {placeId, timerS} | lose-tail {stars}
//   reach-timed {placeId, timerS} | intercept {placeId} | grab {what}
//   escape {afterWanted} | infiltrate {placeId} | take {what}
//   reach-studio {placeId}
// ctx supplied by the main loop each tick:
//   { now, player:{x,z,inCar}, nearPlace(id, radius), events:[...consumed],
//     wanted:{stars, searching}, districtId }
// Events are plain strings the caller pushes when things happen
// ('car-stolen', 'van-intercepted', 'cash-grabbed', 'ledger-grabbed',
// 'score-grabbed') — optionally with a payload object { districtId }.
export const MISSIONS = [
  {
    id: 'm1',
    name: 'First Wheels',
    act: 1,
    actName: 'DEBT',
    giver: 'rook',
    location: 'rooks-garage',
    route: 'Old Mercer — steal anywhere in the district, bring it to the garage.',
    hint: 'Borrow a real one. Bring it here before the owner notices.',
    timerS: null, // no timer
    wantedCap: 1,
    objectives: [
      { n: 1, type: 'steal-car', districtId: 'old-mercer', label: 'Steal any car (E) in Old Mercer' },
      { n: 2, type: 'goto', placeId: 'rooks-garage', requireCar: true, label: 'Drive it to Rook\u2019s Garage' },
    ],
    beats: [
      { when: 'brief', speaker: 'rook', line: 'Your coupe\u2019s a joke, Lee. Borrow a real one. Bring it here before the owner notices.' },
      { when: 'complete', speaker: 'rook', line: 'Three years, and you still drive like you\u2019re apologising.' },
      { when: 'complete', speaker: 'leon', line: 'Three years, and you still talk too much.' },
    ],
    reward: { gross: 500, fee: 0 },
    debtAfter: 2000,
    unlock: 'respray',
    unlockNote: 'Respray unlocked at Rook\u2019s Garage.',
  },
  {
    id: 'm2',
    name: 'The Pickup',
    act: 1,
    actName: 'DEBT',
    giver: 'broker',
    location: 'salty-gull-diner',
    route: 'Gullhaven dock road: Bayview Pawn -> Coral Motel. 2-star risk if you speed past a patrol.',
    hint: 'Don\u2019t open it. Don\u2019t stop for anyone.',
    timerS: 75, // delivery leg timer, starts on collection
    wantedCap: null,
    objectives: [
      { n: 1, type: 'collect', placeId: 'bayview-pawn', label: 'Collect the shoebox at Bayview Pawn' },
      { n: 2, type: 'deliver', placeId: 'coral-motel', timerS: 75, label: 'Deliver to the Coral Motel desk in 75 seconds' },
    ],
    beats: [
      { when: 'brief', speaker: 'broker', line: 'Bayview Pawn. A shoebox, taped. Coral Motel. Don\u2019t open it. Don\u2019t stop for anyone.' },
      { when: 'mid', speaker: 'sal', line: 'Heavier than it looks, that one.' },
      { when: 'complete', speaker: 'clerk', line: 'Room 6. Leave it by the door.' },
    ],
    reward: { gross: 800, fee: 0 },
    debtAfter: 1200,
    hiddenBeat: 'The shoebox is a ledger page. Leon doesn\u2019t know yet. Sal does.',
    actReveal: 'ACT I reveal: the package is a ledger page. Sal already knows what it is.',
  },
  {
    id: 'm3',
    name: 'Heat Wave',
    act: 2,
    actName: 'HEAT',
    giver: 'broker',
    location: 'salty-gull-diner',
    route: 'Furnace Row -> MERCER SPIRE, any way you like. No timer — patience is the mechanic.',
    hint: 'Three stars is a Tuesday here — then vanish.',
    timerS: null,
    wantedCap: null,
    objectives: [
      { n: 1, type: 'lose-tail', stars: 3, label: 'Reach 3 stars, then lose the tail' },
      { n: 2, type: 'goto', placeId: 'mercer-spire', requireSearching: true, label: 'Arrive at MERCER SPIRE while SEARCHING (unseen)' },
    ],
    beats: [
      { when: 'brief', speaker: 'broker', line: 'Kline\u2019s got your plate, Lee. Lose the tail, then bring the Spire drop. Three stars is a Tuesday here.' },
      { when: 'mid', speaker: 'iris', line: 'Police are looking for a driver in a dark coupe near the Spire. If that\u2019s you — drive faster.' },
      { when: 'complete', speaker: 'rook', line: 'Fees. He calls it fees.' },
    ],
    reward: { gross: 1500, fee: 700 },
    debtAfter: 400,
    actReveal: 'ACT II reveal (1 of 2): the Broker\u2019s $700 "fee".',
  },
  {
    id: 'm4',
    name: 'The Gull\u2019s Cut',
    act: 2,
    actName: 'HEAT',
    giver: 'rook',
    location: 'rooks-garage',
    timeOfDay: '17:45 dusk',
    route: 'Palm Court (intercept) -> Old Mercer back streets (escape).',
    hint: 'The Broker set you up. This one isn\u2019t his job. It\u2019s mine.',
    timerS: null,
    wantedCap: null,
    objectives: [
      { n: 1, type: 'intercept', placeId: 'counting-house', label: 'Intercept Dante\u2019s money van in Palm Court' },
      { n: 2, type: 'grab', what: 'cash', label: 'Grab the cash' },
      { n: 3, type: 'escape', afterWanted: 4, label: 'Escape a 4-star response — HELICOPTER with spotlight' },
    ],
    beats: [
      { when: 'brief', speaker: 'rook', line: 'Dante\u2019s money van runs Palm Court at dusk. The Broker set you up, Lee. This one isn\u2019t his job. It\u2019s mine.' },
      { when: 'mid', speaker: 'kline', line: 'All units — the van, not the driver. I want the driver ALIVE.' },
      { when: 'complete', speaker: 'rook', line: 'The Broker. Listed as Dante\u2019s informant. Told you. Now you know.' },
    ],
    reward: { gross: 2000, fee: 0 },
    debtAfter: 0,
    keepsNote: 'Debt $400 -> $0; Leon keeps $1,600.',
    actReveal: 'ACT II reveal (2 of 2): the van manifest lists the Broker as Dante\u2019s informant. From here Leon works for himself.',
  },
  {
    id: 'm5',
    name: 'Wires Crossed',
    act: 3,
    actName: 'THE SCORE',
    giver: 'iris',
    location: 'salty-gull-diner',
    route: 'Anywhere -> Salty Gull Diner (150 s), then out. Intended solution: respray at Rook\u2019s (breaks the description) + SEARCHING.',
    hint: 'Back booth. Third tile. Go.',
    timerS: 150,
    wantedCap: null,
    objectives: [
      { n: 1, type: 'reach-timed', placeId: 'salty-gull-diner', timerS: 150, label: 'Reach the Salty Gull Diner in 150 seconds' },
      { n: 2, type: 'grab', what: 'ledger', label: 'Take the ledger from the back booth — third tile under the table' },
      { n: 3, type: 'escape', afterWanted: 5, label: 'Escape as wanted spikes to 5' },
    ],
    beats: [
      { when: 'brief', speaker: 'iris', line: 'Kline\u2019s raiding the Diner in ten minutes. The ledger is in the back booth. Move it — or she gets every name.' },
      { when: 'mid', speaker: 'sal', line: 'Back booth. Third tile. Go.' },
      { when: 'complete', speaker: 'kline', line: 'Cross. Don\u2019t make me chase you.' },
    ],
    reward: { gross: 0, fee: 0 },
    debtAfter: 0,
    unlock: 'finale-choice',
    unlockNote: 'Reward: the ledger itself (no cash). Unlocks the finale path — M6, then the ending choice.',
  },
  {
    id: 'm6',
    name: 'The Last Drop',
    act: 3,
    actName: 'THE SCORE',
    giver: 'iris',
    location: 'salty-gull-diner',
    route: 'Gullhaven dock road: Bayview Pawn -> Coral Motel desk, 120 s. The Broker pays for his own ending.',
    hint: 'The Broker\u2019s cash moves tonight — take it.',
    timerS: 120, // delivery leg timer, starts on collection
    wantedCap: null,
    objectives: [
      { n: 1, type: 'collect', placeId: 'bayview-pawn', label: 'Collect the drop at Bayview Pawn — the Broker\u2019s payoff cash, $600 in marked bills' },
      { n: 2, type: 'deliver', placeId: 'coral-motel', timerS: 120, label: 'Deliver to the Coral Motel desk in 120 seconds' },
      { n: 3, type: 'escape', afterWanted: 4, label: 'Escape a 4-star response — the whole department watches the docks' },
    ],
    beats: [
      { when: 'brief', speaker: 'iris', line: 'One more drop before the score, Lee. The Broker\u2019s payoff cash moves tonight. Take it — and he pays for his own ending.' },
      { when: 'mid', speaker: 'rook', line: 'Last one, Lee. Make it count.' },
      { when: 'complete', speaker: 'iris', line: 'The last drop is in. The Broker has nothing left to sell.' },
    ],
    reward: { gross: 600, fee: 0 },
    debtAfter: 0,
    unlock: 'finale',
    unlockNote: 'Reward: $600, Leon\u2019s. Unlocks the finale — The Mercer Score.',
  },
  {
    id: 'm7',
    name: 'The Mercer Score',
    act: 3,
    actName: 'THE SCORE',
    giver: 'leon',
    location: 'counting-house',
    timeOfDay: '22:00 night',
    route: 'Palm Court (counting house) -> Gullhaven docks, the long way, at night.',
    hint: 'Slip past the guards or go loud — either way the alarm is 2 stars.',
    timerS: null,
    wantedCap: null,
    stages: [
      { n: 1, name: 'Get in', label: 'Get into Dante\u2019s counting house, Palm Court, 22:00. Slip past the guards or go loud; either way the alarm is 2 stars.' },
      { n: 2, name: 'Take', label: 'Take the ledger\u2019s second copy + the Broker\u2019s payoff cash, $3,000, from the counting-house safe.' },
      { n: 3, name: 'Get out', label: 'Lose 5-star heat (heli + roadblocks) and reach Iris at the studio above the Salty Gull Diner.' },
    ],
    objectives: [
      { n: 1, type: 'infiltrate', placeId: 'counting-house', label: 'Get into Dante\u2019s counting house (alarm: 2 stars)' },
      { n: 2, type: 'take', what: 'score', label: 'Take the ledger\u2019s second copy + $3,000 payoff cash from the safe' },
      { n: 3, type: 'reach-studio', placeId: 'bay-talk-studio', label: 'Lose 5-star heat and reach Iris at the studio above the Diner' },
    ],
    beats: [
      { when: 'brief', speaker: 'leon', line: 'Seven jobs. One book. Every name the Broker ever sold — including mine. Tonight it stops being his.' },
      { when: 'mid', speaker: 'iris', line: 'Police are all over Palm Court, Lee. The Spire\u2019s shadow is your only friend tonight.' },
      { when: 'complete', speaker: 'broker', line: 'You were never the driver, Lee. You were the delivery.' },
      { when: 'ending-broadcast', speaker: 'iris', line: 'Tonight, Leon Bay learns every name.' },
      { when: 'ending-burn', speaker: 'iris', line: 'Some nights, the city keeps its secrets. Tonight is one of them.' },
    ],
    reward: { gross: 3000, fee: 0 },
    debtAfter: 0,
  },
];

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) || null;
}

// --- Ending choice (v2: consequences spelled out) ---------------------------
// BROADCAST: Iris reads the names live; Broker arrested, counting house
// raided, Kline closes the file and lets Leon walk. Free-roam reward: wanted
// stars decay twice as fast from now on.
// BURN: Leon burns the book in the Spire's shadow; Broker has nothing left
// to sell, Dante has no leverage; Leon keeps the $3,000 and his freedom —
// but Kline's file stays open (wanted decays at the normal rate).
export const ENDINGS = {
  broadcast: {
    id: 'broadcast',
    title: 'BROADCAST',
    line: 'Tonight, Leon Bay learns every name.',
    consequence: 'Broker arrested, counting house raided, Kline closes the file. Wanted decays 2x faster in free roam.',
    decayMultiplier: 2,
  },
  burn: {
    id: 'burn',
    title: 'BURN IT',
    line: 'Some nights, the city keeps its secrets. Tonight is one of them.',
    consequence: 'The Broker has nothing left to sell; Kline\u2019s file stays open. Wanted decays at the normal rate.',
    decayMultiplier: 1,
  },
};

// Wanted-decay multiplier from the saved ending (v2 §M6). Null/no ending = 1.
export function decayMultiplierForEnding(ending) {
  if (ending === 'broadcast') return 2;
  return 1;
}

// --- Mission state ---------------------------------------------------------

export function createMissionState() {
  return {
    cash: STARTING_CASH,
    debt: START_DEBT,
    currentId: 'm1',
    status: {}, // missionId -> 'locked' | 'available' | 'active' | 'choice' | 'complete' | 'failed'
    objectiveIndex: 0,
    objectiveTimer: null, // seconds left on the current timed objective
    objectiveStartedAt: null,
    flags: {}, // per-mission scratch: reached3, collectedAt, ...
    ledger: false, // true once M5 hands Leon the ledger
    ending: null, // 'broadcast' | 'burn' once chosen
    unlockedRespray: false,
    unlockedFinaleChoice: false,
    completed: [], // mission ids in order
    failedCount: 0,
    startedAt: null,
  };
}

export function missionStatus(state, id) {
  if (state.status[id]) return state.status[id];
  const idx = MISSIONS.findIndex((m) => m.id === id);
  const cur = MISSIONS.findIndex((m) => m.id === state.currentId);
  if (idx < cur) return 'complete';
  if (idx === cur) return 'active';
  return 'locked';
}

// Job pay goes to the Broker first until the debt is $0; Leon's spending
// money is what is left over. M3's $700 "fee" is skimmed off the gross
// before anything reaches the debt. Returns the ledger math for the HUD.
export function applyReward(state, mission) {
  const gross = mission.reward.gross;
  const fee = mission.reward.fee || 0;
  const net = gross - fee;
  const toDebt = Math.min(net, state.debt);
  const toCash = net - toDebt;
  state.debt -= toDebt;
  state.cash += toCash;
  return { gross, fee, net, toDebt, toCash, debtAfter: state.debt, cashAfter: state.cash };
}

export function startMission(state, id, now) {
  const mission = missionById(id);
  if (!mission) return { ok: false, error: 'unknown-mission' };
  state.currentId = id;
  state.status[id] = 'active';
  state.objectiveIndex = 0;
  state.objectiveTimer = null;
  state.objectiveStartedAt = now;
  state.flags = {};
  state.startedAt = now;
  // A timed first objective starts its clock at mission start (M5).
  const first = mission.objectives[0];
  if (first.timerS) state.objectiveTimer = first.timerS;
  return { ok: true, mission };
}

function failMission(state, reason) {
  const id = state.currentId;
  state.status[id] = 'failed';
  state.failedCount += 1;
  state.objectiveTimer = null;
  return { done: false, failed: true, reason, missionId: id };
}

function advanceObjective(state, mission) {
  state.objectiveIndex += 1;
  state.objectiveTimer = null;
  const next = mission.objectives[state.objectiveIndex];
  if (next && next.timerS) state.objectiveTimer = next.timerS;
  return next || null;
}

function completeMission(state, mission) {
  // M7's $3,000 is the payoff cash from the safe: it pays on the ENDING
  // choice (chooseEnding), not when the objectives finish — otherwise Leon
  // would be paid twice. Every other mission pays here.
  const ledger = mission.id === 'm7'
    ? { gross: 0, fee: 0, net: 0, toDebt: 0, toCash: 0, debtAfter: state.debt, cashAfter: state.cash, deferred: 'ending-choice' }
    : applyReward(state, mission);
  state.status[mission.id] = 'complete';
  state.completed.push(mission.id);
  state.objectiveTimer = null;
  if (mission.unlock === 'respray') state.unlockedRespray = true;
  if (mission.unlock === 'finale-choice') state.unlockedFinaleChoice = true;
  if (mission.id === 'm5') state.ledger = true;
  // Advance to the next mission and make it ACTIVE at once, so the story
  // chain plays in the browser without a separate "start next job" step.
  // (M7 ends in a choice, not an auto-advance.)
  const idx = MISSIONS.findIndex((m) => m.id === mission.id);
  const next = MISSIONS[idx + 1];
  if (next && mission.id !== 'm7') {
    state.currentId = next.id;
    state.status[next.id] = 'active';
    state.objectiveIndex = 0;
    state.flags = {};
  }
  if (mission.id === 'm7') {
    // Finale objectives done — the player must still CHOOSE the ending.
    state.status['m7'] = 'choice';
  }
  return { done: true, failed: false, missionId: mission.id, ledger, nextId: next && mission.id !== 'm7' ? next.id : null };
}

// One tick of the active mission. Returns an outcome object; the main loop
// applies side effects the outcome names (wantedSet / toast).
// ctx: { now, dt, player:{x,z,inCar}, nearPlace(id, radius), events:[...],
//        wanted:{stars, searching}, districtId, eventData:{...} }
export function updateMission(state, ctx) {
  const mission = missionById(state.currentId);
  if (!mission || state.status[mission.id] !== 'active') {
    return { done: false, failed: false, idle: true };
  }
  const obj = mission.objectives[state.objectiveIndex];
  if (!obj) return completeMission(state, mission);

  // Timed objectives tick down; expiry fails the mission (retryable).
  if (state.objectiveTimer !== null) {
    state.objectiveTimer -= ctx.dt;
    if (state.objectiveTimer <= 0) {
      return failMission(state, `time-up:${obj.type}`);
    }
  }

  const events = ctx.events || [];
  const hasEvent = (name) => events.includes(name);
  const near = (placeId, radius = 26) => ctx.nearPlace ? ctx.nearPlace(placeId, radius) : false;

  let advanced = false;
  let wantedSet = null;

  switch (obj.type) {
    case 'steal-car': {
      if (hasEvent('car-stolen')) {
        if (!obj.districtId || ctx.eventData?.districtId === obj.districtId || !ctx.eventData?.districtId) {
          advanced = true;
        }
      }
      break;
    }
    case 'goto': {
      if (near(obj.placeId)) {
        if (obj.requireCar && !ctx.player.inCar) break;
        if (obj.requireSearching && !ctx.wanted.searching) break;
        advanced = true;
      }
      break;
    }
    case 'collect': {
      if (near(obj.placeId)) {
        state.flags.collectedAt = ctx.now;
        advanced = true;
      }
      break;
    }
    case 'deliver': {
      if (near(obj.placeId)) advanced = true;
      break;
    }
    case 'lose-tail': {
      if (ctx.wanted.stars >= obj.stars) state.flags.reachedStars = true;
      if (state.flags.reachedStars && ctx.wanted.searching) advanced = true;
      break;
    }
    case 'reach-timed': {
      if (near(obj.placeId)) advanced = true;
      break;
    }
    case 'intercept': {
      if (hasEvent('van-intercepted') && near(obj.placeId, 90)) advanced = true;
      break;
    }
    case 'grab': {
      if (obj.what === 'cash' && hasEvent('cash-grabbed')) {
        advanced = true;
        wantedSet = 4;
      }
      if (obj.what === 'ledger' && hasEvent('ledger-grabbed')) {
        advanced = true;
        wantedSet = 5;
      }
      break;
    }
    case 'take': {
      if (hasEvent('score-grabbed')) advanced = true;
      break;
    }
    case 'infiltrate': {
      if (near(obj.placeId)) {
        advanced = true;
        wantedSet = 2;
      }
      break;
    }
    case 'reach-studio': {
      if (near(obj.placeId) && (ctx.wanted.searching || ctx.wanted.stars === 0)) {
        advanced = true;
      }
      break;
    }
    case 'escape': {
      if (ctx.wanted.searching || ctx.wanted.stars === 0) advanced = true;
      break;
    }
    default:
      break;
  }

  if (!advanced) {
    return {
      done: false,
      failed: false,
      missionId: mission.id,
      objectiveIndex: state.objectiveIndex,
      objectiveTimer: state.objectiveTimer,
      objective: obj,
    };
  }

  // The objective is done. If it was the last one, the mission completes
  // (and pays out); otherwise the next objective starts.
  const next = advanceObjective(state, mission);
  if (state.objectiveIndex >= mission.objectives.length) {
    const res = completeMission(state, mission);
    if (wantedSet !== null) res.wantedSet = wantedSet;
    return res;
  }
  const res = {
    done: false,
    failed: false,
    missionId: mission.id,
    objectiveIndex: state.objectiveIndex,
    objectiveTimer: state.objectiveTimer,
    objectiveDone: true,
    nextObjective: next,
  };
  if (wantedSet !== null) res.wantedSet = wantedSet;
  return res;
}

// M7 ending choice. Only valid once M7's objectives are done (status 'choice').
export function chooseEnding(state, choice) {
  if (state.status['m7'] !== 'choice') return { ok: false, error: 'finale-not-ready' };
  if (!ENDINGS[choice]) return { ok: false, error: 'unknown-ending' };
  const mission = missionById('m7');
  state.ending = choice;
  state.status['m7'] = 'complete';
  if (!state.completed.includes('m7')) state.completed.push('m7');
  const ledger = applyReward(state, mission);
  return { ok: true, ending: ENDINGS[choice], ledger };
}

// --- Side jobs (v2 exact numbers) ------------------------------------------

export const SIDE_JOBS = {
  race: {
    name: 'Street race',
    place: 'Gullhaven loop',
    laps: 3,
    entry: 200,
    prize: 600,
    station: 'GULL ROCK 101.7',
    note: 'GULL ROCK 101.7 is the race station. Best time saved.',
  },
  deliveries: {
    name: 'Diner deliveries',
    giver: 'sal',
    pay: 150,
    timeS: 90,
    lines: [
      'Hot food, cold city.',
      'Don\u2019t eat the fries. They\u2019re mine.',
      'Tip\u2019s in the bag. Don\u2019t look.',
    ],
  },
  slots: {
    name: 'Slots',
    place: 'Coral Motel bar',
    pull: 50,
    jackpot: 1000,
    note: 'OUT OF ORDER — PLAY AT OWN RISK.',
    // Payout table (chosen for this build; v2 fixes only pull $50 + jackpot
    // $1,000 rare): 70% nothing, 20% $100, 8% $250, 2% jackpot $1,000.
    payouts: [
      { chance: 0.70, amount: 0 },
      { chance: 0.20, amount: 100 },
      { chance: 0.08, amount: 250 },
      { chance: 0.02, amount: 1000 },
    ],
  },
  respray: {
    name: 'Respray',
    place: 'Rook\u2019s Garage',
    cost: 300,
    colours: ['Midnight', 'Gull Grey', 'Palm Gold', 'Diner Teal', 'Spire Black'],
    note: 'Resets the police description — the wanted-break tool.',
  },
  pawn: {
    name: 'Bayview Pawn',
    armourFull: 400, // full armour (100)
    ammoBox: 50, // one box = 12 rounds (chosen box size for this build)
    ammoPerBox: 12,
    sellRateMin: 0.10, // sell hot goods at 10–40% of value
    sellRateMax: 0.40,
  },
};

export function createSideJobState() {
  return {
    bestRaceTimeMs: null,
    racesWon: 0,
    deliveriesDone: 0,
    deliveryLineIndex: 0,
    slotsPulled: 0,
    slotsWon: 0,
  };
}

export function startRace(state, side, cash) {
  if (cash < SIDE_JOBS.race.entry) return { ok: false, error: 'not-enough-cash' };
  return { ok: true, entry: SIDE_JOBS.race.entry, cashAfter: cash - SIDE_JOBS.race.entry };
}

export function finishRace(state, side, won, timeMs) {
  if (won) {
    side.racesWon += 1;
    if (side.bestRaceTimeMs === null || timeMs < side.bestRaceTimeMs) {
      side.bestRaceTimeMs = timeMs;
    }
    return { won: true, prize: SIDE_JOBS.race.prize };
  }
  return { won: false, prize: 0 };
}

export function nextDeliveryLine(side) {
  const line = SIDE_JOBS.deliveries.lines[side.deliveryLineIndex % SIDE_JOBS.deliveries.lines.length];
  side.deliveryLineIndex += 1;
  return line;
}

export function completeDelivery(side) {
  side.deliveriesDone += 1;
  return { pay: SIDE_JOBS.deliveries.pay, line: nextDeliveryLine(side) };
}

export function pullSlots(side, rng = mulberry32(Date.now() % 2147483647)) {
  side.slotsPulled += 1;
  const roll = rng();
  let acc = 0;
  for (const p of SIDE_JOBS.slots.payouts) {
    acc += p.chance;
    if (roll < acc) {
      if (p.amount > 0) side.slotsWon += p.amount;
      return { payout: p.amount, jackpot: p.amount === SIDE_JOBS.slots.jackpot };
    }
  }
  return { payout: 0, jackpot: false };
}

export function resprayCost() {
  return SIDE_JOBS.respray.cost;
}

export function buyArmour() {
  return { cost: SIDE_JOBS.pawn.armourFull, armour: 100 };
}

export function buyAmmo() {
  return { cost: SIDE_JOBS.pawn.ammoBox, rounds: SIDE_JOBS.pawn.ammoPerBox };
}

// Sell a hot good worth `value`; the pawn pays 10–40% of value (v2).
export function sellHotGood(value, rng = mulberry32(Date.now() % 2147483647)) {
  const rate = SIDE_JOBS.pawn.sellRateMin
    + rng() * (SIDE_JOBS.pawn.sellRateMax - SIDE_JOBS.pawn.sellRateMin);
  return { paid: Math.round(value * rate), rate };
}

// --- Save / load (storage-like object: { getItem, setItem }) ----------------

export function saveData(state, side) {
  return {
    version: 1,
    saveKey: SAVE_KEY,
    cash: state.cash,
    debt: state.debt,
    currentId: state.currentId,
    status: state.status,
    objectiveIndex: state.objectiveIndex,
    ledger: state.ledger,
    ending: state.ending,
    unlockedRespray: state.unlockedRespray,
    unlockedFinaleChoice: state.unlockedFinaleChoice,
    completed: state.completed,
    side: {
      bestRaceTimeMs: side.bestRaceTimeMs,
      racesWon: side.racesWon,
      deliveriesDone: side.deliveriesDone,
      deliveryLineIndex: side.deliveryLineIndex,
      slotsPulled: side.slotsPulled,
      slotsWon: side.slotsWon,
    },
  };
}

export function saveGame(state, side, storage) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  storage.setItem(SAVE_KEY, JSON.stringify(saveData(state, side)));
  return true;
}

export function loadGame(storage) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (data.saveKey !== SAVE_KEY || data.version !== 1) return null;
    const state = createMissionState();
    state.cash = data.cash;
    state.debt = data.debt;
    state.currentId = data.currentId;
    state.status = data.status || {};
    state.objectiveIndex = data.objectiveIndex || 0;
    state.ledger = !!data.ledger;
    state.ending = data.ending || null;
    state.unlockedRespray = !!data.unlockedRespray;
    state.unlockedFinaleChoice = !!data.unlockedFinaleChoice;
    state.completed = data.completed || [];
    const side = createSideJobState();
    Object.assign(side, data.side || {});
    return { state, side };
  } catch {
    return null;
  }
}

// Verify the v2 ledger end-to-end (used by the headless test + HUD):
// M1..M7 rewards applied in order must land exactly on the ledger table.
// M7 pays on the ending choice, not completion, so it is skipped here and
// its $3,000 added to the gross by hand.
export function verifyLedger() {
  const state = createMissionState();
  const rows = [];
  let cashAfterM4 = null;
  for (const m of MISSIONS) {
    if (m.id === 'm7') continue; // M7 pays on the ending choice, not completion
    const r = applyReward(state, m);
    rows.push({ mission: m.id, gross: r.gross, fee: r.fee, toDebt: r.toDebt, toCash: r.toCash, debtAfter: r.debtAfter });
    if (m.id === 'm4') cashAfterM4 = state.cash;
  }
  const gross = rows.reduce((a, r) => a + r.gross, 0) + 3000;
  return { rows, storyGross: gross, debtAfterM4: rows[3].debtAfter, cashAfterM4, cashAfterM6: state.cash };
}

export { mulberry32 };
