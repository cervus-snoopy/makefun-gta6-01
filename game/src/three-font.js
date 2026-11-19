// three-font.js — PORT MERCER 3D: tiny 5x7 bitmap font, zero dependencies.
// One font drives two surfaces so they cannot drift:
//   (a) the screenshot HUD compositor (three-shot-hud.js) draws text into the
//       pixel buffer with drawTextRGBA;
//   (b) the 3D sign/billboard textures (three-render.js) bake the same glyphs
//       into a DataTexture with renderTextRGBA.
// Glyphs are hand-drawn 5-wide x 7-tall bit rows ('1' = ink). Unknown chars
// fall back to blank. Text is rendered UPPERCASE; lowercase maps to upper.

export const FONT_W = 5;
export const FONT_H = 7;

const G = (rows) => rows;

export const FONT = {
  A: G(['01110', '10001', '10001', '11111', '10001', '10001', '10001']),
  B: G(['11110', '10001', '10001', '11110', '10001', '10001', '11110']),
  C: G(['01110', '10001', '10000', '10000', '10000', '10001', '01110']),
  D: G(['11110', '10001', '10001', '10001', '10001', '10001', '11110']),
  E: G(['11111', '10000', '10000', '11110', '10000', '10000', '11111']),
  F: G(['11111', '10000', '10000', '11110', '10000', '10000', '10000']),
  G: G(['01110', '10001', '10000', '10111', '10001', '10001', '01111']),
  H: G(['10001', '10001', '10001', '11111', '10001', '10001', '10001']),
  I: G(['01110', '00100', '00100', '00100', '00100', '00100', '01110']),
  J: G(['00111', '00010', '00010', '00010', '00010', '10010', '01100']),
  K: G(['10001', '10010', '10100', '11000', '10100', '10010', '10001']),
  L: G(['10000', '10000', '10000', '10000', '10000', '10000', '11111']),
  M: G(['10001', '11011', '10101', '10101', '10001', '10001', '10001']),
  N: G(['10001', '11001', '10101', '10011', '10001', '10001', '10001']),
  O: G(['01110', '10001', '10001', '10001', '10001', '10001', '01110']),
  P: G(['11110', '10001', '10001', '11110', '10000', '10000', '10000']),
  Q: G(['01110', '10001', '10001', '10001', '10101', '10010', '01101']),
  R: G(['11110', '10001', '10001', '11110', '10100', '10010', '10001']),
  S: G(['01111', '10000', '10000', '01110', '00001', '00001', '11110']),
  T: G(['11111', '00100', '00100', '00100', '00100', '00100', '00100']),
  U: G(['10001', '10001', '10001', '10001', '10001', '10001', '01110']),
  V: G(['10001', '10001', '10001', '10001', '10001', '01010', '00100']),
  W: G(['10001', '10001', '10001', '10101', '10101', '11011', '10001']),
  X: G(['10001', '10001', '01010', '00100', '01010', '10001', '10001']),
  Y: G(['10001', '10001', '01010', '00100', '00100', '00100', '00100']),
  Z: G(['11111', '00001', '00010', '00100', '01000', '10000', '11111']),
  '0': G(['01110', '10001', '10011', '10101', '11001', '10001', '01110']),
  '1': G(['00100', '01100', '00100', '00100', '00100', '00100', '01110']),
  '2': G(['01110', '10001', '00001', '00110', '01000', '10000', '11111']),
  '3': G(['11111', '00010', '00100', '00010', '00001', '10001', '01110']),
  '4': G(['00010', '00110', '01010', '10010', '11111', '00010', '00010']),
  '5': G(['11111', '10000', '11110', '00001', '00001', '10001', '01110']),
  '6': G(['00110', '01000', '10000', '11110', '10001', '10001', '01110']),
  '7': G(['11111', '00001', '00010', '00100', '01000', '01000', '01000']),
  '8': G(['01110', '10001', '10001', '01110', '10001', '10001', '01110']),
  '9': G(['01110', '10001', '10001', '01111', '00001', '00010', '01100']),
  ' ': G(['00000', '00000', '00000', '00000', '00000', '00000', '00000']),
  '.': G(['00000', '00000', '00000', '00000', '00000', '01100', '01100']),
  ',': G(['00000', '00000', '00000', '00000', '01100', '00100', '01000']),
  ':': G(['00000', '01100', '01100', '00000', '01100', '01100', '00000']),
  ';': G(['00000', '01100', '01100', '00000', '01100', '00100', '01000']),
  '!': G(['00100', '00100', '00100', '00100', '00100', '00000', '00100']),
  '?': G(['01110', '10001', '00001', '00110', '00100', '00000', '00100']),
  "'": G(['00100', '00100', '01000', '00000', '00000', '00000', '00000']),
  '-': G(['00000', '00000', '00000', '11111', '00000', '00000', '00000']),
  '/': G(['00001', '00010', '00010', '00100', '01000', '01000', '10000']),
  $: G(['00100', '01111', '10100', '01110', '00101', '11110', '00100']),
  '%': G(['11001', '11010', '00010', '00100', '01000', '01011', '10011']),
  '(': G(['00010', '00100', '01000', '01000', '01000', '00100', '00010']),
  ')': G(['01000', '00100', '00010', '00010', '00010', '00100', '01000']),
  '&': G(['01100', '10010', '10100', '01000', '10101', '10010', '01101']),
  '+': G(['00000', '00100', '00100', '11111', '00100', '00100', '00000']),
  '=': G(['00000', '00000', '11111', '00000', '11111', '00000', '00000']),
  '"': G(['01010', '01010', '00000', '00000', '00000', '00000', '00000']),
  '#': G(['01010', '01010', '11111', '01010', '11111', '01010', '01010']),
  _: G(['00000', '00000', '00000', '00000', '00000', '00000', '11111']),
  '>': G(['10000', '01000', '00100', '00010', '00100', '01000', '10000']),
  '<': G(['00001', '00010', '00100', '01000', '00100', '00010', '00001']),
  // Filled star (wanted) and hollow star (SEARCHING / empty slot).
  '★': G(['00100', '00100', '01110', '11111', '01110', '01010', '10001']),
  '☆': G(['00100', '01010', '10001', '10001', '10001', '01010', '00100']),
  '•': G(['00000', '00000', '01100', '01100', '00000', '00000', '00000']),
  '·': G(['00000', '00000', '00000', '01100', '00000', '00000', '00000']),
  '—': G(['00000', '00000', '00000', '11111', '00000', '00000', '00000']),
  '’': G(['00100', '00100', '01000', '00000', '00000', '00000', '00000']),
  '“': G(['01010', '01010', '00100', '00000', '00000', '00000', '00000']),
  '”': G(['01010', '01010', '00100', '00000', '00000', '00000', '00000']),
};

