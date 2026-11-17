// render.js — camera, world drawing, particles, HUD + minimap.
// Palettes: day and dusk (night scene). HUD is DOM (updated here); minimap is canvas.
import { WORLD, PITCH, ROAD, HALF_ROAD, isRoad } from './world.js';

export const PALETTES = {
  day: { ground: '#3f7a4a', road: '#33373d', roadLine: '#c8b45a', sidewalk: '#8a8f96', buildingLine: '#22262b', park: '#4c9a52', sand: '#d9c48a', water: '#2e6f9e', sky: '#87b5d6' },
  dusk: { ground: '#3a4a3f', road: '#23262e', roadLine: '#8a7a3a', sidewalk: '#5f646c', buildingLine: '#14161c', park: '#2f6b3a', sand: '#8a7448', water: '#1c4258', sky: '#2c2a4a' },
};

export function createParticles() {
  const parts = [];
  return {
    parts,
    burst(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 160;
        parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.4, color, size: 2 + Math.random() * 3 });
      }
    },
    update(dt) {
      for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; p.life -= dt; }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
    },
    draw(ctx) {
      for (const p of parts) {
        ctx.globalAlpha = Math.max(0, p.life * 2);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
    },
  };
}

function drawCar(ctx, c, pal) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.angle);
  const len = c.kind === 'police' ? 52 : 46, wid = 24;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-len / 2 + 2, -wid / 2 + 3, len, wid);
  ctx.fillStyle = c.wrecked ? '#3a3a3a' : c.color;
  roundRect(ctx, -len / 2, -wid / 2, len, wid, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(20,30,45,0.85)';
  ctx.fillRect(-len / 2 + 10, -wid / 2 + 4, 12, wid - 8); // windshield
  ctx.fillRect(len / 2 - 16, -wid / 2 + 4, 10, wid - 8);
  if (c.police) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-6, -wid / 2, 12, 4);
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(-6, wid / 2 - 4, 12, 4);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PD', 0, 3);
  }
  if (c.brakeLight) {
    ctx.fillStyle = '#ff2222';
    ctx.fillRect(-len / 2 - 2, -wid / 2 + 2, 3, 6);
    ctx.fillRect(-len / 2 - 2, wid / 2 - 8, 3, 6);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawWorld(ctx, G, vw, vh) {
  const pal = PALETTES[G.timeOfDay] || PALETTES.day;
  const cam = G.camera;
  const zoom = G.player.inCar ? 0.78 : 1.0;
  ctx.save();
  ctx.clearRect(0, 0, vw, vh);
  ctx.fillStyle = pal.sky;
  ctx.fillRect(0, 0, vw, vh);
  // camera with trauma shake (game-feel: trauma^2, summed sines)
  const sh = G.trauma * G.trauma;
  const sx = Math.sin(G.time * 47) * 10 * sh, sy = Math.cos(G.time * 39) * 8 * sh;
  ctx.translate(vw / 2, vh / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-cam.x + sx, -cam.y + sy);

  const vx0 = cam.x - vw / 2 / zoom - 80, vy0 = cam.y - vh / 2 / zoom - 80;
  const vx1 = cam.x + vw / 2 / zoom + 80, vy1 = cam.y + vh / 2 / zoom + 80;

  // ground
  ctx.fillStyle = pal.ground;
  ctx.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
  // beach + water (east strip)
  ctx.fillStyle = pal.sand;
  ctx.fillRect(2980, Math.max(vy0, 0), 140, Math.min(vy1, WORLD) - Math.max(vy0, 0));
  ctx.fillStyle = pal.water;
  ctx.fillRect(3120, Math.max(vy0, 0), WORLD - 3120, Math.min(vy1, WORLD) - Math.max(vy0, 0));
  // parks
  ctx.fillStyle = pal.park;
  for (const pk of G.world.parks) {
    if (pk.x > vx1 || pk.x + pk.w < vx0 || pk.y > vy1 || pk.y + pk.h < vy0) continue;
    ctx.fillRect(pk.x, pk.y, pk.w, pk.h);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(pk.x + 20 + i * 30, pk.y + pk.h / 2, 9, 0, 7); ctx.fill(); }
    ctx.fillStyle = pal.park;
  }
  // roads
  ctx.fillStyle = pal.road;
  for (let i = 0; i <= 12; i++) {
    const c = i * PITCH;
    ctx.fillRect(c - HALF_ROAD, 0, ROAD, WORLD);
    ctx.fillRect(0, c - HALF_ROAD, WORLD, ROAD);
  }
  // road centre dashes
  ctx.strokeStyle = pal.roadLine;
  ctx.lineWidth = 3;
  ctx.setLineDash([18, 22]);
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) {
    const c = i * PITCH;
    ctx.moveTo(c, 0); ctx.lineTo(c, WORLD);
    ctx.moveTo(0, c); ctx.lineTo(WORLD, c);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // sidewalks (lighter border along roads)
  ctx.strokeStyle = pal.sidewalk;
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) {
    const c = i * PITCH;
    ctx.moveTo(c - HALF_ROAD - 2, 0); ctx.lineTo(c - HALF_ROAD - 2, WORLD);
    ctx.moveTo(c + HALF_ROAD + 2, 0); ctx.lineTo(c + HALF_ROAD + 2, WORLD);
    ctx.moveTo(0, c - HALF_ROAD - 2); ctx.lineTo(WORLD, c - HALF_ROAD - 2);
    ctx.moveTo(0, c + HALF_ROAD + 2); ctx.lineTo(WORLD, c + HALF_ROAD + 2);
  }
  ctx.stroke();
  // buildings
  for (const b of G.world.buildings) {
    if (b.x > vx1 || b.x + b.w < vx0 || b.y > vy1 || b.y + b.h < vy0) continue;
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = pal.buildingLine;
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, 10);
    // windows
    ctx.fillStyle = G.timeOfDay === 'dusk' ? 'rgba(255,210,90,0.85)' : 'rgba(20,30,45,0.5)';
    for (let wx = b.x + 12; wx < b.x + b.w - 10; wx += 22)
      for (let wy = b.y + 26; wy < b.y + b.h - 10; wy += 22)
        ctx.fillRect(wx, wy, 10, 8);
  }
  // skid marks
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 4;
  for (const s of G.skids) {
    ctx.globalAlpha = Math.min(1, s.life);
    ctx.beginPath();
    ctx.moveTo(s.x - Math.cos(s.a) * 14, s.y - Math.sin(s.a) * 14);
    ctx.lineTo(s.x + Math.cos(s.a) * 14, s.y + Math.sin(s.a) * 14);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // mission target marker (pulsing diamond + beacon)
  if (G.missions.target) {
    const t = G.missions.target;
    const pulse = 1 + Math.sin(G.time * 5) * 0.15;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#f1c40f';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 3;
    const s = 26 * pulse;
    ctx.fillRect(-s / 2, -s / 2, s, s);
    ctx.strokeRect(-s / 2, -s / 2, s, s);
    ctx.restore();
    ctx.strokeStyle = 'rgba(241,196,15,0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(t.x, t.y, 44 * pulse, 0, 7); ctx.stroke();
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(t.label, t.x, t.y - 52);
  }
  // parked + traffic cars
  for (const c of G.parked) drawCar(ctx, c, pal);
  for (const c of G.traffic) drawCar(ctx, c, pal);
  for (const c of G.police) drawCar(ctx, c, pal);
  // peds
  for (const ped of G.peds) {
    if (ped.dead) continue;
    const bob = Math.sin(ped.walkPhase) * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(ped.x, ped.y + 6, 8, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath(); ctx.arc(ped.x, ped.y + bob * 0.3, 9, 0, 7); ctx.fill();
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath(); ctx.arc(ped.x + Math.cos(ped.angle) * 3, ped.y + Math.sin(ped.angle) * 3, 5, 0, 7); ctx.fill();
  }
  // player
  const p = G.player;
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.inCar) {
    drawCar(ctx, p.inCar, pal);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(0, 7, 10, 5, 0, 0, 7); ctx.fill();
    // body: teal jacket, facing aim
    ctx.rotate(p.aimAngle || p.angle);
    ctx.fillStyle = '#0f766e';
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fill();
    ctx.fillStyle = '#f2c89b';
    ctx.beginPath(); ctx.arc(4, 0, 6, 0, 7); ctx.fill();
    // gun barrel
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(20, 0); ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.translate(p.x, p.y);
    // muzzle flash
    if (G.muzzle > 0) {
      ctx.fillStyle = 'rgba(255,220,80,0.95)';
      ctx.beginPath(); ctx.arc(Math.cos(p.aimAngle || 0) * 26, Math.sin(p.aimAngle || 0) * 26, 10, 0, 7); ctx.fill();
    }
  }
  ctx.restore();
  // bullets
  ctx.fillStyle = '#ffe14d';
  for (const b of G.bullets) {
    ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, 7); ctx.fill();
  }
  // particles
  G.particles.draw(ctx);
  // red damage flash (screen space handled by HUD overlay; world vignette here)
  ctx.restore();
  if (G.flashRed > 0) {
    ctx.fillStyle = `rgba(200,0,0,${G.flashRed * 0.5})`;
    ctx.fillRect(0, 0, vw, vh);
  }
}

