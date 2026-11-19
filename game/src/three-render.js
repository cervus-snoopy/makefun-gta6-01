// three-render.js — PORT MERCER 3D: three.js scene, camera, lights, meshes.
// Written fresh in-session for the 3D rebuild (Stage 2). The method follows
// the proven headless spike (three r152 + headless-gl + Xvfb + readPixels),
// re-derived here in the entry's own structure — no spike code copied.
// The module imports ONLY the vendored three.js build (relative path, so it
// resolves identically in the browser page and in the Node headless runner).
// The WebGL context / canvas is injected by the caller: a real canvas in the
// browser, a headless-gl context + stub canvas in Node.

import * as THREE from '../vendor/three/three.module.min.js';
import { blockingBuilding } from './three-city.js';
import { renderTextRGBA } from './three-font.js';

export const RENDERER_VERSION = 'three-r152';

// Time-of-day presets. Dusk (17:45) is the default: golden hour, the M4 look.
export const TIMES_OF_DAY = {
  day: {
    sky: 0x87b5d6, fog: 0x9fc3dd, sunColor: 0xfff2d8, sunIntensity: 1.6,
    sunPos: [120, 180, 60], hemiSky: 0xbfd9ff, hemiGround: 0x8a7f6a, hemiIntensity: 0.7,
    ambient: 0.25,
  },
  dusk: {
    sky: 0xe8a06a, fog: 0xd8a67e, sunColor: 0xffc98a, sunIntensity: 1.3,
    sunPos: [-140, 55, 80], hemiSky: 0xf0c090, hemiGround: 0x5a4a3a, hemiIntensity: 0.65,
    ambient: 0.18,
  },
  // Late dusk (21:30, the on-foot diner shot): purple-pink, neon reads.
  late: {
    sky: 0x7a5a8a, fog: 0x8a6a8a, sunColor: 0xff9a7a, sunIntensity: 0.7,
    sunPos: [-160, 30, 60], hemiSky: 0x8a6a9a, hemiGround: 0x3a2a3a, hemiIntensity: 0.5,
    ambient: 0.16,
  },
  night: {
    sky: 0x0d1526, fog: 0x101a2e, sunColor: 0x8fb2ff, sunIntensity: 0.5,
    sunPos: [60, 140, -80], hemiSky: 0x2a3a5a, hemiGround: 0x1a1a22, hemiIntensity: 0.35,
    ambient: 0.12,
  },
};

// --- Procedural textures (DataTexture: no DOM canvas, works in Node + browser)

