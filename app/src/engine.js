// Vice City Cover Maker — deterministic poster engine.
//
// Everything in this module is a pure function of its inputs: the same
// photos, layout, grade, seed and caption always produce the same cover,
// on any machine, because the only randomness comes from a seeded PRNG
// and a per-pixel integer hash (never Math.random, never the clock).

export const FONT_STACK =
  '"Arial Narrow", "HelveticaNeue-CondensedBold", Impact, "Franklin Gothic Medium", Arial, sans-serif';

export const PALETTES = {
  sunset: {
    label: 'Vice Sunset',
    stops: ['#2b1055', '#7597de', '#ff6e7f', '#ff9a5a', '#ffd76e'],
    wash: '#ff2e88',
    ink: '#ffffff',
    accent: '#ffd76e',
  },
  neon: {
    label: 'Neon Nights',
    stops: ['#0d0221', '#3a0ca3', '#b5179e', '#f72585', '#4cc9f0'],
    wash: '#f72585',
    ink: '#ffffff',
    accent: '#4cc9f0',
  },
  golden: {
    label: 'Golden Hour',
    stops: ['#1f1300', '#7f4f24', '#dd8a3c', '#ffb703', '#fff3b0'],
    wash: '#fb8500',
    ink: '#fff8e7',
    accent: '#ffd60a',
  },
  'teal-dusk': {
    label: 'Teal Dusk',
    stops: ['#001219', '#005f73', '#0a9396', '#94d2bd', '#e9d8a6'],
    wash: '#0a9396',
    ink: '#f4fffb',
    accent: '#e9d8a6',
  },
};

export const GRADE_NAMES = Object.keys(PALETTES);

export const EXPORT_SIZES = [
  { id: 'square', label: '1080 × 1080', w: 1080, h: 1080 },
  { id: 'portrait', label: '1080 × 1350', w: 1080, h: 1350 },
  { id: 'wide', label: '1920 × 1080', w: 1920, h: 1080 },
];

// ---------------------------------------------------------------- PRNG

/** mulberry32: tiny seeded PRNG, identical across engines and runs. */
export function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic per-pixel hash noise in [-0.5, 0.5), from (x, y, seed). */
function pixelNoise(x, y, seed) {
  let v = (x * 374761393 + y * 668265263 + seed * 974634) | 0;
  v = Math.imul(v ^ (v >>> 13), 1274126177);
  return (((v ^ (v >>> 16)) & 255) / 255) - 0.5;
}

// ---------------------------------------------------------------- colour

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Build a 256-entry gradient-map lookup table from a palette's stops:
 * shadows take the first stop, highlights the last, in the spirit of the
 * duotone sunset grades on 1980s poster art.
 */
export function buildGradientLut(stops) {
  const rgbs = stops.map(hexToRgb);
  const lut = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const t = (i / 255) * (rgbs.length - 1);
    const lo = Math.min(rgbs.length - 2, Math.floor(t));
    const frac = t - lo;
    for (let c = 0; c < 3; c += 1) {
      lut[i * 3 + c] = lerp(rgbs[lo][c], rgbs[lo + 1][c], frac);
    }
  }
  return lut;
}

/**
 * Grade one ImageData in place: gradient-map blended over a contrast-
 * lifted copy of the photo, then seeded film grain and a vignette.
 */
export function applyGrade(imageData, lut, opts) {
  const { strength = 0.62, grain = 14, seed = 7, vignette = 0.34 } = opts || {};
  const { data, width, height } = imageData;
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy) || 1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Luminance drives the gradient map.
      const lum = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
      const li = lum * 3;
      // A gentle S-curve so mid-tones lean into the sunset band while
      // highlights keep their sparkle: linear lift plus a soft shoulder.
      const lift = (v) => {
        const c = (v - 128) * 1.12 + 128;
        const clamped = c < 0 ? 0 : c > 255 ? 255 : c;
        const t = clamped / 255;
        return clamped + (t * t * (3 - 2 * t) - t) * 14;
      };
      const mix = (orig, mapped) => lerp(lift(orig), mapped, strength);
      let nr = mix(r, lut[li]);
      let ng = mix(g, lut[li + 1]);
      let nb = mix(b, lut[li + 2]);
      // Seeded grain, stronger in the shadows like real film stock.
      const n = pixelNoise(x, y, seed) * grain * (1.2 - lum / 300);
      nr += n;
      ng += n;
      nb += n;
      // Vignette: darken toward the corners.
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy) / maxDist;
      const v = 1 - vignette * d * d;
      data[i] = nr * v;
      data[i + 1] = ng * v;
      data[i + 2] = nb * v;
    }
  }
  return imageData;
}

