// engine.js — the Vice City Cover Maker poster engine.
// Pure canvas work: give it a 2D context, a size and a render state and it
// paints a finished multi-panel cover. No DOM lookups in here except the
// scratch canvases it allocates for grading, so the editor, the exporter
// and the screenshot scenes all share exactly one drawing routine.

export const EXPORT_SIZES = [
  { id: 'square', label: 'Square post · 1080 × 1080', w: 1080, h: 1080 },
  { id: 'portrait', label: 'Portrait post · 1080 × 1350', w: 1080, h: 1350 },
  { id: 'wide', label: 'Wide banner · 1920 × 1080', w: 1920, h: 1080 },
];

// A grade is a gradient map: shadow colour, two mid stops, highlight colour.
// The photo's luminance walks this ramp, which is what gives the flat,
// screen-printed Vice City look instead of a plain orange overlay.
export const GRADES = {
  sunset: {
    label: 'Vice Sunset',
    stops: ['#1b1035', '#7b2d8b', '#e84e8a', '#ff9a3d', '#ffe9a3'],
  },
  neon: {
    label: 'Neon Nights',
    stops: ['#060a24', '#123a8f', '#0fb5bf', '#ff3d8a', '#fdf6ff'],
  },
  goldenhour: {
    label: 'Golden Hour',
    stops: ['#241105', '#8a3b12', '#e07b24', '#ffc44d', '#fff3c4'],
  },
  lagoon: {
    label: 'Lagoon Teal',
    stops: ['#02181d', '#065a60', '#1b9aaa', '#7fe0c3', '#f4fff8'],
  },
  ultravio: {
    label: 'Ultraviolet',
    stops: ['#0d021f', '#3d0a6e', '#8b2fc9', '#ff4fd8', '#ffe3fb'],
  },
};

// Layouts return panel rectangles in fractions of the poster, so one layout
// works at preview size and at every export size. `hero` marks the panel the
// caption block leans on; `weight` hints which photo a fresh panel wants.
function rect(x, y, w, h, extra = {}) {
  return { x, y, w, h, ...extra };
}

export const LAYOUTS = {
  heroGrid: {
    label: 'Hero Grid',
    panels: (w, h) => [
      rect(0, 0, 0.62, 1, { hero: true }),
      rect(0.62, 0, 0.38, 0.34),
      rect(0.62, 0.34, 0.38, 0.33),
      rect(0.62, 0.67, 0.38, 0.33),
    ],
  },
  nineGrid: {
    label: 'Cover Grid 3×3',
    panels: () => {
      const out = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        out.push(rect(c / 3, r / 3, 1 / 3, 1 / 3, { hero: r === 1 && c === 1 }));
      }
      return out;
    },
  },
  collage: {
    label: 'Collage Cut',
    panels: () => [
      rect(0, 0, 0.55, 0.58, { hero: true }),
      rect(0.55, 0, 0.45, 0.38),
      rect(0.55, 0.38, 0.22, 0.62),
      rect(0.77, 0.38, 0.23, 0.62),
      rect(0, 0.58, 0.55, 0.42),
    ],
  },
  stack: {
    label: 'Stacked Strips',
    panels: () => [
      rect(0, 0, 1, 0.4, { hero: true }),
      rect(0, 0.4, 1, 0.2),
      rect(0, 0.6, 1, 0.2),
      rect(0, 0.8, 1, 0.2),
    ],
  },
  diptych: {
    label: 'Diptych + Band',
    panels: () => [
      rect(0, 0, 0.5, 0.72, { hero: true }),
      rect(0.5, 0, 0.5, 0.72),
      rect(0, 0.72, 1, 0.28),
    ],
  },
  skyline: {
    label: 'Skyline Split',
    panels: () => [
      rect(0, 0, 0.34, 1, { hero: true }),
      rect(0.34, 0, 0.66, 0.52),
      rect(0.34, 0.52, 0.33, 0.48),
      rect(0.67, 0.52, 0.33, 0.48),
    ],
  },
};

export const LAYOUT_IDS = Object.keys(LAYOUTS);
export const GRADE_IDS = Object.keys(GRADES);