// --- HUD (DOM) ---
export function updateHUD(G) {
  const p = G.player;
  const $ = (id) => document.getElementById(id);
  const setText = (id, v) => { const el = $(id); if (el && el.textContent !== String(v)) el.textContent = v; };
  const hpBar = $('hp-bar'), arBar = $('armor-bar');
  if (hpBar) hpBar.style.width = Math.max(0, p.hp) + '%';
  if (arBar) arBar.style.width = Math.max(0, p.armor) + '%';
  setText('hp-num', Math.ceil(p.hp));
  setText('armor-num', Math.ceil(p.armor));
  setText('cash', '$' + Math.floor(p.cash).toLocaleString('en-US'));
  setText('ammo', p.ammo + ' / ' + p.reserveAmmo);
  setText('weapon', p.weapon);
  setText('speed', p.inCar ? Math.round(Math.abs(p.inCar.speed) * 0.22) + ' mph' : (p.moving ? 'ON FOOT' : '—'));
  setText('objective', G.missions.text);
  setText('objective-sub', G.missions.sub || '');
  // wanted stars
  const stars = $('stars');
  if (stars) {
    let s = '';
    for (let i = 0; i < 5; i++) s += i < p.wanted ? '★' : '☆';
    if (stars.textContent !== s) stars.textContent = s;
  }
  // clock: game time advances 1 min per ~2s real
  const mins = Math.floor(G.time * 30) % 1440;
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  setText('clock', (G.timeOfDay === 'dusk' ? 'DUSK ' : 'DAY ') + hh + ':' + mm);
  // mission label
  setText('mission-label', G.missions.done ? 'STORY COMPLETE' : (G.missions.phase === 'active' ? 'MISSION ' + (G.missions.index + 1) + '/3: ' + (G.missions.index < 3 ? '' : '') : 'FREE ROAM'));
  // interact prompt
  const prompt = $('prompt');
  if (prompt) {
    const car = G.nearCar;
    prompt.style.display = (!p.inCar && car) ? 'block' : 'none';
    if (car) prompt.textContent = 'Press E — Jack the ' + (car.police ? 'POLICE CRUISER' : 'car');
    if (p.inCar) { prompt.style.display = 'block'; prompt.textContent = 'E — Exit car'; }
  }
  // toast
  const toast = $('toast');
  if (toast && G.toastUntil > G.time) toast.style.display = 'block';
  else if (toast) toast.style.display = 'none';
}

