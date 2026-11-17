// missions.js — story thread "THE BROKER'S LEDGER" + 3 missions for Jules Rook.
// Missions are a small state machine driven by game events; update() runs each tick.
import { PITCH } from './world.js';
import { addWanted } from './entities.js';

export const STORY_INTRO =
  'Port Mercer, 2026. Jules Rook is back in Leon Bay with $250, a borrowed pistol ' +
  'and a debt to The Broker. Three jobs. Pay it off — or the city keeps you.';

export function makeMissions() {
  return {
    index: 0,            // 0..2 current mission, 3 = story complete
    phase: 'idle',       // idle | active | done
    timer: 0,
    target: null,        // {x,y,label}
    text: 'Press ENTER to start the first job',
    sub: '',
    done: false,
    reward: 0,
  };
}

export const MISSION_DEFS = [
  {
    id: 1, title: 'FIRST WHEELS', reward: 500,
    brief: 'The Broker needs wheels. Jack any car on the street (walk up, press E).',
    start(G) {
      G.missions.text = 'Jack any car (walk up to it, press E)';
      G.missions.sub = 'Any car will do — parked or in traffic.';
    },
    onJack(G) {
      completeMission(G, 'Clean steal. The Broker is watching.');
    },
  },
  {
    id: 2, title: 'THE PICKUP', reward: 800,
    brief: 'Drive the package to the marina drop before the clock runs out. 75 seconds.',
    start(G) {
      const t = { x: 11 * PITCH, y: 11 * PITCH, label: 'MARINA DROP' };
      G.missions.target = t;
      G.missions.timer = 75;
      G.missions.text = 'Drive to the MARINA DROP — 75s';
      G.missions.sub = 'Follow the yellow marker. Stay in the car.';
    },
    update(G, dt) {
      const m = G.missions;
      m.timer -= dt;
      m.text = `Drive to the MARINA DROP — ${Math.max(0, Math.ceil(m.timer))}s left`;
      const p = G.player;
      if (m.target && Math.hypot(p.x - m.target.x, p.y - m.target.y) < 70) {
        completeMission(G, 'Package delivered. $800 in the glovebox.');
      } else if (m.timer <= 0) {
        failMission(G, 'Too slow — the buyer walked. The Broker is not happy.');
      }
    },
  },
  {
    id: 3, title: 'HEAT WAVE', reward: 1500,
    brief: 'The cops are on you. Survive the heat, then drop the package at the beach.',
    start(G) {
      addWanted(G, 3);
      G.missions.timer = 45;
      const t = { x: 11 * PITCH, y: 2 * PITCH, label: 'BEACH DROP' };
      G.missions.target = t;
      G.missions.text = 'Survive the heat — 45s, then reach the BEACH DROP';
      G.missions.sub = 'Wanted 3 stars. Lose them or outrun them.';
    },
    update(G, dt) {
      const m = G.missions;
      if (m.timer > 0) {
        m.timer -= dt;
        m.text = `Survive the heat — ${Math.max(0, Math.ceil(m.timer))}s`;
        if (m.timer <= 0) {
          m.text = 'Heat survived! Now reach the BEACH DROP';
          m.sub = 'Deliver the package to finish the job.';
        }
        return;
      }
      const p = G.player;
      if (m.target && Math.hypot(p.x - m.target.x, p.y - m.target.y) < 70) {
        completeMission(G, 'Debt paid. Port Mercer is yours, Rook.');
      }
    },
  },
];

function completeMission(G, msg) {
  const m = G.missions;
  const def = MISSION_DEFS[m.index];
  G.player.cash += def.reward;
  m.reward = def.reward;
  m.phase = 'done';
  m.text = msg;
  m.sub = `+ $${def.reward}  •  Mission ${def.id} complete`;
  m.target = null;
  G.sfx('mission');
  G.toast(`${def.title} COMPLETE  •  +$${def.reward}`);
  G.autosave();
  m.index++;
  if (m.index >= MISSION_DEFS.length) {
    m.done = true;
    m.phase = 'done';
    m.text = 'STORY COMPLETE — The Broker is paid. Free roam: explore Port Mercer.';
    m.sub = 'All three jobs done. The city is yours.';
  } else {
    m.phase = 'idle';
    m.text = `Next job: ${MISSION_DEFS[m.index].title} — press ENTER to start`;
    m.sub = MISSION_DEFS[m.index].brief;
  }
}

function failMission(G, msg) {
  const m = G.missions;
  m.phase = 'idle';
  m.target = null;
  m.text = msg;
  m.sub = 'Press ENTER to retry the job.';
  G.sfx('fail');
  G.toast('MISSION FAILED');
}

export function startMission(G) {
  const m = G.missions;
  if (m.done || m.phase === 'active') return;
  if (m.index >= MISSION_DEFS.length) return;
  const def = MISSION_DEFS[m.index];
  m.phase = 'active';
  m.timer = 0;
  def.start(G);
  G.toast(`${def.title} — ${def.brief}`);
  G.sfx('mission');
}

export function updateMissions(G, dt) {
  const m = G.missions;
  if (m.phase !== 'active') return;
  const def = MISSION_DEFS[m.index];
  if (def && def.update) def.update(G, dt);
}
