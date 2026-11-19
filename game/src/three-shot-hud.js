// three-shot-hud.js — PORT MERCER 3D: screenshot HUD compositor.
// The headless captures render the WebGL canvas only — the DOM HUD never
// reaches the pixels. So the 4 graded shots composite the HUD into the
// framebuffer AFTER gl.readPixels, using the SAME buildHud model
// (three-hud.js) and the SAME bitmap font (three-font.js) as the browser
// DOM HUD. Same panels, same text, same layout — the two cannot drift.
// Pure pixel work: no deps beyond the font module. Deterministic.

import { drawTextRGBA, fillRect, textWidth, wrapText, blendPixel } from './three-font.js';

const WHITE = [255, 255, 255, 255];
const GOLD = [241, 196, 15, 255];
const GREEN = [46, 204, 113, 255];
const RED = [231, 76, 60, 255];
const BLUE = [52, 152, 219, 255];
const GREY = [170, 178, 185, 255];
const DARKGREY = [150, 158, 165, 255]; // empty stars / locked slots: readable on the dark panel, still clearly "off"
const PANEL_BG = [8, 12, 20, 205];
const PANEL_BORDER = [255, 255, 255, 70];

function panel(buf, W, H, x, y, w, h) {
  fillRect(buf, W, H, x, y, w, h, PANEL_BG[0], PANEL_BG[1], PANEL_BG[2], PANEL_BG[3]);
  // 1 px border.
  fillRect(buf, W, H, x, y, w, 1, PANEL_BORDER[0], PANEL_BORDER[1], PANEL_BORDER[2], PANEL_BORDER[3]);
  fillRect(buf, W, H, x, y + h - 1, w, 1, PANEL_BORDER[0], PANEL_BORDER[1], PANEL_BORDER[2], PANEL_BORDER[3]);
  fillRect(buf, W, H, x, y, 1, h, PANEL_BORDER[0], PANEL_BORDER[1], PANEL_BORDER[2], PANEL_BORDER[3]);
  fillRect(buf, W, H, x + w - 1, y, 1, h, PANEL_BORDER[0], PANEL_BORDER[1], PANEL_BORDER[2], PANEL_BORDER[3]);
}

function textRight(buf, W, H, xRight, y, text, colour, scale = 2) {
  const w = textWidth(text, scale);
  drawTextRGBA(buf, W, H, xRight - w, y, text, colour, scale);
}

function bar(buf, W, H, x, y, w, h, frac, colour, bg = [255, 255, 255, 40]) {
  fillRect(buf, W, H, x, y, w, h, bg[0], bg[1], bg[2], bg[3]);
  const fw = Math.max(0, Math.min(w, Math.round(w * frac)));
  if (fw > 0) fillRect(buf, W, H, x, y, fw, h, colour[0], colour[1], colour[2], colour[3]);
}

function stageBar(buf, W, H, x, y, w, current, total) {
  for (let i = 0; i < total; i++) {
    const sw = Math.floor((w - (total - 1) * 4) / total);
    const sx = x + i * (sw + 4);
    const col = i < current ? GOLD : [255, 255, 255, 50];
    fillRect(buf, W, H, sx, y, sw, 8, col[0], col[1], col[2], col[3]);
  }
}