// ---------------------------------------------------------------- layouts

function rect(x, y, w, h, role) {
  return { x, y, w, h, role };
}

/**
 * Six multi-panel poster layouts. Each returns rectangles in unit space
 * (0..1) with one 'hero' panel; the renderer scales them to the canvas.
 * Panels deliberately leave thin gutters so the sunset background shows
 * through as the poster's framing device.
 */
export const LAYOUTS = {
  'hero-grid': {
    label: 'Hero Grid',
    panels: (w, h) => [
      rect(0.015, 0.015, 0.6, 0.97, 'hero'),
      rect(0.63, 0.015, 0.355, 0.31, 'panel'),
      rect(0.63, 0.345, 0.355, 0.31, 'panel'),
      rect(0.63, 0.675, 0.355, 0.31, 'panel'),
    ],
  },
  collage: {
    label: 'Collage',
    panels: (w, h) => [
      rect(0.015, 0.015, 0.56, 0.56, 'hero'),
      rect(0.59, 0.015, 0.395, 0.36, 'panel'),
      rect(0.59, 0.39, 0.395, 0.56, 'panel'),
      rect(0.015, 0.59, 0.27, 0.395, 'panel'),
      rect(0.30, 0.59, 0.275, 0.395, 'panel'),
    ],
  },
  stack: {
    label: 'Stack',
    panels: (w, h) => [
      rect(0.015, 0.015, 0.97, 0.27, 'panel'),
      rect(0.015, 0.30, 0.97, 0.42, 'hero'),
      rect(0.015, 0.735, 0.475, 0.25, 'panel'),
      rect(0.505, 0.735, 0.48, 0.25, 'panel'),
    ],
  },
  diptych: {
    label: 'Diptych',
    panels: (w, h) => [
      rect(0.015, 0.015, 0.565, 0.97, 'hero'),
      rect(0.595, 0.015, 0.39, 0.97, 'panel'),
    ],
  },
  radial: {
    label: 'Radial',
    panels: (w, h) => [
      rect(0.24, 0.22, 0.52, 0.56, 'hero'),
      rect(0.015, 0.015, 0.30, 0.30, 'panel'),
      rect(0.685, 0.015, 0.30, 0.30, 'panel'),
      rect(0.015, 0.685, 0.30, 0.30, 'panel'),
      rect(0.685, 0.685, 0.30, 0.30, 'panel'),
    ],
  },
  skyline: {
    label: 'Skyline',
    panels: (w, h) => [
      rect(0.015, 0.015, 0.315, 0.36, 'panel'),
      rect(0.342, 0.015, 0.316, 0.36, 'panel'),
      rect(0.669, 0.015, 0.316, 0.36, 'panel'),
      rect(0.015, 0.39, 0.97, 0.595, 'hero'),
    ],
  },
};

export const LAYOUT_NAMES = Object.keys(LAYOUTS);

// ---------------------------------------------------------------- drawing

/** Cover-fit source rectangle for a photo inside a panel, with zoom/offset. */
export function coverFit(imgW, imgH, panelW, panelH, zoom = 1, ox = 0, oy = 0) {
  const scale = Math.max(panelW / imgW, panelH / imgH) * Math.max(0.4, zoom);
  const sw = panelW / scale;
  const sh = panelH / scale;
  const maxX = Math.max(0, imgW - sw);
  const maxY = Math.max(0, imgH - sh);
  const sx = Math.min(maxX, Math.max(0, (imgW - sw) / 2 + ox * maxX));
  const sy = Math.min(maxY, Math.max(0, (imgH - sh) / 2 + oy * maxY));
  return { sx, sy, sw, sh };
}

const scratch = () =>
  typeof document !== 'undefined' ? document.createElement('canvas') : null;

/**
 * Draw one photo panel: cover-fit onto a scratch canvas, grade it there,
 * then blit with a poster border. Grading per panel keeps the grain seed
 * distinct per panel while staying fully deterministic.
 */