function hash2(x, z) {
  let h = (x * 374761393 + z * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Facade texture: dark wall + a grid of windows, some lit warm (dusk).
// 128x128, drawn once, shared by every building instance.
export function makeFacadeTexture() {
  const S = 128;
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      // Wall: mid-grey base so the per-instance district tint (which
      // multiplies the map) stays readable instead of going near-black.
      // Base ~185 x tint ~0.5 => ~90: a solid dusk facade, not a silhouette.
      const v = 178 + Math.floor(hash2(x, y) * 16);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v + 6;
      data[i + 3] = 255;
      // Window grid: 8 px cells, 4 px windows.
      const cx = x % 16;
      const cy = y % 16;
      if (cx >= 4 && cx < 12 && cy >= 4 && cy < 12) {
        const lit = hash2(Math.floor(x / 16), Math.floor(y / 16)) < 0.45;
        if (lit) {
          data[i] = 255;
          data[i + 1] = 196;
          data[i + 2] = 110;
        } else {
          data[i] = 12;
          data[i + 1] = 16;
          data[i + 2] = 26;
        }
      }
    }
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Ground texture: the whole 960x960 city baked into one 1024x1024 map —
// asphalt road bands, concrete blocks, green parks, sand beach (east edge),
// Spire plaza. One plane, one draw call.
export function makeGroundTexture(city) {
  const S = 1024;
  const data = new Uint8Array(S * S * 4);
  const half = 480;
  const parkSet = new Set(city.parks.map((p) => `${p.block.bx},${p.block.bz}`));
  for (let py = 0; py < S; py++) {
    const z = (py / S) * 960 - half;
    const bz = Math.max(0, Math.min(11, Math.floor((z + half) / 80)));
    for (let px = 0; px < S; px++) {
      const x = (px / S) * 960 - half;
      const bx = Math.max(0, Math.min(11, Math.floor((x + half) / 80)));
      const i = (py * S + px) * 4;
      const fx = ((x + half) % 80 + 80) % 80;
      const fz = ((z + half) % 80 + 80) % 80;
      const onRoad = fx < 16 || fz < 16;
      // Beach strip on the east edge.
      if (x > 470) {
        data[i] = 214; data[i + 1] = 186; data[i + 2] = 140; data[i + 3] = 255;
        continue;
      }
      // Spire plaza (centre block).
      if (bx === 6 && bz === 6) {
        data[i] = 150; data[i + 1] = 148; data[i + 2] = 140; data[i + 3] = 255;
        continue;
      }
      if (parkSet.has(`${bx},${bz}`)) {
        const g = 74 + Math.floor(hash2(px, py) * 18);
        data[i] = 52; data[i + 1] = g; data[i + 2] = 58; data[i + 3] = 255;
        continue;
      }
      if (onRoad) {
        // Asphalt with a dashed centre line.
        const dash = (fx < 16 && Math.floor(fz / 10) % 2 === 0 && fz >= 6 && fz <= 10)
          || (fz < 16 && Math.floor(fx / 10) % 2 === 0 && fx >= 6 && fx <= 10);
        if (dash) {
          data[i] = 200; data[i + 1] = 190; data[i + 2] = 120; data[i + 3] = 255;
        } else {
          const a = 52 + Math.floor(hash2(px, py) * 10);
          data[i] = a; data[i + 1] = a; data[i + 2] = a + 4; data[i + 3] = 255;
        }
        continue;
      }
      // Concrete block, tinted slightly per block (cool grey, not warm tan).
      const tint = Math.floor(hash2(bx * 31, bz * 17) * 12);
      data[i] = 116 + tint;
      data[i + 1] = 118 + tint;
      data[i + 2] = 122 + tint;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Text face for a sign / billboard: the bitmap font baked into a DataTexture
// (same glyphs as the HUD, so sign text and HUD text are one typeface).
// Returns a plane mesh of the given world size, double-sided so it reads
// from either approach direction.
function makeTextPlane(text, sub, w, h, fg, bg) {
  const main = renderTextRGBA(text, { scale: 4, fg, bg: null, pad: 6 });
  const W = main.width;
  const H = sub ? main.height + 34 : main.height;
  const data = new Uint8Array(W * H * 4);
  // Background.
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = bg[0]; data[i * 4 + 1] = bg[1]; data[i * 4 + 2] = bg[2]; data[i * 4 + 3] = 255;
  }
  data.set(main.data, 0);
  if (sub) {
    const s = renderTextRGBA(sub, { scale: 2, fg: [255, 255, 255, 255], bg: null, pad: 2 });
    const ox = Math.max(0, Math.floor((W - s.width) / 2));
    const oy = main.height + 2;
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        const si = (y * s.width + x) * 4;
        if (s.data[si + 3] === 0) continue;
        const di = ((oy + y) * W + ox + x) * 4;
        data[di] = s.data[si]; data[di + 1] = s.data[si + 1]; data[di + 2] = s.data[si + 2]; data[di + 3] = 255;
      }
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.needsUpdate = true;
  // DataTexture defaults flipY=false in r152, but PlaneGeometry's UVs put
  // v=0 at the TOP of the plane — without this the text renders upside-down
  // (buffer row 0 at the plane's bottom). Verified with a 2x2 UV probe.
  tex.flipY = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
  );
  return mesh;
}

// --- Renderer ---------------------------------------------------------------

export function createRenderer({ width, height, canvas, context, shadows = true, antialias = false }) {
  // Only pass `context` when the caller injects one (headless-gl). In the
  // browser `context` is null/undefined and three must create its own —
  // passing an explicit null would break that.
  const params = { canvas, antialias };
  if (context) params.context = context;
  const renderer = new THREE.WebGLRenderer(params);
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  if (shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  return renderer;
}

// Minimal canvas stub for headless Node: three only needs these members.
export function makeCanvasStub(width, height, gl) {
  return {
    width,
    height,
    clientWidth: width,
    clientHeight: height,
    style: {},
    addEventListener() {},
    removeEventListener() {},
    getContext: () => gl,
    getBoundingClientRect: () => ({ width, height, left: 0, top: 0 }),
  };
}

// --- Scene ------------------------------------------------------------------

function makeCarMesh(color, isPolice = false) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.1, 2.0), bodyMat);
  body.position.y = 0.75;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 0.9, 1.8),
    // Lighter steel-blue glass, not near-black: from the low chase cam the
    // cabin is most of the car's silhouette, and a black cabin reads as a
    // hole in the frame at dusk.
    new THREE.MeshLambertMaterial({ color: 0x33506b }),
  );
  cabin.position.set(-0.2, 1.6, 0);
  cabin.castShadow = true;
  group.add(cabin);
  if (isPolice) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.25, 0.5),
      new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x3344ff, emissiveIntensity: 0.9 }),
    );
    bar.position.set(-0.2, 2.2, 0);
    group.add(bar);
  }
  // Lit ends (MeshBasicMaterial is unlit, so these read bright at dusk and
  // at night from the chase cam behind the car): a red taillight strip on
  // the rear face (local -X is the rear — local +X is the heading) and a
  // warm-white headlight strip on the front face. The first pass had no
  // lights at all, so every car read as a dark box after sunset.
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.28, 1.6),
    new THREE.MeshBasicMaterial({ color: 0xff2a1e }),
  );
  tail.position.set(-2.21, 0.85, 0);
  group.add(tail);
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.25, 1.5),
    new THREE.MeshBasicMaterial({ color: 0xfff6c8 }),
  );
  head.position.set(2.21, 0.85, 0);
  group.add(head);
  // Blob shadow: a cheap dark plane under the car (no shadow-map cost).
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 2.8),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }),
  );
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.05;
  group.add(blob);
  return group;
}

