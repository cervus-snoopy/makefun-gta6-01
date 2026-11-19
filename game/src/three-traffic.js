// three-traffic.js — PORT MERCER 3D: traffic cars + pedestrians (logic only).
// Pure state updates over plain objects; the render layer (Stage 2) only draws
// what these functions move. No three.js, no DOM here.

import { CITY_HALF, roadCenters, isOnRoad, nearestRoadPoint, distance, mulberry32, range, pick } from './three-city.js';

export const TRAFFIC_COUNT = 27;
export const PEDESTRIAN_COUNT = 48;
export const TRAFFIC_SPEED_MIN = 9;
export const TRAFFIC_SPEED_MAX = 16;

const CAR_COLORS = ['#c0392b', '#2e86c1', '#f1c40f', '#7d3c98', '#e67e22', '#95a5a6', '#1abc9c', '#ecf0f1', '#2c3e50'];

// Original model names (ours, not the top-3 entries'): the HUD car panel
// names the car Leon is driving, and the cover shot names it too.
export const CAR_MODELS = [
  'MERCER GT', 'GULLWING COUPE', 'PALM ROYALE', 'HARBOUR S',
  'SPIRE GT', 'DUNE RUNNER', 'CORAL CABRIO', 'FURNACE HAULER',
];
export const TAXI_MODEL = 'GULL CAB';