// Deterministic PRNG so a seed always grows the same grain.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Build a 256-entry lookup table walking the grade's stops.
export function buildGradientLut(grade) {
  const cols = grade.stops.map(hexToRgb);
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (cols.length - 1);
    const k = Math.min(cols.length - 2, Math.floor(t));
    const f = t - k;
    for (let ch = 0; ch < 3; ch++) {
      lut[i * 3 + ch] = Math.round(cols[k][ch] + (cols[k + 1][ch] - cols[k][ch]) * f);
    }
  }
  return lut;
}

const scratch = document.createElement('canvas');
const scratchCtx = scratch.getContext('2d', { willReadFrequently: true });

// Draw one photo into a panel rect with cover-fit crop, the panel's own
// zoom and pan, then gradient-map it. A missing photo paints a sunset
// gradient placeholder so a half-filled cover still reads as a poster.
export function paintPanel(ctx, img, panelPx, tune, lut, grade) {
  const { x, y, w, h } = panelPx;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (!img || !img.naturalWidth) {
    const g = ctx.createLinearGradient(x, y + h, x + w, y);
    grade.stops.forEach((c, i) => g.addColorStop(i / (grade.stops.length - 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    return;
  }
  const zoom = tune?.zoom ?? 1;
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * zoom;
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = x + (w - dw) / 2 + (tune?.ox ?? 0) * w * 0.35;
  const dy = y + (h - dh) / 2 + (tune?.oy ?? 0) * h * 0.35;

  scratch.width = Math.max(2, Math.round(w));
  scratch.height = Math.max(2, Math.round(h));
  scratchCtx.clearRect(0, 0, scratch.width, scratch.height);
  scratchCtx.drawImage(img, dx - x, dy - y, dw, dh);
  const data = scratchCtx.getImageData(0, 0, scratch.width, scratch.height);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    // Rec. 601 luma, lightly contrast-pushed before the ramp.
    let lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    lum = Math.max(0, Math.min(255, (lum - 128) * 1.12 + 128));
    const li = Math.round(lum) * 3;
    // Keep a whisper of the original hue so skin and sky stay alive.
    px[i] = Math.min(255, lut[li] * 0.82 + px[i] * 0.18);
    px[i + 1] = Math.min(255, lut[li + 1] * 0.82 + px[i + 1] * 0.18);
    px[i + 2] = Math.min(255, lut[li + 2] * 0.82 + px[i + 2] * 0.18);
  }
  scratchCtx.putImageData(data, 0, 0);
  ctx.drawImage(scratch, x, y);
  ctx.restore();
}

function star(ctx, cx, cy, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

// Fit the caption: shrink from a poster-sized start until every word fits.
function fitCaption(ctx, text, maxWidth, startSize) {
  let size = startSize;
  const set = (s) => { ctx.font = `900 ${s}px "Arial Black", "Segoe UI", system-ui, sans-serif`; };
  set(size);
  while (size > 18 && ctx.measureText(text).width > maxWidth) {
    size *= 0.92;
    set(size);
  }
  return size;
}

function paintLettering(ctx, W, H, state, grade) {
  const caption = (state.caption || '').trim();
  const sub = (state.subtitle || '').trim();
  if (!caption && !sub) return;
  const base = Math.min(W, H);
  ctx.save();
  ctx.textAlign = 'center';

  if (caption) {
    const size = fitCaption(ctx, caption.toUpperCase(), W * 0.92, base * 0.17);
    const y = H - base * 0.16;
    const grad = ctx.createLinearGradient(0, y - size, 0, y);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, grade.stops[4]);
    grad.addColorStop(1, grade.stops[3]);
    ctx.lineWidth = size * 0.16;
    ctx.strokeStyle = '#160a2e';
    ctx.lineJoin = 'round';
    ctx.shadowColor = grade.stops[2];
    ctx.shadowBlur = size * 0.35;
    ctx.shadowOffsetY = size * 0.06;
    const upper = caption.toUpperCase();
    ctx.strokeText(upper, W / 2, y);
    ctx.shadowBlur = 0;
    ctx.fillStyle = grad;
    ctx.fillText(upper, W / 2, y);
  }
  if (sub) {
    const size = Math.max(20, base * 0.055);
    ctx.font = `italic 600 ${size}px "Segoe Script", "Brush Script MT", cursive`;
    ctx.shadowColor = grade.stops[2];
    ctx.shadowBlur = size * 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(sub, W / 2, H - base * 0.055);
  }
  ctx.restore();
}

function paintDecorations(ctx, W, H, state, grade) {
  const base = Math.min(W, H);
  ctx.save();
  // Heat stars, top-left: filled for the chosen heat, hollow past it.
  const heat = Math.max(0, Math.min(5, state.heat ?? 5));
  const r = base * 0.026;
  for (let i = 0; i < 5; i++) {
    const cx = base * 0.05 + i * r * 2.5;
    const cy = base * 0.055;
    if (i < heat) {
      star(ctx, cx, cy, r, '#ffd94d');
      ctx.strokeStyle = '#160a2e';
      ctx.lineWidth = r * 0.16;
      ctx.stroke();
    } else {
      star(ctx, cx, cy, r, 'rgba(255,255,255,0.22)');
    }
  }
  // Circular badge, top-right, with the poster's own tag around its rim.
  const br = base * 0.062;
  const bx = W - br - base * 0.035;
  const by = br + base * 0.035;
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fillStyle = grade.stops[2];
  ctx.fill();
  ctx.lineWidth = br * 0.1;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(bx, by, br * 0.72, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = br * 0.05;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${br * 0.62}px "Arial Black", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VC', bx, by + br * 0.03);
  ctx.textBaseline = 'alphabetic';
  ctx.restore();
}

function paintGrainAndVignette(ctx, W, H, seed) {
  const rand = mulberry32(seed || 1);
  const tile = 128;
  const noise = document.createElement('canvas');
  noise.width = tile; noise.height = tile;
  const nctx = noise.getContext('2d');
  const img = nctx.createImageData(tile, tile);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rand() * 255);
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v;
    img.data[i + 3] = 14;
  }
  nctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  const pattern = ctx.createPattern(noise, 'repeat');
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.78);
  vg.addColorStop(0, 'rgba(10,4,24,0)');
  vg.addColorStop(1, 'rgba(10,4,24,0.42)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

// Panel rectangles in pixels for a given poster size — the editor's outline
// panel prints these, so what it shows is what the engine drew.
export function panelRectsPx(layoutId, W, H) {
  return LAYOUTS[layoutId].panels(W, H).map((p) => ({
    x: Math.round(p.x * W), y: Math.round(p.y * H),
    w: Math.round(p.w * W), h: Math.round(p.h * H),
    hero: !!p.hero,
  }));
}

// The one render entry point. state = { layout, grade, caption, subtitle,
// heat, seed, photos: [img...], assignments: [photoIndex...],
// tunes: [{zoom, ox, oy}...] }
export function renderCover(ctx, W, H, state) {
  const grade = GRADES[state.grade] ?? GRADES.sunset;
  const lut = buildGradientLut(grade);
  const frac = LAYOUTS[state.layout].panels(W, H);
  ctx.fillStyle = '#12081f';
  ctx.fillRect(0, 0, W, H);

  frac.forEach((p, i) => {
    const px = { x: p.x * W, y: p.y * H, w: p.w * W, h: p.h * H };
    const photoIdx = state.assignments?.[i] ?? i % Math.max(1, state.photos.length);
    const entry = state.photos[photoIdx] ?? state.photos[0];
    const img = entry?.img ?? entry; // photos may be {img, name} entries or bare images
    paintPanel(ctx, img, px, state.tunes?.[i], lut, grade);
  });

  // White keylines between panels — the printed-cover seam.
  const seam = Math.max(3, Math.round(Math.min(W, H) * 0.008));
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = seam;
  frac.forEach((p) => {
    ctx.strokeRect(p.x * W, p.y * H, p.w * W, p.h * H);
  });
  ctx.strokeStyle = '#160a2e';
  ctx.lineWidth = seam * 2.4;
  ctx.strokeRect(0, 0, W, H);

  paintDecorations(ctx, W, H, state, grade);
  paintLettering(ctx, W, H, state, grade);
  paintGrainAndVignette(ctx, W, H, state.seed ?? 7);
}