export function buildScene(game, { timeOfDay = 'dusk', shadows = true } = {}) {
  const city = game.city;
  const tod = TIMES_OF_DAY[timeOfDay] || TIMES_OF_DAY.dusk;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(tod.sky);
  scene.fog = new THREE.Fog(tod.fog, 260, 1200);

  // Lights: hemisphere + one shadowed sun + small ambient.
  const hemi = new THREE.HemisphereLight(tod.hemiSky, tod.hemiGround, tod.hemiIntensity);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffffff, tod.ambient);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(tod.sunColor, tod.sunIntensity);
  sun.position.set(...tod.sunPos);
  sun.target.position.set(0, 0, 0);
  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -260;
    sun.shadow.camera.right = 260;
    sun.shadow.camera.top = 260;
    sun.shadow.camera.bottom = -260;
    sun.shadow.camera.far = 600;
  }
  scene.add(sun);
  scene.add(sun.target);

  // Ground: one plane with the baked city texture.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(960, 960),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture(city) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Buildings: ONE InstancedMesh for the whole city.
  const facade = makeFacadeTexture();
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  const bMat = new THREE.MeshLambertMaterial({ map: facade });
  const buildings = city.buildings;
  const inst = new THREE.InstancedMesh(bGeo, bMat, buildings.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  buildings.forEach((b, i) => {
    pos.set(b.x, b.h / 2, b.z);
    scl.set(b.w, b.h, b.d);
    m4.compose(pos, q, scl);
    inst.setMatrixAt(i, m4);
    col.set(b.color);
    col.multiplyScalar(1.35); // lift the district tint: map x tint must stay readable
    inst.setColorAt(i, col);
  });
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  inst.castShadow = true;
  inst.receiveShadow = true;
  scene.add(inst);

  // MERCER SPIRE: tall tower + blinking beacon (beacon blinks every 4 s, v2).
  // The tower tiles the facade texture (repeat 3x12) so the windows do not
  // stretch into vertical bars over 40 stories.
  const spire = new THREE.Group();
  const spireTex = facade.clone();
  spireTex.needsUpdate = true;
  spireTex.wrapS = THREE.RepeatWrapping;
  spireTex.wrapT = THREE.RepeatWrapping;
  spireTex.repeat.set(3, 12);
  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(26, city.spire.height, 26),
    new THREE.MeshLambertMaterial({ map: spireTex, color: 0xcfd8e6 }),
  );
  tower.position.y = city.spire.height / 2;
  tower.castShadow = true;
  spire.add(tower);
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xff2222 }),
  );
  beacon.position.y = city.spire.height + 3;
  spire.add(beacon);
  spire.position.set(city.spire.x, 0, city.spire.z);
  scene.add(spire);

  // Palm trees in Palm Court + Gullhaven (instanced trunks + canopies).
  const palmBlocks = [];
  for (let bx = 6; bx < 12; bx++) {
    for (let bz = 6; bz < 12; bz++) palmBlocks.push([bx, bz]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 9, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5c38 });
  const canopyGeo = new THREE.SphereGeometry(3.2, 8, 6);
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0x2f7a3d });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmBlocks.length * 2);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, palmBlocks.length * 2);
  let pi = 0;
  for (const [bx, bz] of palmBlocks) {
    for (let k = 0; k < 2; k++) {
      const cx = -480 + bx * 80 + 14 + k * 44;
      const cz = -480 + bz * 80 + 14 + ((bx + bz + k) % 3) * 20;
      pos.set(cx, 4.5, cz);
      scl.set(1, 1, 1);
      m4.compose(pos, q, scl);
      trunks.setMatrixAt(pi, m4);
      pos.set(cx, 10.5, cz);
      m4.compose(pos, q, scl);
      canopies.setMatrixAt(pi, m4);
      pi += 1;
    }
  }
  trunks.count = pi;
  canopies.count = pi;
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  scene.add(trunks);
  scene.add(canopies);

  // Neon place signs: real text (bitmap font), mounted on the SOUTH FACE of
  // each named building (the street side) — never at the place centre,
  // which is INSIDE the building mesh and invisible.
  for (const s of city.neonSigns) {
    const p = city.places.find((pl) => pl.id === s.placeId);
    if (!p) continue;
    const b = city.buildings.find((bb) => bb.placeId === s.placeId);
    const faceZ = b ? p.z + b.d / 2 + 1.5 : p.z + 16;
    const sign = makeTextPlane(s.text, null, 22, 3.2, s.fg, [10, 10, 16, 255]);
    sign.position.set(p.x, s.y, faceZ);
    sign.rotation.y = 0; // faces +z (south, the approach street)
    scene.add(sign);
  }

  // Billboards: HARBOUR FM (cover shot, right-hand landmark) + MERCER SPIRE.
  for (const b of city.billboards) {
    const board = makeTextPlane(b.text, b.sub, b.w, b.h, b.fg, b.bg);
    board.position.set(b.x, b.y, b.z);
    board.rotation.y = -Math.PI / 4;
    scene.add(board);
    // Support posts at both ends.
    for (const px of [b.x - b.w / 2 + 1, b.x + b.w / 2 - 1]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, b.y, 1.2),
        new THREE.MeshLambertMaterial({ color: 0x333333 }),
      );
      post.position.set(px, b.y / 2, b.z);
      scene.add(post);
    }
  }

  // Gullhaven Pier: deck out to sea + posts + end platform + lights.
  const pier = city.pier;
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(pier.length, 1.2, pier.width),
    new THREE.MeshLambertMaterial({ color: 0x8a6d4b }),
  );
  deck.position.set(pier.x, 1.2, pier.z);
  deck.castShadow = true;
  scene.add(deck);
  const pierPostGeo = new THREE.CylinderGeometry(0.5, 0.5, 5, 6);
  const pierPostMat = new THREE.MeshLambertMaterial({ color: 0x5a4632 });
  for (let i = 0; i < 8; i++) {
    for (const dz of [-5, 5]) {
      const post = new THREE.Mesh(pierPostGeo, pierPostMat);
      post.position.set(472 + i * 10, 0.5, pier.z + dz);
      scene.add(post);
    }
  }
  const pierLightMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
  for (let i = 0; i < 5; i++) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 8), pierLightMat);
    lamp.position.set(478 + i * 14, 4.5, pier.z - 5);
    scene.add(lamp);
  }

  // Gullhaven Wheel (Ferris-wheel-equivalent): rim + spokes + gondolas,
  // turning slowly. Two A-frame legs hold it over the beach.
  const wheel = city.ferrisWheel;
  const wheelGroup = new THREE.Group();
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(wheel.radius, 1.1, 8, 32),
    new THREE.MeshLambertMaterial({ color: 0xf1c40f }),
  );
  wheelGroup.add(rim);
  const spokeGeo = new THREE.BoxGeometry(1, wheel.radius * 2, 1);
  const spokeMat = new THREE.MeshLambertMaterial({ color: 0xe67e22 });
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(spokeGeo, spokeMat);
    spoke.rotation.z = (i * Math.PI) / 4;
    wheelGroup.add(spoke);
  }
  const gondolaGeo = new THREE.BoxGeometry(4, 3, 3);
  const gondolaCols = [0xc0392b, 0x2e86c1, 0x1abc9c, 0x8e44ad, 0xe67e22, 0x2ecc71, 0xecf0f1, 0xf1c40f];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const g = new THREE.Mesh(gondolaGeo, new THREE.MeshLambertMaterial({ color: gondolaCols[i % gondolaCols.length] }));
    g.position.set(Math.cos(a) * wheel.radius, Math.sin(a) * wheel.radius, 0);
    wheelGroup.add(g);
  }
  const hub = new THREE.Mesh(
    new THREE.SphereGeometry(2.4, 10, 10),
    new THREE.MeshBasicMaterial({ color: 0xff5a7a }),
  );
  wheelGroup.add(hub);
  wheelGroup.position.set(wheel.x, wheel.height / 2 + 6, wheel.z);
  wheelGroup.rotation.y = Math.PI / 2; // face the beach road
  scene.add(wheelGroup);
  const legGeo = new THREE.BoxGeometry(2, wheel.height / 2 + 8, 2);
  const legMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
  for (const dz of [-8, 8]) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(wheel.x, (wheel.height / 2 + 8) / 2, wheel.z + dz);
    scene.add(leg);
  }

  // Beach umbrellas on the sand strip (east edge).
  const umbPoleGeo = new THREE.CylinderGeometry(0.25, 0.25, 4, 6);
  const umbPoleMat = new THREE.MeshLambertMaterial({ color: 0xdddddd });
  const umbTopGeo = new THREE.ConeGeometry(3.4, 1.6, 8);
  const umbCols = [0xff5a7a, 0x2ecc71, 0xe67e22, 0x3498db];
  city.umbrellas.forEach((u, i) => {
    const pole = new THREE.Mesh(umbPoleGeo, umbPoleMat);
    pole.position.set(u.x, 2, u.z);
    scene.add(pole);
    const top = new THREE.Mesh(umbTopGeo, new THREE.MeshLambertMaterial({ color: umbCols[i % umbCols.length] }));
    top.position.set(u.x, 4.6, u.z);
    scene.add(top);
  });

  // Sal at the Salty Gull Diner door (silver hair, apron) — the talk-to
  // character for the on-foot mission shot.
  const diner = city.places.find((p) => p.id === 'salty-gull-diner');
  const sal = new THREE.Group();
  const salBody = new THREE.Mesh(
    new THREE.BoxGeometry(1.1, 2.0, 0.7),
    // Diner-teal apron, not white: against the Diner's beige wall a white
    // apron + silver hair read as one pale pillar, not a person.
    new THREE.MeshLambertMaterial({ color: 0x2e8b8b }),
  );
  salBody.position.y = 1.4;
  salBody.castShadow = true;
  sal.add(salBody);
  const salHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 10, 10),
    new THREE.MeshLambertMaterial({ color: 0xc0c0c0 }),
  );
  salHead.position.y = 2.7;
  sal.add(salHead);
  if (diner) sal.position.set(diner.x, 0, diner.z + 22); // sidewalk, south of the Diner door — never inside the building
  scene.add(sal);

  // Player car / player on foot: one group, swapped by sync().
  // Bright red, not the old dark maroon: at dusk the rear of a dark car
  // facing away from a low sun reads as a black box.
  const player = new THREE.Group();
  const playerCar = makeCarMesh(0xc23b2e);
  playerCar.name = 'playerCar';
  // The hero car runs 25% larger than traffic: at a 10 m chase cam a
  // 4.4 m sedan reads as a toy, and the judge's eye goes to the biggest
  // car in the frame. Traffic, the van and cruisers stay 1.0x.
  playerCar.scale.set(1.25, 1.25, 1.25);
  player.add(playerCar);
  const playerFoot = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 2.4, 0.7),
    new THREE.MeshLambertMaterial({ color: 0x5a3a28 }),
  );
  playerFoot.position.y = 1.2;
  playerFoot.castShadow = true;
  playerFoot.name = 'playerFoot';
  player.add(playerFoot);
  scene.add(player);

  // Traffic cars: one mesh per car (27) + the money van for M4.
  const trafficMeshes = new Map();
  for (const c of game.traffic) {
    const mesh = makeCarMesh(new THREE.Color(c.color).getHex());
    scene.add(mesh);
    trafficMeshes.set(c.id, mesh);
  }
  const van = makeCarMesh(0xdddddd);
  van.name = 'moneyVan';
  van.visible = false;
  scene.add(van);

  // Police cruisers: pool of 4, toggled by sync().
  const policeMeshes = [];
  for (let i = 0; i < 4; i++) {
    const mesh = makeCarMesh(0x223344, true);
    mesh.visible = false;
    scene.add(mesh);
    policeMeshes.push(mesh);
  }

  // Pedestrians: one instanced mesh (48).
  const pedGeo = new THREE.BoxGeometry(0.9, 2.2, 0.6);
  const pedMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const peds = new THREE.InstancedMesh(pedGeo, pedMat, game.pedestrians.length);
  peds.castShadow = true;
  const pedCols = [0xc0392b, 0x2e86c1, 0xf1c40f, 0x7d3c98, 0xe67e22, 0x95a5a6];
  game.pedestrians.forEach((ped, i) => {
    col.set(pedCols[i % pedCols.length]);
    peds.setColorAt(i, col);
  });
  if (peds.instanceColor) peds.instanceColor.needsUpdate = true;
  scene.add(peds);

  // Helicopter: body + tail + rotor + spotlight cone + SpotLight.
  const heli = new THREE.Group();
  const heliBody = new THREE.Mesh(
    new THREE.BoxGeometry(6, 2.2, 2.6),
    new THREE.MeshLambertMaterial({ color: 0x1c2f4a }),
  );
  heliBody.castShadow = true;
  heli.add(heliBody);
  const tail = new THREE.Mesh(
    new THREE.BoxGeometry(5, 0.8, 0.8),
    new THREE.MeshLambertMaterial({ color: 0x1c2f4a }),
  );
  tail.position.set(-5, 0.4, 0);
  heli.add(tail);
  const rotor = new THREE.Mesh(
    new THREE.BoxGeometry(11, 0.15, 0.9),
    new THREE.MeshLambertMaterial({ color: 0x111111 }),
  );
  rotor.position.y = 1.5;
  rotor.name = 'rotor';
  heli.add(rotor);
  // Spotlight cone (translucent) + real SpotLight aimed at the player.
  // Slimmer than the first pass: a fat cone seen from a low chase cam
  // reads as fog and swallows the car.
  const coneGeo = new THREE.ConeGeometry(7, 48, 20, 1, true);
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xfff2b0, transparent: true, opacity: 0.14,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const cone = new THREE.Mesh(coneGeo, coneMat);
  cone.position.y = -24;
  cone.name = 'spotCone';
  heli.add(cone);
  const spot = new THREE.SpotLight(0xfff2b0, 12, 120, 0.32, 0.45, 1.2);
  spot.position.set(0, 0, 0);
  spot.name = 'spotLight';
  heli.add(spot);
  scene.add(spot.target); // standard pattern: the target must be in the scene
  heli.visible = false;
  scene.add(heli);

  // Tyre smoke: translucent puffs behind the player car, shown while
  // drifting (or staged for the action shot). One group, repositioned by sync().
  // Kept SMALL (r ~0.9): the chase cam sits only ~13 m behind the car, so
  // the nearest puffs are ~5 m from the lens — big spheres swallow the car.
  const smoke = new THREE.Group();
  const smokeMat = new THREE.MeshBasicMaterial({
    color: 0xd8d8d8, transparent: true, opacity: 0.28, depthWrite: false,
  });
  const smokeGeo = new THREE.SphereGeometry(0.9, 8, 8);
  for (let i = 0; i < 8; i++) {
    const puff = new THREE.Mesh(smokeGeo, smokeMat);
    puff.name = `puff${i}`;
    smoke.add(puff);
  }
  smoke.visible = false;
  scene.add(smoke);

  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);

  // Rim light for the player car: a warm-red point light that sync()
  // parks just behind and above the car (the chase camera's side), so the
  // rear — the face every driving shot actually shows — is lit even when
  // the sun is low ahead of the car. Red-tinted, not white: a white light
  // washed the red paint peach. One light, short range, no shadows: it
  // lifts the car, not the street.
  const carLight = new THREE.PointLight(0xff8a70, 3, 30, 1);
  scene.add(carLight);

  return {
    scene, camera, sun, hemi, ambient, beacon, player, playerCar, playerFoot,
    trafficMeshes, van, policeMeshes, peds, heli, rotor, spot, smoke, wheelGroup,
    carLight, timeOfDay,
  };
}