// Deterministic per-entity noise: same (id, counter) => same value in [0, 1).
// Keeps traffic/pedestrian behaviour replay-identical without Math.random.
export function hashId(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function deterministicNoise(id, counter) {
  return mulberry32((hashId(id) + counter * 2654435761) >>> 0)();
}

// A traffic car drives along one road axis; at an intersection it may turn.
// pos {x,z}, axis 'x' | 'z', dir +1 | -1, speed units/s.
export function createTrafficCar(rng, id) {
  const lines = roadCenters();
  const axis = rng() < 0.5 ? 'x' : 'z';
  const line = pick(rng, lines);
  const along = range(rng, -CITY_HALF + 20, CITY_HALF - 20);
  const dir = rng() < 0.5 ? 1 : -1;
  return {
    id,
    kind: 'traffic',
    axis,
    dir,
    x: axis === 'x' ? along : line,
    z: axis === 'x' ? line : along,
    speed: range(rng, TRAFFIC_SPEED_MIN, TRAFFIC_SPEED_MAX),
    cruiseSpeed: 0,
    color: pick(rng, CAR_COLORS),
    model: pick(rng, CAR_MODELS),
    health: 100, // car condition % (HUD car panel; ramming lowers it)
    taxi: false,
    stopped: false,
  };
}

export function createTraffic(seed, count = TRAFFIC_COUNT) {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  const cars = [];
  for (let i = 0; i < count; i++) {
    const car = createTrafficCar(rng, `traffic-${i}`);
    car.cruiseSpeed = car.speed;
    cars.push(car);
  }
  // traffic-0 is the Gullhaven taxi (yellow cab, beachfront shot traffic).
  cars[0].taxi = true;
  cars[0].model = TAXI_MODEL;
  cars[0].color = '#f1c40f';
  return cars;
}

// Slow for the car ahead on the same lane; stop instead of overlapping.
function carAhead(cars, self) {
  let best = null;
  let bestGap = Infinity;
  for (const other of cars) {
    if (other === self || other.axis !== self.axis || other.dir !== self.dir) continue;
    // Same lane: same road line on the cross axis (within half a lane).
    const crossSelf = self.axis === 'x' ? self.z : self.x;
    const crossOther = other.axis === 'x' ? other.z : other.x;
    if (Math.abs(crossSelf - crossOther) > 4) continue;
    const alongSelf = self.axis === 'x' ? self.x : self.z;
    const alongOther = other.axis === 'x' ? other.x : other.z;
    const gap = (alongOther - alongSelf) * self.dir;
    if (gap > 0 && gap < bestGap) {
      bestGap = gap;
      best = other;
    }
  }
  return { car: best, gap: bestGap };
}

export function updateTrafficCar(car, cars, dt) {
  const { car: ahead, gap } = carAhead(cars, car);
  if (ahead && gap < 14) {
    car.speed = 0;
    car.stopped = true;
  } else if (ahead && gap < 26) {
    car.speed = Math.min(car.speed, ahead.speed * 0.6);
    car.stopped = false;
  } else {
    car.speed = car.cruiseSpeed;
    car.stopped = false;
  }

  const step = car.speed * car.dir * dt;
  if (car.axis === 'x') car.x += step;
  else car.z += step;

  // At an intersection (within 2 units of a cross line), chance to turn.
  // Deterministic: the decision stream is seeded from the car id + how many
  // intersections it has already crossed, so replays are identical.
  const lines = roadCenters();
  const along = car.axis === 'x' ? car.x : car.z;
  const cross = car.axis === 'x' ? car.z : car.x;
  const nearLine = lines.find((l) => Math.abs(along - l) < 2.5);
  if (nearLine !== undefined && !car._atIntersection) {
    car._atIntersection = true;
    car.passes = (car.passes || 0) + 1;
    const rng = mulberry32(hashId(car.id) + car.passes * 7919);
    if (rng() < 0.35) {
      // Turn onto the crossing road: swap axis, snap to the intersection.
      const newAxis = car.axis === 'x' ? 'z' : 'x';
      const newDir = rng() < 0.5 ? 1 : -1;
      if (newAxis === 'x') {
        car.x = nearLine;
        car.z = cross;
      } else {
        car.z = nearLine;
        car.x = cross;
      }
      car.axis = newAxis;
      car.dir = newDir;
    }
  } else if (nearLine === undefined) {
    car._atIntersection = false;
  }

  // Wrap around the world edges so traffic never runs dry.
  if (car.axis === 'x' && (car.x > CITY_HALF + 20 || car.x < -CITY_HALF - 20)) {
    car.x = car.dir > 0 ? -CITY_HALF - 20 : CITY_HALF + 20;
  }
  if (car.axis === 'z' && (car.z > CITY_HALF + 20 || car.z < -CITY_HALF - 20)) {
    car.z = car.dir > 0 ? -CITY_HALF - 20 : CITY_HALF + 20;
  }
  return car;
}

export function updateTraffic(cars, dt) {
  for (const car of cars) updateTrafficCar(car, cars, dt);
  return cars;
}

// --- Pedestrians -----------------------------------------------------------

export function createPedestrian(rng, id) {
  // Start on a sidewalk: just off a road line, inside a block edge.
  const lines = roadCenters();
  const line = pick(rng, lines);
  const along = range(rng, -CITY_HALF + 20, CITY_HALF - 20);
  const side = rng() < 0.5 ? -1 : 1;
  const offset = 10 + rng() * 6; // sidewalk band, off the road
  const onXRoad = rng() < 0.5;
  return {
    id,
    kind: 'pedestrian',
    x: onXRoad ? along : line + side * offset,
    z: onXRoad ? line + side * offset : along,
    heading: range(rng, 0, Math.PI * 2),
    speed: range(rng, 1.2, 2.2),
    fleeing: false,
    fleeUntil: 0,
  };
}

export function createPedestrians(seed, count = PEDESTRIAN_COUNT) {
  const rng = mulberry32(seed ^ 0x51ab3f2d);
  const peds = [];
  for (let i = 0; i < count; i++) peds.push(createPedestrian(rng, `ped-${i}`));
  return peds;
}

// Flee from a danger point (gunfire, speeding car): run away for 3 s.
export function scarePedestrians(peds, danger, now, radius = 60) {
  for (const p of peds) {
    if (distance(p, danger) < radius) {
      p.fleeing = true;
      p.fleeUntil = now + 3;
      p.heading = Math.atan2(p.z - danger.z, p.x - danger.x);
      p.speed = 5.5;
    }
  }
}

export function updatePedestrian(p, dt, now) {
  if (p.fleeing && now > p.fleeUntil) {
    p.fleeing = false;
    p.speed = 1.2 + deterministicNoise(p.id, p.steps || 0) * 1.0;
  }
  if (!p.fleeing) {
    // Wander: heading drift driven by a deterministic per-ped stream.
    p.steps = (p.steps || 0) + 1;
    if (p.steps % 240 === 0) {
      p.heading = deterministicNoise(p.id, p.steps) * Math.PI * 2;
    }
  }
  p.x += Math.cos(p.heading) * p.speed * dt;
  p.z += Math.sin(p.heading) * p.speed * dt;
  // Keep inside the city; bounce off the edge.
  if (p.x > CITY_HALF || p.x < -CITY_HALF) p.heading = Math.PI - p.heading;
  if (p.z > CITY_HALF || p.z < -CITY_HALF) p.heading = -p.heading;
  p.x = Math.max(-CITY_HALF, Math.min(CITY_HALF, p.x));
  p.z = Math.max(-CITY_HALF, Math.min(CITY_HALF, p.z));
  return p;
}

export function updatePedestrians(peds, dt, now) {
  for (const p of peds) updatePedestrian(p, dt, now);
  return peds;
}

// Shared query helpers (used by police + missions).
export function nearestTrafficCar(cars, pos) {
  let best = null;
  let bestD = Infinity;
  for (const c of cars) {
    const d = distance(c, pos);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best ? { car: best, distance: bestD } : null;
}

export { isOnRoad, nearestRoadPoint };