// --- Circular minimap -------------------------------------------------------
// Same data as the browser minimap (buildMinimapData): roads, water east,
// parks, places, landmark star, mission diamond, police dots, heli ring,
// player arrow. Clipped to a circle; the district label sits UNDER it.
function drawMinimap(buf, W, H, cx, cy, r, minimap) {
  const half = minimap.bounds.half;
  const toMap = (x, z) => [
    cx + ((x / half) * r),
    cy + ((z / half) * r),
  ];
  const inside = (px, py) => {
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy <= r * r;
  };
  // Disc background.
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!inside(x, y)) continue;
      blendPixel(buf, W, H, x, y, 10, 16, 28, 225);
    }
  }
  // Sea + sand on the east edge (x > 470 world).
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!inside(x, y)) continue;
      const wx = ((x - cx) / r) * half;
      if (wx > 492) blendPixel(buf, W, H, x, y, 46, 134, 193, 255);
      else if (wx > 470) blendPixel(buf, W, H, x, y, 214, 186, 140, 255);
    }
  }
  // Roads: grid lines every 80 world units.
  for (let i = 0; i <= 12; i++) {
    const p = -half + i * 80;
    const [ax] = toMap(p, 0);
    const [, ay] = toMap(0, p);
    for (let d = -r; d <= r; d++) {
      const rx = Math.round(ax);
      const ry = Math.round(cy + d);
      if (inside(rx, ry)) blendPixel(buf, W, H, rx, ry, 255, 255, 255, 60);
      const rx2 = Math.round(cx + d);
      const ry2 = Math.round(ay);
      if (inside(rx2, ry2)) blendPixel(buf, W, H, rx2, ry2, 255, 255, 255, 60);
    }
  }
  const dot = (x, y, rad, colour) => {
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy > rad * rad) continue;
        if (inside(x + dx, y + dy)) blendPixel(buf, W, H, x + dx, y + dy, colour[0], colour[1], colour[2], 255);
      }
    }
  };
  // Places (green dots), landmark star, mission diamond.
  for (const p of minimap.places) {
    const [x, y] = toMap(p.x, p.z);
    dot(Math.round(x), Math.round(y), 2, GREEN);
  }
  const [lx, ly] = toMap(minimap.landmark.x, minimap.landmark.z);
  drawTextRGBA(buf, W, H, Math.round(lx) - 5, Math.round(ly) - 7, '★', GOLD, 2);
  if (minimap.missionTarget) {
    const [x, y] = toMap(minimap.missionTarget.x, minimap.missionTarget.z);
    const ix = Math.round(x);
    const iy = Math.round(y);
    for (let d = -5; d <= 5; d++) {
      dot(ix + d, iy, 1, GOLD);
      dot(ix, iy + d, 1, GOLD);
    }
  }
  // Police blips + heli ring.
  for (const u of minimap.police) {
    const [x, y] = toMap(u.x, u.z);
    dot(Math.round(x), Math.round(y), 3, BLUE);
  }
  if (minimap.heli) {
    const [x, y] = toMap(minimap.heli.x, minimap.heli.z);
    const hx = Math.round(x);
    const hy = Math.round(y);
    for (let a = 0; a < 40; a++) {
      const t = (a / 40) * Math.PI * 2;
      const px = Math.round(hx + Math.cos(t) * 8);
      const py = Math.round(hy + Math.sin(t) * 8);
      if (inside(px, py)) blendPixel(buf, W, H, px, py, 231, 76, 60, 255);
    }
  }
  // Player arrow (white triangle, rotated by heading).
  const [px, py] = toMap(minimap.player.x, minimap.player.z);
  const h = minimap.player.heading;
  const tip = [px + Math.cos(h) * 9, py + Math.sin(h) * 9];
  const l = [px + Math.cos(h + 2.5) * 7, py + Math.sin(h + 2.5) * 7];
  const rr = [px + Math.cos(h - 2.5) * 7, py + Math.sin(h - 2.5) * 7];
  // Rasterise the triangle by sampling its bounding box (barycentric).
  const minX = Math.floor(Math.min(tip[0], l[0], rr[0]));
  const maxX = Math.ceil(Math.max(tip[0], l[0], rr[0]));
  const minY = Math.floor(Math.min(tip[1], l[1], rr[1]));
  const maxY = Math.ceil(Math.max(tip[1], l[1], rr[1]));
  const area = (tip[0] - l[0]) * (rr[1] - l[1]) - (rr[0] - l[0]) * (tip[1] - l[1]);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!inside(x, y) || area === 0) continue;
      const w0 = ((x - l[0]) * (rr[1] - l[1]) - (rr[0] - l[0]) * (y - l[1])) / area;
      const w1 = ((x - rr[0]) * (tip[1] - rr[1]) - (tip[0] - rr[0]) * (y - rr[1])) / area;
      const w2 = 1 - w0 - w1;
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) blendPixel(buf, W, H, x, y, 255, 255, 255, 255);
    }
  }
  // Circle rim.
  for (let a = 0; a < 160; a++) {
    const t = (a / 160) * Math.PI * 2;
    const px = Math.round(cx + Math.cos(t) * r);
    const py = Math.round(cy + Math.sin(t) * r);
    blendPixel(buf, W, H, px, py, 255, 255, 255, 200);
    blendPixel(buf, W, H, px, py + 1, 255, 255, 255, 120);
  }
}

