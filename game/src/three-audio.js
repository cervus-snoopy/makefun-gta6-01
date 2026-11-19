// three-audio.js — PORT MERCER 3D: radio stations + synth SFX.
// 3 synth stations (WebAudio oscillators, no audio assets). Render-independent:
// the station state, cycling, mute and per-car memory are pure logic; the
// synth engine is guarded so the module also loads in Node (no AudioContext).
// Iris Vale's BAY TALK lines are the EXACT v2 story-bible lines.

export const STATIONS = [
  {
    id: 'harbour',
    name: 'HARBOUR FM',
    freq: '88.3',
    genre: 'synthwave',
    wave: 'triangle',
    bpm: 96,
    song: 'Neon Drive',
    artist: 'Harbour Lights',
    note: 'Chase music. Tempo rises with wanted level.',
    // Chord roots (Hz) cycled as the station plays.
    roots: [110.0, 130.81, 98.0, 146.83],
  },
  {
    id: 'gull-rock',
    name: 'GULL ROCK',
    freq: '101.7',
    genre: 'rock',
    wave: 'square',
    bpm: 132,
    song: 'Salt Air Run',
    artist: 'The Gulls',
    note: 'Race music. The street-race station.',
    roots: [82.41, 110.0, 98.0, 123.47],
  },
  {
    id: 'bay-talk',
    name: 'BAY TALK',
    freq: '94.5',
    genre: 'talk',
    wave: 'sine',
    bpm: 0, // talk: no beat, just Iris's voice bed
    song: 'Iris Vale live',
    artist: 'BAY TALK',
    note: 'Iris Vale reads the news Leon makes, live on air.',
    roots: [220.0],
  },
];

// Iris Vale, BAY TALK 94.5 — one EXACT line after every mission (v2).
export const IRIS_LINES = {
  m1: 'A coupe went missing in Old Mercer today. If you see it \u2014 you didn\u2019t.',
  m2: 'A package changed hands in Gullhaven. Nobody saw anything. Everybody knows.',
  m3: 'Police are looking for a driver in a dark coupe near the Spire. If that\u2019s you \u2014 drive faster.',
  m4: 'A money van was hit in Palm Court at dusk. The police want the driver alive. Ask yourself why.',
  m5: 'The Diner on the docks was raided tonight. The back booth is empty. So is the third tile.',
  m6: 'One last drop went down in Gullhaven tonight. The Broker has nothing left to sell.',
  m7_broadcast: 'Tonight, Leon Bay learns every name.',
  m7_burn: 'Some nights, the city keeps its secrets. Tonight is one of them.',
};

export function irisLineFor(missionId, ending = null) {
  if (missionId === 'm7') {
    return ending === 'burn' ? IRIS_LINES.m7_burn : IRIS_LINES.m7_broadcast;
  }
  return IRIS_LINES[missionId] || null;
}

// "Now playing" line for the HUD radio panel: station + song + artist.
export function nowPlaying(station) {
  if (!station) return '';
  return `${station.song} — ${station.artist}`;
}

export function createRadio() {
  return {
    stationIndex: 0, // HARBOUR FM 88.3 default
    muted: false,
    perCar: {}, // carId -> stationIndex (each car remembers its station)
  };
}

export function currentStation(radio) {
  return STATIONS[radio.stationIndex];
}

// R cycles the station WHILE DRIVING; on foot R is reload (handled by the
// combat module / main loop — this function only runs when inCar is true).
// The new station is remembered for this car.
export function cycleStation(radio, carId) {
  radio.stationIndex = (radio.stationIndex + 1) % STATIONS.length;
  if (carId) radio.perCar[carId] = radio.stationIndex;
  return currentStation(radio);
}

export function setStation(radio, index, carId) {
  radio.stationIndex = ((index % STATIONS.length) + STATIONS.length) % STATIONS.length;
  if (carId) radio.perCar[carId] = radio.stationIndex;
  return currentStation(radio);
}

// Entering a car restores that car's remembered station (default: Harbour FM).
export function stationForCar(radio, carId) {
  if (carId && radio.perCar[carId] !== undefined) {
    radio.stationIndex = radio.perCar[carId];
  } else {
    radio.stationIndex = 0;
  }
  return currentStation(radio);
}