export function drawPanel(ctx, img, r, opts) {
  const { lut, seed = 7, zoom = 1, ox = 0, oy = 0, grade = true, border = '#ffffff' } = opts;
  const w = Math.max(2, Math.round(r.w));
  const h = Math.max(2, Math.round(r.h));
  const off = scratch();
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d', { willReadFrequently: true });
  if (img) {
    const fit = coverFit(img.naturalWidth || img.width, img.naturalHeight || img.height, w, h, zoom, ox, oy);
    octx.drawImage(img, fit.sx, fit.sy, fit.sw, fit.sh, 0, 0, w, h);
  } else {
    const g = octx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#3a1c71');
    g.addColorStop(1, '#ff6e7f');
    octx.fillStyle = g;
    octx.fillRect(0, 0, w, h);
  }
  if (grade && lut) {
    const data = octx.getImageData(0, 0, w, h);
    applyGrade(data, lut, { seed: seed + Math.round(r.x + r.y) });
    octx.putImageData(data, 0, 0);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, w, h);
  ctx.clip();
  ctx.drawImage(off, r.x, r.y);
  ctx.restore();
  ctx.save();
  ctx.lineWidth = Math.max(3, Math.round(w * 0.012));
  ctx.strokeStyle = border;
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = ctx.lineWidth * 2;
  ctx.strokeRect(r.x, r.y, w, h);
  ctx.restore();
}

function drawSunsetBackdrop(ctx, w, h, palette) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  const stops = palette.stops;
  stops.forEach((hex, i) => g.addColorStop(i / (stops.length - 1), hex));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // A low sun disc behind the panels, the oldest poster trick in the book.
  const sunR = w * 0.34;
  const sun = ctx.createRadialGradient(w / 2, h * 0.98, 10, w / 2, h * 0.98, sunR);
  sun.addColorStop(0, 'rgba(255, 230, 150, 0.85)');
  sun.addColorStop(1, 'rgba(255, 230, 150, 0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);
}

function star(ctx, cx, cy, r, filled, color) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const px = cx + Math.cos(a) * rad;
    const py = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.lineWidth = Math.max(1.5, r * 0.14);
    ctx.strokeStyle = color;
    ctx.stroke();
  }
}

/** The "heat" meter: up to five stars, filled per the heat level. */
export function drawHeatMeter(ctx, x, y, size, heat, palette) {
  const n = Math.max(0, Math.min(5, Math.round(heat)));
  for (let i = 0; i < 5; i += 1) {
    star(ctx, x + i * size * 1.25 + size / 2, y + size / 2, size / 2, i < n, palette.accent);
  }
}

/** A rotated corner ribbon with the poster's badge text. The band is
 * centred far enough onto the canvas that the lettering — drawn at the
 * band's centre — always lands fully in frame; only the band's tails
 * run off the corner, as a ribbon's should. */
export function drawBadgeRibbon(ctx, w, text, palette) {
  const bandW = w * 0.52;
  const bandH = Math.max(28, w * 0.045);
  ctx.save();
  ctx.translate(w * 0.17, w * 0.105);
  ctx.rotate(-Math.PI / 5.2);
  ctx.fillStyle = palette.wash;
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = bandH * 0.4;
  ctx.fillRect(-bandW / 2, -bandH / 2, bandW, bandH);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${Math.round(bandH * 0.52)}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, bandH * 0.04);
  ctx.restore();
}

/** Fit a caption into a width by shrinking the font; returns the size used. */
export function fitFontSize(ctx, text, maxWidth, startSize, weight = 900) {
  let size = startSize;
  ctx.font = `${weight} ${size}px ${FONT_STACK}`;
  while (size > 18 && ctx.measureText(text).width > maxWidth) {
    size *= 0.94;
    ctx.font = `${weight} ${size}px ${FONT_STACK}`;
  }
  return size;
}

/**
 * The caption block: a subtitle line over a big neon-shadowed caption,
 * anchored to the bottom of the poster over a darkening wash.
 */
