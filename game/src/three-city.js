// three-city.js — PORT MERCER 3D: seeded city generation (data only, no rendering).
// Pure data + queries. Render-independent: Stage 2 turns this data into three.js meshes.
// Written fresh for the 3D rebuild from the story bible + design brief (Stage 1).

export const DEFAULT_SEED = 20261118;

// World layout: 12 x 12 blocks. Each block is 64 units, roads are 16 units wide,
// so the pitch is 80 and the city spans 960 x 960 centred on (0, 0).
export const BLOCK_SIZE = 64;
export const ROAD_WIDTH = 16;
export const BLOCK_PITCH = BLOCK_SIZE + ROAD_WIDTH; // 80
export const BLOCKS_PER_SIDE = 12;
export const CITY_SIZE = BLOCKS_PER_SIDE * BLOCK_PITCH; // 960
export const CITY_HALF = CITY_SIZE / 2; // 480

// Deterministic RNG (mulberry32). Same seed => same city, every run.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng, min, max) {
  return min + rng() * (max - min);
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Districts are quadrants. x < 0 is west, z < 0 is north.
export const DISTRICTS = [
  {
    id: 'furnace-row',
    name: 'FURNACE ROW',
    quadrant: { xMin: -CITY_HALF, xMax: 0, zMin: -CITY_HALF, zMax: 0 },
    flavour: 'Factories, warehouses, smoke. Where debts are collected.',
    // v2 signature details (2): distant hammers all day; the old water
    // tower with "MERCER" in rusted letters, visible from every district.
    details: [
      'Sound: distant hammers, all day.',
      'The old water tower with "MERCER" in rusted letters, visible from every district.',
    ],
    palette: ['#6b6f75', '#7a7d84', '#5a5e66'],
    maxHeight: 22,
  },
  {
    id: 'gullhaven',
    name: 'GULLHAVEN',
    quadrant: { xMin: 0, xMax: CITY_HALF, zMin: -CITY_HALF, zMax: 0 },
    flavour: 'Docks, diner, pawn shop, cheap motels. Leon\u2019s ground.',
    // v2 signature details: the Diner's neon sign flickers on the second
    // "L"; the Pawn shop's barred window; the Motel's pool empty since '19.
    details: [
      'The Diner\u2019s neon sign flickers on the second "L".',
      'The Pawn shop\u2019s barred window; the Motel\u2019s pool has been empty since \u201919.',
    ],
    palette: ['#8a7f6a', '#7d8a94', '#a08b74'],
    maxHeight: 30,
  },
  {
    id: 'old-mercer',
    name: 'OLD MERCER',
    quadrant: { xMin: -CITY_HALF, xMax: 0, zMin: 0, zMax: CITY_HALF },
    flavour: 'Rook\u2019s Garage, narrow streets, the old city. Where Leon grew up.',
    // v2 signature details: Rook's Garage hand-painted sign; Marlow Lane,
    // the house with the blue door — Leon's childhood home, lights always off.
    details: [
      'Rook\u2019s Garage with the hand-painted sign.',
      'Marlow Lane: the house with the blue door \u2014 Leon\u2019s childhood home, lights always off.',
    ],
    palette: ['#9c8a6d', '#8f7d63', '#a89468'],
    maxHeight: 26,
  },
  {
    id: 'palm-court',
    name: 'PALM COURT',
    quadrant: { xMin: 0, xMax: CITY_HALF, zMin: 0, zMax: CITY_HALF },
    flavour: 'Money. Dante\u2019s counting house, bright lights, the highest heat.',
    // v2 signature details: valet parking, palm trees in concrete planters,
    // the counting house behind bright lights. Highest heat: 1 star just
    // for speeding here (see PALM_COURT_SPEEDING_STARS).
    details: [
      'Valet parking, palm trees in concrete planters, the counting house behind bright lights.',
      'Highest heat in the city: 1 star just for speeding here.',
    ],
    palette: ['#b8a888', '#c9b48a', '#a89a7c'],
    maxHeight: 64,
  },
];