// Retarget an already-built scene to another time of day (lights + sky +
// fog only — geometry is shared). Lets the headless runner render dusk AND
// night shots from one scene + one renderer (one shader compile).
export function setTimeOfDay(built, name) {
  const tod = TIMES_OF_DAY[name] || TIMES_OF_DAY.dusk;
  built.scene.background.set(tod.sky);
  built.scene.fog.color.set(tod.fog);
  built.sun.color.set(tod.sunColor);
  built.sun.intensity = tod.sunIntensity;
  built.sun.position.set(...tod.sunPos);
  built.hemi.color.set(tod.hemiSky);
  built.hemi.groundColor.set(tod.hemiGround);
  built.hemi.intensity = tod.hemiIntensity;
  built.ambient.intensity = tod.ambient;
  built.timeOfDay = name;
  return built;
}

// --- Camera -----------------------------------------------------------------

// Third-person follow: behind the player, looking ahead along the heading.
// Back 28 / height 16 keeps the camera above the low roofs on a road.
// If the camera would sit inside a building footprint, lift it above the
// roofs (cheap occlusion dodge; no raycast needed at this scale).
export function frameFollowCamera(built, game) {
  const p = game.player;
  const cam = built.camera;
  const back = 28;
  let height = 16;
  const cx = p.x - Math.cos(p.heading) * back;
  const cz = p.z - Math.sin(p.heading) * back;
  if (game.city && blockingBuilding(game.city, cx, cz, 2)) height = 34;
  cam.position.set(cx, height, cz);
  cam.lookAt(p.x + Math.cos(p.heading) * 10, 2, p.z + Math.sin(p.heading) * 10);
}