// M mutes everything (music + SFX).
export function toggleMute(radio) {
  radio.muted = !radio.muted;
  return radio.muted;
}

// HARBOUR FM gets faster as wanted rises (v2: chase music, tempo rises).
export function effectiveBpm(station, wantedStars) {
  if (!station.bpm) return 0;
  if (station.id === 'harbour') return Math.round(station.bpm * (1 + wantedStars * 0.08));
  return station.bpm;
}

// --- Synth engine (browser only; guarded for Node) -------------------------
// The engine schedules oscillator notes from the station data. No audio
// assets, no DOM. In Node (no AudioContext) createSynthEngine returns null
// and the logic above still works — that is what the headless tests use.
export function createSynthEngine() {
  const AC = typeof window !== 'undefined'
    ? (window.AudioContext || window.webkitAudioContext)
    : (typeof globalThis !== 'undefined' ? globalThis.AudioContext : undefined);
  if (!AC) return null;
  const ctx = new AC();
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  return { ctx, master, timer: null, step: 0 };
}

export function startStation(engine, radio, wantedStars) {
  if (!engine) return false;
  stopStation(engine);
  const station = currentStation(radio);
  if (radio.muted || station.bpm === 0) return true; // talk: no music bed
  const beatS = 60 / effectiveBpm(station, wantedStars);
  engine.timer = setInterval(() => {
    if (radio.muted) return;
    const root = station.roots[engine.step % station.roots.length];
    engine.step += 1;
    const osc = engine.ctx.createOscillator();
    osc.type = station.wave;
    osc.frequency.value = root * 2;
    const gain = engine.ctx.createGain();
    gain.gain.setValueAtTime(0.12, engine.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, engine.ctx.currentTime + beatS * 0.9);
    osc.connect(gain);
    gain.connect(engine.master);
    osc.start();
    osc.stop(engine.ctx.currentTime + beatS);
  }, beatS * 1000);
  return true;
}

export function stopStation(engine) {
  if (!engine || !engine.timer) return;
  clearInterval(engine.timer);
  engine.timer = null;
}

// --- Synth SFX descriptors (data; the browser plays them via the engine) ---
// Each SFX is a list of { wave, freqFrom, freqTo, durS, gain } blips.
export const SFX = {
  gunshot: [{ wave: 'square', freqFrom: 900, freqTo: 120, durS: 0.12, gain: 0.5 }],
  siren: [
    { wave: 'sine', freqFrom: 700, freqTo: 950, durS: 0.4, gain: 0.15 },
    { wave: 'sine', freqFrom: 950, freqTo: 700, durS: 0.4, gain: 0.15 },
  ],
  engine: [{ wave: 'sawtooth', freqFrom: 60, freqTo: 90, durS: 0.5, gain: 0.08 }],
  pickup: [
    { wave: 'sine', freqFrom: 660, freqTo: 660, durS: 0.08, gain: 0.2 },
    { wave: 'sine', freqFrom: 880, freqTo: 880, durS: 0.12, gain: 0.2 },
  ],
  crash: [{ wave: 'sawtooth', freqFrom: 200, freqTo: 40, durS: 0.5, gain: 0.4 }],
  heliDown: [
    { wave: 'sawtooth', freqFrom: 300, freqTo: 50, durS: 1.6, gain: 0.4 },
    { wave: 'square', freqFrom: 150, freqTo: 30, durS: 1.6, gain: 0.3 },
  ],
};

export function playSfx(engine, radio, name) {
  if (!engine || radio.muted || !SFX[name]) return false;
  const now = engine.ctx.currentTime;
  for (const blip of SFX[name]) {
    const osc = engine.ctx.createOscillator();
    osc.type = blip.wave;
    osc.frequency.setValueAtTime(blip.freqFrom, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, blip.freqTo), now + blip.durS);
    const gain = engine.ctx.createGain();
    gain.gain.setValueAtTime(blip.gain, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + blip.durS);
    osc.connect(gain);
    gain.connect(engine.master);
    osc.start(now);
    osc.stop(now + blip.durS);
  }
  return true;
}