// v2: speeding in Palm Court costs 1 wanted star ("1 star just for
// speeding here"). Enforced by three-police.js (applyDistrictHeat).
export const PALM_COURT_SPEEDING_STARS = 1;
export const PALM_COURT_SPEEDING_COOLDOWN_S = 10;

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    const q = d.quadrant;
    if (x >= q.xMin && x < q.xMax && z >= q.zMin && z < q.zMax) return d;
  }
  // On the exact centre lines, fall through to the nearest quadrant.
  if (x >= 0 && z >= 0) return DISTRICTS[3];
  if (x >= 0) return DISTRICTS[1];
  if (z >= 0) return DISTRICTS[2];
  return DISTRICTS[0];
}

// Road centre lines: one per block boundary, 13 lines per axis.
export function roadCenters() {
  const lines = [];
  for (let i = 0; i <= BLOCKS_PER_SIDE; i++) lines.push(-CITY_HALF + i * BLOCK_PITCH);
  return lines;
}

export function blockCenter(bx, bz) {
  return {
    x: -CITY_HALF + bx * BLOCK_PITCH + BLOCK_PITCH / 2,
    z: -CITY_HALF + bz * BLOCK_PITCH + BLOCK_PITCH / 2,
  };
}

export function blockIndex(v) {
  return Math.max(0, Math.min(BLOCKS_PER_SIDE - 1, Math.floor((v + CITY_HALF) / BLOCK_PITCH)));
}

// Road test: a point is on a road when it lies within ROAD_WIDTH/2
// of any road centre line on either axis.
export function isOnRoad(x, z) {
  const lines = roadCenters();
  const near = (v) => lines.some((c) => Math.abs(v - c) <= ROAD_WIDTH / 2);
  return near(x) || near(z);
}

// Named places. Block coords are (bx, bz) with 0,0 at the north-west corner.
// v2: every place carries 2 signature details, and each place DOES something
// (story + systems, not labels).
export const PLACES = [
  {
    id: 'salty-gull-diner',
    name: 'Salty Gull Diner',
    districtId: 'gullhaven',
    block: { bx: 9, bz: 2 },
    role: 'job briefings at the back booth; Sal\u2019s one line; Iris\u2019s studio upstairs; raided in M5',
    details: [
      'The neon sign flickers on the second "L".',
      'Iris Vale\u2019s BAY TALK studio is upstairs; the back booth hides the ledger (third tile).',
    ],
  },
  {
    id: 'bayview-pawn',
    name: 'Bayview Pawn',
    districtId: 'gullhaven',
    block: { bx: 8, bz: 4 },
    role: 'M2 pickup point; buy armour ($400 full) and ammo ($50/box); sell hot goods (10\u201340% of value)',
    details: [
      'The barred window — nothing leaves this shop without a receipt.',
      'M2 pickup point: the taped shoebox waits behind the counter.',
    ],
  },
  {
    id: 'coral-motel',
    name: 'Coral Motel',
    districtId: 'gullhaven',
    block: { bx: 10, bz: 4 },
    role: 'M2 delivery point; slots in the bar ($50/pull, jackpot $1,000); lay low \u2014 wanted decays 2x faster here',
    details: [
      'The pool has been empty since \u201919.',
      'Slots in the bar, handwritten note: "OUT OF ORDER \u2014 PLAY AT OWN RISK." Lay low here: wanted decays 2x faster.',
    ],
  },
  {
    id: 'rooks-garage',
    name: 'Rook\u2019s Garage',
    districtId: 'old-mercer',
    block: { bx: 2, bz: 9 },
    role: 'M1 destination; respray $300 (5 colours, resets the police description); repairs; Rook\u2019s advice',
    details: [
      'The hand-painted sign, touched up every spring by Rook himself.',
      'Respray bay out back \u2014 five colours, one flat $300, and the police forget your car.',
    ],
  },
  {
    id: 'counting-house',
    name: 'Dante\u2019s Counting House',
    districtId: 'palm-court',
    block: { bx: 9, bz: 9 },
    role: 'Dante\u2019s money; M4 van route hub; M6 finale target (safe holds the ledger\u2019s second copy + $3,000 payoff cash)',
    details: [
      'Behind bright lights, behind valet parking and palm trees in concrete planters.',
      'The safe in the back room holds the ledger\u2019s second copy and the Broker\u2019s payoff cash.',
    ],
  },
  {
    id: 'bay-talk-studio',
    name: 'Bay Talk Studio',
    districtId: 'gullhaven',
    // v2: Iris broadcasts from a studio ABOVE the Salty Gull Diner — same
    // block as the diner, upstairs. M6 stage 3 ends here.
    block: { bx: 9, bz: 2 },
    role: 'Iris Vale\u2019s studio above the Diner; M6 finale destination \u2014 broadcast the names, or burn the book',
    details: [
      'Upstairs above the Diner, past the kitchen stairs that smell of salt and coffee.',
      'The ON AIR light is the only red light in Gullhaven that never lies.',
    ],
  },
];