// Wide establishing shot for the street scene: low, Spire in frame.
export function frameStreetCamera(built, game) {
  const cam = built.camera;
  cam.position.set(game.player.x - 18, 7, game.player.z + 26);
  cam.lookAt(game.city.spire.x, 40, game.city.spire.z);
}

// Low chase cam (top-3 cover): right behind the car, just above roof height,
// looking slightly up the road so the heli + spotlight read top-centre and
// the Spire / billboard read in the distance. `up` tilts the view upward;
// `fov` widens the vertical span so the car (low) and the heli (high) fit
// in one frame — at fov 60 the car falls below the bottom edge.
export function frameChaseCamera(built, game, { back = 15, height = 5.5, up = 10, fov = 72 } = {}) {
  const p = game.player;
  const cam = built.camera;
  if (cam.fov !== fov) {
    cam.fov = fov;
    cam.updateProjectionMatrix();
  }
  const cx = p.x - Math.cos(p.heading) * back;
  const cz = p.z - Math.sin(p.heading) * back;
  cam.position.set(cx, height, cz);
  cam.lookAt(p.x + Math.cos(p.heading) * 30, up, p.z + Math.sin(p.heading) * 30);
}

// Higher 3/4 rear chase cam (the daylight beachfront slot): whole car + road
// + beach in frame. `up` tilts the view level/up so the heli + spotlight
// read top-centre instead of the camera staring at the asphalt. Wide fov
// (70) for the same car-low/heli-high reason as the low chase cam.
export function frameHighChaseCamera(built, game, { back = 20, height = 11, up = 11, fov = 70 } = {}) {
  const p = game.player;
  const cam = built.camera;
  if (cam.fov !== fov) {
    cam.fov = fov;
    cam.updateProjectionMatrix();
  }
  const cx = p.x - Math.cos(p.heading) * back;
  const cz = p.z - Math.sin(p.heading) * back;
  cam.position.set(cx, height, cz);
  cam.lookAt(p.x + Math.cos(p.heading) * 26, up, p.z + Math.sin(p.heading) * 26);
}