// Width of a string at a scale: 6 px per glyph (5 + 1 spacing) x scale.
export function textWidth(text, scale = 1) {
  const s = String(text ?? '').toUpperCase();
  if (s.length === 0) return 0;
  return (s.length * 6 - 1) * scale;
}

// Height of one line at a scale.
export function textHeight(scale = 1) {
  return FONT_H * scale;
}

// Blend one RGBA pixel over the buffer (src-over, alpha 0..255).
export function blendPixel(buf, W, H, x, y, r, g, b, a) {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const i = (y * W + x) * 4;
  if (a >= 255) {
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
    return;
  }
  const inv = 255 - a;
  buf[i] = (r * a + buf[i] * inv) / 255;
  buf[i + 1] = (g * a + buf[i + 1] * inv) / 255;
  buf[i + 2] = (b * a + buf[i + 2] * inv) / 255;
  buf[i + 3] = 255;
}

// Fill a rect (clipped to the buffer) with an RGBA colour.
export function fillRect(buf, W, H, x, y, w, h, r, g, b, a = 255) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w));
  const y1 = Math.min(H, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) {
      blendPixel(buf, W, H, xx, yy, r, g, b, a);
    }
  }
}

// Draw text into an RGBA buffer. colour = [r, g, b, a]. Returns the width drawn.
export function drawTextRGBA(buf, W, H, x, y, text, colour, scale = 1) {
  const [r, g, b, a = 255] = colour;
  const s = String(text ?? '').toUpperCase();
  let cx = Math.round(x);
  const cy = Math.round(y);
  for (const ch of s) {
    const glyph = FONT[ch] || FONT[' '];
    for (let row = 0; row < FONT_H; row++) {
      const bits = glyph[row];
      for (let col = 0; col < FONT_W; col++) {
        if (bits[col] !== '1') continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            blendPixel(buf, W, H, cx + col * scale + dx, cy + row * scale + dy, r, g, b, a);
          }
        }
      }
    }
    cx += 6 * scale;
  }
  return cx - Math.round(x);
}

// Render text into a fresh RGBA buffer (transparent background) — the source
// for three.js DataTexture sign faces. Returns { data, width, height }.
export function renderTextRGBA(text, { scale = 4, fg = [255, 255, 255, 255], bg = null, pad = 4 } = {}) {
  const s = String(text ?? '').toUpperCase();
  const w = textWidth(s, scale) + pad * 2;
  const h = textHeight(scale) + pad * 2;
  const data = new Uint8Array(w * h * 4);
  if (bg) fillRect(data, w, h, 0, 0, w, h, bg[0], bg[1], bg[2], bg[3] ?? 255);
  drawTextRGBA(data, w, h, pad, pad, s, fg, scale);
  return { data, width: w, height: h };
}

// Word-wrap a string to lines that fit maxWidth px at the given scale.
export function wrapText(text, maxWidth, scale = 1) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (textWidth(trial, scale) <= maxWidth || !line) {
      line = trial;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}