export const LANDMARK = {
  id: 'mercer-spire',
  name: 'MERCER SPIRE',
  // Centre plaza block (bx 6, bz 6): the Spire occupies the block, no other
  // buildings are generated there.
  block: { bx: 6, bz: 6 },
  // v2: 40 stories; beacon blinks every 4 seconds; the finale happens in
  // its shadow. 40 stories at 4 units a story = 160 units tall.
  height: 160,
  stories: 40,
  beaconBlinkS: 4,
  role: 'landmark; M3 drop point; the finale happens in its shadow',
};

// v2: laying low at the Coral Motel makes wanted decay 2x faster.
export const MOTEL_LAY_LOW_RADIUS = 60;
export const MOTEL_DECAY_MULTIPLIER = 2;

// Landmarks (top-3 template §4: a landmark in the frame, never just generic
// buildings). The pier + Ferris wheel sit on the Gullhaven beachfront (east
// edge, x > 470); the HARBOUR FM billboard faces Palm Court traffic.
export const PIER = {
  id: 'gullhaven-pier',
  name: 'Gullhaven Pier',
  x: 505, z: -120, // deck centre; deck runs x 470 -> 540, 12 wide
  length: 70, width: 12,
  role: 'beachfront landmark; the R2 slot — pier + sea in the city shot',
};
export const FERRIS_WHEEL = {
  id: 'gullhaven-wheel',
  name: 'Gullhaven Wheel',
  x: 508, z: -200,
  radius: 26, height: 58,
  role: 'Ferris-wheel-equivalent landmark on the Gullhaven beachfront',
};
export const BILLBOARDS = [
  {
    id: 'harbour-fm-billboard',
    text: 'HARBOUR FM',
    sub: '88.3 · NEON DRIVE',
    x: 8, z: 120, // east edge of the x=0 road, northbound — the cover shot's right-hand landmark (verified clear: block 6,7's only building spans x 30..48)
    w: 34, h: 10, y: 16,
    bg: [24, 8, 32, 255], fg: [255, 92, 122, 255],
    role: 'radio as scenery — the cover shot\u2019s right-hand landmark',
  },
  {
    id: 'spire-billboard',
    text: 'MERCER SPIRE',
    sub: '40 STOREYS · LEON BAY',
    x: 120, z: -120, // Furnace Row / Gullhaven edge, faces the Spire plaza
    w: 30, h: 9, y: 15,
    bg: [8, 16, 28, 255], fg: [241, 196, 15, 255],
    role: 'second billboard, seen from the beachfront shot',
  },
];
// Neon signs mounted on the named places (drawn with the same bitmap font
// as the HUD, so the sign text and the HUD text are one typeface).
export const NEON_SIGNS = [
  { placeId: 'salty-gull-diner', text: 'SALTY GULL DINER', fg: [255, 92, 122, 255], y: 12 },
  { placeId: 'bayview-pawn', text: 'BAYVIEW PAWN', fg: [241, 196, 15, 255], y: 10 },
  { placeId: 'coral-motel', text: 'CORAL MOTEL', fg: [46, 204, 113, 255], y: 10 },
  { placeId: 'rooks-garage', text: "ROOK'S GARAGE", fg: [52, 152, 219, 255], y: 10 },
];
// Beach umbrellas on the sand strip (east edge), seeded positions.
export const UMBRELLAS = [
  { x: 484, z: -240 }, { x: 488, z: -200 }, { x: 482, z: -160 },
  { x: 486, z: -80 }, { x: 484, z: -40 }, { x: 490, z: 40 },
  { x: 483, z: 120 }, { x: 487, z: 200 }, { x: 485, z: 280 },
];

export function placeById(id) {
  return PLACES.find((p) => p.id === id) || null;
}

export function placePosition(place) {
  return blockCenter(place.block.bx, place.block.bz);
}

export function landmarkPosition() {
  return blockCenter(LANDMARK.block.bx, LANDMARK.block.bz);
}

