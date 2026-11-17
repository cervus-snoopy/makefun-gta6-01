// world.js — seeded city generation for PORT MERCER (LEON BAY district).
// Deterministic: same seed -> same city. mulberry32 PRNG, grid city.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const WORLD = 3200;      // world is WORLD x WORLD px
export const PITCH = 260;       // block pitch
export const ROAD = 64;         // road width
export const HALF_ROAD = ROAD / 2;

export function createWorld(seed) {
  const rnd = mulberry32(seed);
  const buildings = [];   // {x,y,w,h,color,roof}
  const parks = [];       // {x,y,w,h}
  const palette = ['#5a6b7d', '#7d6a5a', '#4d5a6b', '#6b5a7d', '#5a7d6b', '#8a7a5a', '#46586b'];
  const COLS = 12, ROWS = 12;
  for (let bx = 0; bx < COLS; bx++) {
    for (let by = 0; by < ROWS; by++) {
      const x0 = bx * PITCH + HALF_ROAD + 6;
      const y0 = by * PITCH + HALF_ROAD + 6;
      const w = PITCH - ROAD - 12, h = PITCH - ROAD - 12;
      if (x0 + w > 2980) continue; // east strip is beach, no buildings
      const r = rnd();
      if (r < 0.14) { parks.push({ x: x0, y: y0, w, h }); continue; }
      const n = 1 + Math.floor(rnd() * 3); // 1-3 buildings per block
      if (n === 1) {
        buildings.push({ x: x0 + 14, y: y0 + 14, w: w - 28, h: h - 28, color: palette[Math.floor(rnd() * palette.length)] });
      } else {
        const cols = 2, cw = w / cols;
        for (let i = 0; i < n; i++) {
          const cx = x0 + (i % cols) * cw, cy = y0 + Math.floor(i / cols) * (h / 2);
          buildings.push({ x: cx + 8, y: cy + 8, w: cw - 16, h: h / 2 - 16, color: palette[Math.floor(rnd() * palette.length)] });
        }
      }
    }
  }
  // Landmarks: plaza + pier
  parks.push({ x: 5 * PITCH + 40, y: 5 * PITCH + 40, w: PITCH - 80, h: PITCH - 80 });
  return { seed, buildings, parks, rnd };
}

// Is (x,y) on a road? Roads are centred on multiples of PITCH.
export function isRoad(x, y) {
  const dx = Math.abs(((x % PITCH) + PITCH) % PITCH - 0);
  const nearX = Math.min(dx, PITCH - dx);
  const dy = Math.abs(((y % PITCH) + PITCH) % PITCH);
  const nearY = Math.min(dy, PITCH - dy);
  return nearX < HALF_ROAD || nearY < HALF_ROAD;
}

// Nearest road-centre coordinate on one axis (for traffic lane snapping).
export function roadCentre(v) { return Math.round(v / PITCH) * PITCH; }

// Collision: buildings + world bounds + water (x > 3120).
export function collides(world, x, y, r) {
  if (x < r || y < r || x > WORLD - r || y > WORLD - r) return true;
  if (x > 3120) return true; // the bay water
  for (const b of world.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
  }
  return false;
}

// Slide movement: try full move, then x-only, then y-only.
export function moveWithCollision(world, e, nx, ny, r) {
  if (!collides(world, nx, ny, r)) { e.x = nx; e.y = ny; return; }
  if (!collides(world, nx, e.y, r)) { e.x = nx; return; }
  if (!collides(world, e.x, ny, r)) { e.y = ny; return; }
}

// Random point on a road (for spawning traffic / police).
export function randomRoadPoint(rnd) {
  const vertical = rnd() < 0.5;
  const line = Math.floor(rnd() * 12) * PITCH;
  const along = 80 + rnd() * (WORLD - 160);
  return vertical ? { x: line, y: along } : { x: along, y: line };
}

// Random sidewalk point (for pedestrians).
export function randomSidewalkPoint(rnd) {
  const bx = Math.floor(rnd() * 12), by = Math.floor(rnd() * 12);
  return {
    x: bx * PITCH + HALF_ROAD + 8 + rnd() * (PITCH - ROAD - 16),
    y: by * PITCH + HALF_ROAD + 8 + rnd() * (PITCH - ROAD - 16),
  };
}