export function drawCaptionBlock(ctx, w, h, state, palette) {
  const caption = (state.caption || '').trim();
  const subtitle = (state.subtitle || '').trim();
  if (!caption && !subtitle) return;
  const washH = h * 0.30;
  const wash = ctx.createLinearGradient(0, h - washH, 0, h);
  wash.addColorStop(0, 'rgba(10, 2, 24, 0)');
  wash.addColorStop(1, 'rgba(10, 2, 24, 0.88)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, h - washH, w, washH);

  ctx.textAlign = 'center';
  let baseline = h - h * 0.045;
  if (caption) {
    const size = fitFontSize(ctx, caption.toUpperCase(), w * 0.92, h * 0.115);
    ctx.font = `900 ${size}px ${FONT_STACK}`;
    ctx.textBaseline = 'alphabetic';
    // Neon glow: two shadowed passes under a gradient-filled face.
    ctx.save();
    ctx.shadowColor = palette.wash;
    ctx.shadowBlur = size * 0.45;
    ctx.fillStyle = palette.wash;
    ctx.fillText(caption.toUpperCase(), w / 2, baseline);
    ctx.fillText(caption.toUpperCase(), w / 2, baseline);
    ctx.restore();
    const face = ctx.createLinearGradient(0, baseline - size, 0, baseline);
    face.addColorStop(0, '#ffffff');
    face.addColorStop(0.55, palette.accent);
    face.addColorStop(1, palette.wash);
    ctx.lineWidth = size * 0.06;
    ctx.strokeStyle = 'rgba(20, 0, 30, 0.85)';
    ctx.strokeText(caption.toUpperCase(), w / 2, baseline);
    ctx.fillStyle = face;
    ctx.fillText(caption.toUpperCase(), w / 2, baseline);
    baseline -= size * 1.12;
  }
  if (subtitle) {
    const size = fitFontSize(ctx, subtitle.toUpperCase(), w * 0.8, h * 0.034, 700);
    ctx.font = `700 ${size}px ${FONT_STACK}`;
    ctx.fillStyle = palette.ink;
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = size * 0.3;
    ctx.fillText(subtitle.toUpperCase().split('').join(' '), w / 2, baseline);
    ctx.shadowBlur = 0;
  }
}

/**
 * Render a complete poster into `canvas` at its current pixel size.
 * state: { photos: [img|null...], assignments: [photoIndex per panel],
 *          panelEdits: [{zoom, ox, oy}...], layout, grade, seed,
 *          caption, subtitle, heat, graded: bool }
 */
export function renderPoster(canvas, state) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const palette = PALETTES[state.grade] || PALETTES.sunset;
  const lut = buildGradientLut(palette.stops);
  const layout = LAYOUTS[state.layout] || LAYOUTS['hero-grid'];
  const unitRects = layout.panels(w, h);
  const rects = unitRects.map((r) => ({
    x: r.x * w,
    y: r.y * h,
    w: r.w * w,
    h: r.h * h,
    role: r.role,
  }));

  drawSunsetBackdrop(ctx, w, h, palette);

  rects.forEach((r, i) => {
    const photoIdx = state.assignments && state.assignments[i] != null
      ? state.assignments[i]
      : i % Math.max(1, state.photos.length);
    const img = state.photos && state.photos.length ? state.photos[photoIdx] || state.photos[0] : null;
    const edit = (state.panelEdits && state.panelEdits[i]) || {};
    drawPanel(ctx, img, r, {
      lut,
      seed: (state.seed || 7) + i * 131,
      zoom: edit.zoom != null ? edit.zoom : 1,
      ox: edit.ox != null ? edit.ox : 0,
      oy: edit.oy != null ? edit.oy : 0,
      grade: state.graded !== false,
      border: r.role === 'hero' ? palette.accent : '#ffffff',
    });
  });

  drawBadgeRibbon(ctx, w, 'VICE COAST ★ COVER MAKER', palette);
  drawHeatMeter(ctx, w - w * 0.235, h * 0.028, w * 0.034, state.heat != null ? state.heat : 4, palette);
  drawCaptionBlock(ctx, w, h, state, palette);
  return { rects, palette, layout };
}

/**
 * A plain-language outline of a render, generated from the exact state
 * the renderer consumed — the editor shows this so a screenshot of the
 * outline always describes the poster beside it.
 */
export function buildOutline(state, w, h) {
  const palette = PALETTES[state.grade] || PALETTES.sunset;
  const layout = LAYOUTS[state.layout] || LAYOUTS['hero-grid'];
  const panels = layout.panels(w, h).map((r, i) => ({
    index: i,
    role: r.role,
    rect: {
      x: Math.round(r.x * w),
      y: Math.round(r.y * h),
      w: Math.round(r.w * w),
      h: Math.round(r.h * h),
    },
    photo: state.assignments && state.assignments[i] != null ? state.assignments[i] : null,
    zoom: state.panelEdits && state.panelEdits[i] ? state.panelEdits[i].zoom : 1,
  }));
  return {
    app: 'Vice City Cover Maker',
    canvas: { width: w, height: h },
    layout: state.layout,
    layoutLabel: layout.label,
    grade: state.grade,
    palette: palette.stops,
    font: FONT_STACK,
    seed: state.seed,
    caption: state.caption,
    subtitle: state.subtitle,
    heat: state.heat,
    panels,
    exports: EXPORT_SIZES.map((s) => `${s.w}x${s.h}`),
  };
}