// Seeded city generation. Returns plain data only:
//   { seed, districts, roads, blocks, buildings, parks, beach, spire, places }
// Buildings are footprints { x, z, w, d, h, color, districtId, block }.
export function generateCity(seed = DEFAULT_SEED) {
  const rng = mulberry32(seed);
  const roads = roadCenters();
  const buildings = [];
  const parks = [];
  const spirePos = landmarkPosition();

  // Parks: 6 seeded blocks, never the Spire block, never a place block.
  const placeBlocks = new Set(PLACES.map((p) => `${p.block.bx},${p.block.bz}`));
  placeBlocks.add(`${LANDMARK.block.bx},${LANDMARK.block.bz}`);
  const parkBlocks = new Set();
  while (parkBlocks.size < 6) {
    const bx = Math.floor(rng() * BLOCKS_PER_SIDE);
    const bz = Math.floor(rng() * BLOCKS_PER_SIDE);
    const key = `${bx},${bz}`;
    if (!placeBlocks.has(key)) parkBlocks.add(key);
  }
  for (const key of parkBlocks) {
    const [bx, bz] = key.split(',').map(Number);
    const c = blockCenter(bx, bz);
    parks.push({ block: { bx, bz }, x: c.x, z: c.z, size: BLOCK_SIZE });
  }

  for (let bx = 0; bx < BLOCKS_PER_SIDE; bx++) {
    for (let bz = 0; bz < BLOCKS_PER_SIDE; bz++) {
      const key = `${bx},${bz}`;
      if (parkBlocks.has(key)) continue;
      const c = blockCenter(bx, bz);
      const district = districtAt(c.x, c.z);
      if (bx === LANDMARK.block.bx && bz === LANDMARK.block.bz) continue; // Spire plaza
      const isPlace = placeBlocks.has(key);
      // 1-3 buildings per block (places get exactly 1, their named building).
      const count = isPlace ? 1 : 1 + Math.floor(rng() * 3);
      for (let i = 0; i < count; i++) {
        const w = range(rng, 14, isPlace ? 34 : 26);
        const d = range(rng, 14, isPlace ? 30 : 26);
        const ox = isPlace ? 0 : range(rng, -14, 14);
        const oz = isPlace ? 0 : range(rng, -14, 14);
        buildings.push({
          x: c.x + ox,
          z: c.z + oz,
          w,
          d,
          h: Math.round(range(rng, 8, district.maxHeight)),
          color: pick(rng, district.palette),
          districtId: district.id,
          block: { bx, bz },
          placeId: isPlace ? PLACES.find((p) => p.block.bx === bx && p.block.bz === bz)?.id ?? null : null,
        });
      }
    }
  }

  // Beachfront: a sand strip along the east edge (Gullhaven docks side).
  const beach = { xMin: CITY_HALF - 10, xMax: CITY_HALF + 24, zMin: -CITY_HALF, zMax: CITY_HALF };

  return {
    seed,
    districts: DISTRICTS,
    roads,
    buildings,
    parks,
    beach,
    spire: { ...LANDMARK, x: spirePos.x, z: spirePos.z },
    places: PLACES.map((p) => ({ ...p, ...placePosition(p) })),
    pier: PIER,
    ferrisWheel: FERRIS_WHEEL,
    billboards: BILLBOARDS,
    neonSigns: NEON_SIGNS,
    umbrellas: UMBRELLAS,
  };
}

// Collision query against building footprints (and the Spire). Pure: returns
// the first blocking building, or null. `radius` is the query circle radius.
export function blockingBuilding(city, x, z, radius = 1) {
  for (const b of city.buildings) {
    if (Math.abs(x - b.x) < b.w / 2 + radius && Math.abs(z - b.z) < b.d / 2 + radius) return b;
  }
  const s = city.spire;
  if (Math.abs(x - s.x) < 14 + radius && Math.abs(z - s.z) < 14 + radius) return s;
  return null;
}

export function nearestRoadPoint(x, z) {
  const lines = roadCenters();
  const nearest = (v) => lines.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  const nx = nearest(x);
  const nz = nearest(z);
  // Snap to whichever axis line is closer.
  return Math.abs(nx - x) <= Math.abs(nz - z) ? { x: nx, z } : { x, z: nz };
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