// --- Full HUD ---------------------------------------------------------------
// Layout (1280x720), mirrored by the browser DOM HUD:
//   TL mission panel + response list | TR day/cash/stars/weapons
//   BL circular minimap + district + bars | BC portrait dialogue
//   BR radio + car panel. Prompt (talk-to) sits bottom-centre when set.
export function compositeHud(buf, W, H, hud, minimap) {
  const m = hud.mission;
  // -- Top-left: mission panel ---------------------------------------------
  const px = 12;
  let py = 12;
  const pw = 344;
  // Roomy panel: 14 px padding and an 18 px line pitch, so the brief /
  // objective / hint / NEXT lines breathe instead of packing tight.
  const pad = 14;
  const lines = [];
  if (m) {
    lines.push({ text: m.title, colour: GOLD, scale: 2 });
    if (m.timer !== null && m.timer !== undefined) {
      lines.push({ text: `TIMER ${Math.ceil(m.timer)}S`, colour: RED, scale: 2 });
    }
    for (const l of wrapText(m.objective, pw - pad * 2, 2)) {
      lines.push({ text: l, colour: WHITE, scale: 2 });
    }
    for (const l of wrapText(m.hint, pw - pad * 2, 2)) {
      lines.push({ text: l, colour: GREY, scale: 2 });
    }
    lines.push({ text: `NEXT: ${m.next}`, colour: GOLD, scale: 2, wrap: true });
  } else {
    lines.push({ text: 'FREE ROAM', colour: GOLD, scale: 2 });
  }
  // Height: title 14 + stage bar 14 + body lines * 18 + padding.
  const bodyLines = lines.slice(m ? 1 : 0);
  const bodyH = bodyLines.reduce((a, l) => a + (l.wrap ? wrapText(l.text, pw - pad * 2, 2).length * 18 : 18), 0);
  const ph = m
    ? pad + 14 + 6 + 14 + 6 + bodyH + pad
    : pad + bodyH + pad;
  panel(buf, W, H, px, py, pw, ph);
  let ly = py + pad;
  if (m) {
    drawTextRGBA(buf, W, H, px + pad, ly, m.title, GOLD, 2);
    ly += 14 + 6;
    drawTextRGBA(buf, W, H, px + pad, ly, `STAGE ${m.stageCurrent}/${m.stageTotal}`, WHITE, 2);
    stageBar(buf, W, H, px + 118, ly + 3, 150, m.stageCurrent, m.stageTotal);
    ly += 14 + 6;
  }
  for (const l of lines.slice(m ? 1 : 0)) {
    const sub = l.wrap ? wrapText(l.text, pw - pad * 2, 2) : [l.text];
    for (const s of sub) {
      drawTextRGBA(buf, W, H, px + pad, ly, s, l.colour, l.scale);
      ly += 18;
    }
  }
  const missionBottom = py + ph;

  // -- Below it: response list ----------------------------------------------
  // The header ("LBPD RESPONSE — 5 UNITS · CODE 5") is wider than this
  // panel at scale 2, so it used to run past the panel edge — in the night
  // shot it ran under the heli's spotlight cone and the "CODE 5" end went
  // unreadable. Split it onto two lines when it does not fit: label + units
  // first, the CODE on its own line in red.
  const resp = hud.response;
  const shown = resp.units.slice(0, 5);
  const headerLine = `${resp.label} — ${resp.count} UNITS · ${resp.code}`;
  const headerLines = textWidth(headerLine, 2) <= pw - pad * 2
    ? [{ text: headerLine, colour: GOLD }]
    : [{ text: `${resp.label} — ${resp.count} UNITS`, colour: GOLD }, { text: resp.code, colour: RED }];
  // Row heights: 18, or 36 when a long status wraps to its own line.
  const rowH = shown.map((u) => {
    const leftText = `${u.name}  ${u.distM} M`;
    return textWidth(leftText, 2) + textWidth(u.status, 2) + 8 <= pw - pad * 2 ? 18 : 36;
  });
  const rh = pad + 18 * headerLines.length + rowH.reduce((a, b) => a + b, 0) + (resp.count > 5 ? 18 : 0) + pad;
  const ry = missionBottom + 8;
  panel(buf, W, H, px, ry, pw, rh);
  let rly = ry + pad;
  for (const hl of headerLines) {
    drawTextRGBA(buf, W, H, px + pad, rly, hl.text, hl.colour, 2);
    rly += 18;
  }
  // A unit row is name + distance left, status right — but a long status
  // ("SPOTLIGHT ON YOU") plus a distance runs past the panel edge and the
  // two collide ("30 MSPOTLIGHT ON YOU"). When the two do not fit on one
  // line, the status drops to its own line instead of overwriting.
  for (const u of shown) {
    const leftText = `${u.name}  ${u.distM} M`;
    const fits = textWidth(leftText, 2) + textWidth(u.status, 2) + 8 <= pw - pad * 2;
    const statusCol = u.status === 'SPOTLIGHT ON YOU' || u.status === 'RAMMING' ? RED : WHITE;
    drawTextRGBA(buf, W, H, px + pad, rly, leftText, WHITE, 2);
    if (fits) {
      textRight(buf, W, H, px + pw - pad, rly, u.status, statusCol, 2);
      rly += 18;
    } else {
      textRight(buf, W, H, px + pw - pad, rly + 18, u.status, statusCol, 2);
      rly += 36;
    }
  }
  if (resp.count > 5) {
    drawTextRGBA(buf, W, H, px + pad, rly, `+${resp.count - 5} MORE UNITS IN THE SEARCH ZONE`, GREY, 2);
  }

  // -- Top-right: day/time, cash, stars, weapons -----------------------------
  const rx = 936;
  const rw = 332;
  const wh = 10 + 15 + 34 + 6 + 23 + 15 + 6 + 15 + 4 * 15 + 10;
  panel(buf, W, H, rx, 12, rw, wh);
  let ty = 12 + 10;
  textRight(buf, W, H, rx + rw - 10, ty, `${hud.dayLabel} ${formatClockText(hud)}`, WHITE, 2);
  ty += 15;
  textRight(buf, W, H, rx + rw - 10, ty, formatCashText(hud.cash), GREEN, 4);
  ty += 34 + 4;
  // Stars: filled gold, hollow grey (SEARCHING) or empty dark.
  const starX = rx + rw - 10 - 5 * (5 * 3 + 3);
  for (let i = 0; i < 5; i++) {
    const filled = i < hud.wanted;
    const ch = filled ? (hud.searching ? '☆' : '★') : '☆';
    const col = filled ? (hud.searching ? GREY : GOLD) : DARKGREY;
    drawTextRGBA(buf, W, H, starX + i * (5 * 3 + 3), ty, ch, col, 3);
  }
  ty += 21 + 4; // stars are 21 px tall at scale 3 — clear them before the escalation line
  textRight(buf, W, H, rx + rw - 10, ty, hud.escalation, GOLD, 2);
  if (hud.inSight) {
    textRight(buf, W, H, rx + rw - 10 - textWidth(hud.escalation, 2) - 12, ty, 'IN SIGHT', RED, 2);
  }
  ty += 15 + 4;
  for (const wslot of hud.weapons) {
    const label = wslot.locked ? `${wslot.slot} ${wslot.label} LOCKED` : `${wslot.slot} ${wslot.label}${wslot.ammo ? ` ${wslot.ammo}` : ''}`;
    const col = wslot.locked ? DARKGREY : wslot.selected ? GOLD : WHITE;
    textRight(buf, W, H, rx + rw - 10, ty, label, col, 2);
    ty += 15;
  }
  if (hud.debt > 0) {
    textRight(buf, W, H, rx + rw - 10, ty, `DEBT ${formatCashText(hud.debt)}`, RED, 2);
  }

  // -- Bottom-left: circular minimap + district + bars -----------------------
  const mc = { x: 82, y: 584, r: 72 };
  if (minimap) drawMinimap(buf, W, H, mc.x, mc.y, mc.r, minimap);
  // District label pill under the map (clear of the dialogue bar).
  const dLabel = hud.districtLabel;
  const dW = textWidth(dLabel, 2) + 16;
  const dX = mc.x - Math.floor(dW / 2);
  const dY = mc.y + mc.r + 4;
  fillRect(buf, W, H, dX, dY, dW, 18, PANEL_BG[0], PANEL_BG[1], PANEL_BG[2], PANEL_BG[3]);
  drawTextRGBA(buf, W, H, dX + 8, dY + 2, dLabel, WHITE, 2);
  // Bars block right of the minimap.
  const bx = 166;
  let by = 516;
  const bw = 150;
  drawTextRGBA(buf, W, H, bx, by, 'HEALTH', WHITE, 2);
  bar(buf, W, H, bx + 62, by + 2, bw, 10, hud.health / 100, GREEN);
  drawTextRGBA(buf, W, H, bx + 62 + bw + 6, by, String(hud.health), WHITE, 2);
  by += 24;
  drawTextRGBA(buf, W, H, bx, by, 'ARMOUR', WHITE, 2);
  bar(buf, W, H, bx + 62, by + 2, bw, 10, hud.armour / 100, BLUE);
  drawTextRGBA(buf, W, H, bx + 62 + bw + 6, by, String(hud.armour), WHITE, 2);
  by += 24;
  drawTextRGBA(buf, W, H, bx, by, `REP ${hud.rep.level}`, WHITE, 2);
  bar(buf, W, H, bx + 62, by + 2, bw, 10, hud.rep.xp / hud.rep.max, [142, 68, 173, 255]);
  drawTextRGBA(buf, W, H, bx + 62 + bw + 6, by, hud.rep.title, [142, 68, 173, 255], 2);
  by += 26;
  drawTextRGBA(buf, W, H, bx, by, 'SAFEHOUSE: CORAL MOTEL', GREEN, 2);
  by += 18;
  drawTextRGBA(buf, W, H, bx, by, 'SHOP: BAYVIEW PAWN', GOLD, 2);

  // -- Bottom-centre: portrait dialogue --------------------------------------
  // 92 tall: name + up to 3 wrapped lines (a 2-line box clipped Rook's line).
  if (hud.dialogue) {
    const dx = 436;
    const dy = 616;
    const dw = 476;
    const dh = 92;
    panel(buf, W, H, dx, dy, dw, dh);
    const p = hud.dialogue.portrait;
    fillRect(buf, W, H, dx + 8, dy + 8, 60, 60, p.bg[0], p.bg[1], p.bg[2], 255);
    const iw = textWidth(p.initials, 3);
    drawTextRGBA(buf, W, H, dx + 8 + Math.floor((60 - iw) / 2), dy + 8 + 19, p.initials, p.fg, 3);
    drawTextRGBA(buf, W, H, dx + 76, dy + 10, hud.dialogue.name.toUpperCase(), GOLD, 2);
    const dlines = wrapText(`"${hud.dialogue.line}"`, dw - 76 - 16, 2).slice(0, 3);
    let dly = dy + 28;
    for (const l of dlines) {
      drawTextRGBA(buf, W, H, dx + 76, dly, l, WHITE, 2);
      dly += 15;
    }
  }

  // -- Talk-to prompt (bottom-centre, above the dialogue slot) ---------------
  if (hud.prompt) {
    const pW = textWidth(hud.prompt, 2) + 24;
    const pX = Math.floor((W - pW) / 2);
    const pY = hud.dialogue ? 584 : 632;
    fillRect(buf, W, H, pX, pY, pW, 26, 8, 12, 20, 220);
    fillRect(buf, W, H, pX, pY, pW, 2, GOLD[0], GOLD[1], GOLD[2], 255);
    drawTextRGBA(buf, W, H, pX + 12, pY + 6, hud.prompt, GOLD, 2);
  }

  // -- Bottom-right: radio + car panel ---------------------------------------
  const brx = 936;
  const brw = 332;
  panel(buf, W, H, brx, 600, brw, 46);
  drawTextRGBA(buf, W, H, brx + 10, 608, hud.stationLabel, GOLD, 2);
  drawTextRGBA(buf, W, H, brx + 10, 626, hud.songLine || '', WHITE, 2);
  panel(buf, W, H, brx, 652, brw, 60);
  // Row 1: name left, big speed right — but a long car name ("DUNE
  // RUNNER") runs into a scale-4 speed ("137 KM/H") with no gap. Shrink
  // the speed one step when the two would collide.
  const speedText = `${hud.speedKmh} KM/H`;
  const speedScale = (name) => (textWidth(name, 2) + textWidth(speedText, 4) + 20 > brw ? 3 : 4);
  if (hud.car) {
    // Row 1: name left, big speed right. Row 2: condition bar + number left,
    // gear right. (The first pass put the speed over the condition number.)
    drawTextRGBA(buf, W, H, brx + 10, 660, hud.car.name, WHITE, 2);
    textRight(buf, W, H, brx + brw - 10, 660, speedText, WHITE, speedScale(hud.car.name));
    drawTextRGBA(buf, W, H, brx + 10, 692, 'CONDITION', GREY, 2);
    bar(buf, W, H, brx + 96, 694, 110, 10, hud.car.condition / 100, hud.car.condition < 70 ? RED : GREEN);
    drawTextRGBA(buf, W, H, brx + 212, 692, `${hud.car.condition}%`, WHITE, 2);
    textRight(buf, W, H, brx + brw - 10, 692, hud.gear, GOLD, 2);
  } else {
    drawTextRGBA(buf, W, H, brx + 10, 660, 'ON FOOT', WHITE, 2);
    textRight(buf, W, H, brx + brw - 10, 660, speedText, WHITE, speedScale('ON FOOT'));
    textRight(buf, W, H, brx + brw - 10, 692, hud.gear, GOLD, 2);
  }
}

function formatClockText(hud) {
  if (!hud.clock || hud.clock.minutes === undefined) return '';
  const h = Math.floor(hud.clock.minutes / 60);
  const m = Math.floor(hud.clock.minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatCashText(n) {
  const abs = Math.abs(Math.round(n));
  return `${n < 0 ? '-' : ''}$${abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}