// --- Minimap ---
export function drawMinimap(G) {
  const cv = document.getElementById('minimap');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const S = cv.width, scale = S / WORLD;
  const pal = PALETTES[G.timeOfDay] || PALETTES.day;
  ctx.fillStyle = '#10141a';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = pal.road;
  for (let i = 0; i <= 12; i++) {
    const c = i * PITCH * scale;
    ctx.fillRect(c - 1, 0, 2, S);
    ctx.fillRect(0, c - 1, S, 2);
  }
  ctx.fillStyle = pal.water;
  ctx.fillRect(3120 * scale, 0, (WORLD - 3120) * scale, S);
  // mission target
  if (G.missions.target) {
    const t = G.missions.target;
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath(); ctx.arc(t.x * scale, t.y * scale, 5, 0, 7); ctx.fill();
    ctx.strokeStyle = '#f1c40f';
    ctx.beginPath(); ctx.arc(t.x * scale, t.y * scale, 8 + Math.sin(G.time * 5) * 2, 0, 7); ctx.stroke();
  }
  // police blips (blue/red)
  for (const c of G.police) {
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath(); ctx.arc(c.x * scale, c.y * scale, 3, 0, 7); ctx.fill();
  }
  // player arrow
  const p = G.player;
  ctx.save();
  ctx.translate(p.x * scale, p.y * scale);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
  // north + border
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('N', 6, 14);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, S - 2, S - 2);
}