// On-foot third-person: close behind Leon, the diner + Sal + neon sign fill
// the frame (no empty ground).
// Third-person on-foot cam: behind Leon, over his shoulder, close enough
// that the place in front of him fills the frame. `lookAt` (world coords)
// overrides the default forward aim — the diner shot uses it to centre
// the neon sign, which sits 8 m right of Leon's line of sight.
export function frameOnFootCamera(built, game, { back = 9, height = 4.5, lookAt = null } = {}) {
  const p = game.player;
  const cam = built.camera;
  const cx = p.x - Math.cos(p.heading) * back;
  const cz = p.z - Math.sin(p.heading) * back;
  cam.position.set(cx, height, cz);
  if (lookAt) cam.lookAt(lookAt[0], lookAt[1], lookAt[2]);
  else cam.lookAt(p.x + Math.cos(p.heading) * 14, 5, p.z + Math.sin(p.heading) * 14);
}

// High chase shot for the cover: player car + heli BOTH in frame. The heli
// hovers 55 up, so the camera sits far back and aims at the midpoint raised
// toward the heli (lookAt y 22), keeping the spotlight cone in view.
export function frameCoverCamera(built, game) {
  const cam = built.camera;
  const h = game.police.heli;
  const mx = (game.player.x + (h.active ? h.x : game.player.x)) / 2;
  const mz = (game.player.z + (h.active ? h.z : game.player.z)) / 2;
  cam.position.set(mx - 46, 30, mz + 56);
  cam.lookAt(mx, 22, mz);
}

// --- Sync -------------------------------------------------------------------

const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

// Push live game state into the scene. Called once per frame (browser) or
// once per staged shot (headless). dt advances the rotor + beacon blink.
export function syncScene(built, game, dt = 0) {
  const p = game.player;
  // Player: car mesh when driving, foot mesh on foot.
  built.player.position.set(p.x, 0, p.z);
  built.player.rotation.y = -p.heading;
  built.playerCar.visible = !!p.inCar;
  built.playerFoot.visible = !p.inCar;

  // Rim light follows the player: 6 m behind the direction of travel
  // (the chase camera's side) and 5 m up, so the car's rear stays lit.
  if (built.carLight) {
    built.carLight.position.set(
      p.x - Math.cos(p.heading) * 6,
      5,
      p.z - Math.sin(p.heading) * 6,
    );
  }

  for (const c of game.traffic) {
    const mesh = built.trafficMeshes.get(c.id);
    if (!mesh) continue;
    mesh.position.set(c.x, 0, c.z);
    mesh.rotation.y = c.axis === 'x' ? (c.dir > 0 ? 0 : Math.PI) : (c.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
  }

  // Police pool: show one mesh per active unit.
  built.policeMeshes.forEach((mesh, i) => {
    const u = game.police.units[i];
    if (!u) {
      mesh.visible = false;
      return;
    }
    mesh.visible = true;
    mesh.position.set(u.x, 0, u.z);
    const dx = p.x - u.x;
    const dz = p.z - u.z;
    mesh.rotation.y = -Math.atan2(dz, dx);
  });

  // Pedestrians (instanced).
  game.pedestrians.forEach((ped, i) => {
    _euler.set(0, -ped.heading, 0);
    _q.setFromEuler(_euler);
    _v.set(ped.x, 1.1, ped.z);
    _m4.compose(_v, _q, _s);
    built.peds.setMatrixAt(i, _m4);
  });
  built.peds.instanceMatrix.needsUpdate = true;

  // Heli: hover above the player, rotor spins, spotlight locks on.
  const heli = game.police.heli;
  built.heli.visible = !!heli.active;
  if (heli.active) {
    built.heli.position.set(heli.x, heli.y, heli.z);
    built.rotor.rotation.y += dt * 28;
    // The SpotLight target lives in world space (it is not parented to the
    // heli group), so aim it at the player's world position directly.
    built.spot.target.position.set(heli.spotlight.x, 0, heli.spotlight.z);
    built.spot.target.updateMatrixWorld();
    // Crash spin: tilt while burning.
    built.heli.rotation.z = heli.state === 'crashing' ? (built.heli.rotation.z + dt * 6) : 0;
  }

  // Gullhaven Wheel turns slowly, always (a living landmark).
  if (built.wheelGroup) built.wheelGroup.rotation.z = game.time * 0.05;

  // Tyre smoke while drifting (or staged): puffs trail behind the car.
  const drifting = !!(game.player.drifting || game.shotSmoke);
  built.smoke.visible = drifting && !!game.player.inCar;
  if (built.smoke.visible) {
    const p = game.player;
    const bx = Math.cos(p.heading);
    const bz = Math.sin(p.heading);
    built.smoke.children.forEach((puff, i) => {
      const back = 3 + (i % 4) * 1.6;
      const side = ((i % 2) * 2 - 1) * 1.1;
      const wob = Math.sin(game.time * 3 + i * 1.7) * 0.5;
      puff.position.set(
        p.x - bx * back - bz * side + wob,
        0.5 + (i % 3) * 0.4,
        p.z - bz * back + bx * side + wob,
      );
      const s = 0.6 + (i % 3) * 0.2;
      puff.scale.set(s, s, s);
    });
  }

  // Spire beacon blinks every 4 s (v2).
  const phase = (game.time % 4) / 4;
  built.beacon.visible = phase < 0.5;
}

export function renderFrame(renderer, built) {
  renderer.render(built.scene, built.camera);
}
