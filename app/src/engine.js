// engine.js — Neon Frame's poster engine.
//
// The engine works in two halves so the poster is auditable end to end:
//
//   makePlan(input)  -> a plain data object: the layout's panels (rects or
//                       polygons, in fractions of the poster), which photo
//                       each panel takes, its zoom and focal point, the
//                       palette and the lettering. Same input, same plan,
//                       byte for byte: every variation comes from a seeded
//                       generator keyed on the plan's seed.
//   paintPoster(...) -> draws a plan onto a 2D context with the photos it
//                       names. It reads nothing else, so the editor preview,
//                       the PNG exporter and the screenshot scenes all paint
//                       the identical poster from the identical plan.
//   outlineOf(plan)  -> the plan written out as text. The editor shows it
//                       beside the poster; because it is generated from the
//                       same object the painter consumed, the outline can
//                       never drift from the art.

// The three post sizes the maker exports, in pixels.
export const POSTER_SIZES = [
  { key: 'square', label: 'Square', w: 1080, h: 1080 },
  { key: 'portrait', label: 'Portrait', w: 1080, h: 1350 },
  { key: 'landscape', label: 'Landscape', w: 1920, h: 1080 },
];

export function sizeByKey(key) {
  return POSTER_SIZES.find((s) => s.key === key) ?? POSTER_SIZES[0];
}

// The Vice City ramp the grade is built from: ink first, then the sunset
// climbing purple -> magenta -> coral -> amber -> pale gold, with the teal
// the city lights answer it with.
export const SUNSET_RAMP = ['#170736', '#3d1160', '#8e2a7d', '#e8447c', '#ff7a3d', '#ffb347', '#ffe9a8'];
export const TEAL_ACCENT = '#17e6c8';
export const PAPER = '#fff7ea';
export const INK = '#150627';

// FNV-1a over the seed text, then xorshift32: small, stable across engines,
// and identical on every machine, which is what makes a seed reproducible.
export function seedHash(text) {
  let h = 0x811c9dc5;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function seededRandom(seedText) {
  let a = seedHash(seedText) || 0x9e3779b9;
  return () => {
    a ^= a << 13; a >>>= 0;
    a ^= a >> 17;
    a ^= a << 5; a >>>= 0;
    return a / 4294967296;
  };
}

// ---------------------------------------------------------------- layouts
// A panel is { shape, hero } where shape is either
//   { kind: 'rect', x, y, w, h, tilt }   fractions of the poster, tilt in
//                                        degrees clockwise, or
//   { kind: 'poly', points: [[x, y]...] } fractions, for the split and fan
//                                        layouts that rectangles cannot say.

function rectPanel(x, y, w, h, tilt = 0, hero = false) {
  return { shape: { kind: 'rect', x, y, w, h, tilt }, hero };
}

function polyPanel(points, hero = false) {
  return { shape: { kind: 'poly', points }, hero };
}

function fanWedges() {
  // Five wedges fanned from a point just below the poster's foot, with a
  // hero band laid across the top of the fan.
  const panels = [rectPanel(0, 0, 1, 0.36, 0, true)];
  const spans = [[180, 213], [216, 249], [252, 285], [288, 321], [324, 357]];
  for (const [a0, a1] of spans) {
    const pts = [[0.5, 1.04]];
    for (let a = a0; a <= a1; a += 3) {
      const rad = (a * Math.PI) / 180;
      pts.push([0.5 + 1.35 * Math.cos(rad), 1.04 + 1.35 * Math.sin(rad)]);
    }
    panels.push(polyPanel(pts));
  }
  return panels;
}

export const LAYOUT_CATALOG = [
  {
    id: 'hero-grid', title: 'Hero Grid',
    build: () => [
      rectPanel(0, 0, 0.64, 0.6, 0, true),
      rectPanel(0.64, 0, 0.36, 0.3),
      rectPanel(0.64, 0.3, 0.36, 0.3),
      rectPanel(0, 0.6, 0.32, 0.4),
      rectPanel(0.32, 0.6, 0.68, 0.4),
    ],
  },
  {
    id: 'collage', title: 'Neon Collage',
    build: () => [
      rectPanel(0.03, 0.05, 0.6, 0.58, -2, true),
      rectPanel(0.52, 0.02, 0.45, 0.4, 2.5),
      rectPanel(0.47, 0.47, 0.5, 0.5, -1.5),
      rectPanel(0.05, 0.6, 0.38, 0.36, 3),
    ],
  },
  {
    id: 'stack', title: 'Strip Stack',
    build: () => [
      polyPanel([[0, 0], [1, 0], [1, 0.36], [0, 0.4]], true),
      polyPanel([[0, 0.4], [1, 0.36], [1, 0.56], [0, 0.6]]),
      polyPanel([[0, 0.6], [1, 0.56], [1, 0.8], [0, 0.76]]),
      polyPanel([[0, 0.76], [1, 0.8], [1, 1], [0, 1]]),
    ],
  },
  {
    id: 'diptych', title: 'Split Diptych',
    build: () => [
      polyPanel([[0, 0], [0.62, 0], [0.38, 1], [0, 1]], true),
      polyPanel([[0.62, 0], [1, 0], [1, 1], [0.38, 1]]),
    ],
  },
  {
    id: 'radial', title: 'Sunburst Fan',
    build: fanWedges,
  },
  {
    id: 'skyline', title: 'Skyline Base',
    build: () => [
      rectPanel(0, 0, 1, 0.66, 0, true),
      rectPanel(0, 0.66, 0.485, 0.34),
      rectPanel(0.515, 0.66, 0.485, 0.34),
    ],
  },
];

export function layoutById(id) {
  return LAYOUT_CATALOG.find((l) => l.id === id) ?? LAYOUT_CATALOG[0];
}

// ------------------------------------------------------------------- plan

// input: { title, kicker, layoutId, seed, sizeKey, photoTotal }
// Panels are dealt photos starting with the hero on photo 0; a seeded
// rotation keeps a one-photo poster from looking dealt in a straight line.
export function makePlan(input) {
  const size = sizeByKey(input.sizeKey);
  const layout = layoutById(input.layoutId);
  const seed = String(input.seed ?? '1');
  const rand = seededRandom(`${seed}:${layout.id}`);
  const photoTotal = Math.max(1, input.photoTotal ?? 1);
  const rotation = Math.floor(rand() * photoTotal);

  const panels = layout.build().map((panel, i) => {
    const jitter = (range) => (rand() * 2 - 1) * range;
    return {
      index: i,
      hero: panel.hero,
      shape: panel.shape,
      photoIndex: i === 0 ? 0 : (i + rotation) % photoTotal,
      zoom: panel.hero ? 1.12 + rand() * 0.15 : 1.05 + rand() * 0.3,
      focusX: 0.5 + jitter(0.14),
      focusY: (panel.hero ? 0.36 : 0.44) + jitter(0.08),
    };
  });

  return {
    app: 'Neon Frame',
    title: String(input.title ?? ''),
    kicker: String(input.kicker ?? ''),
    layoutId: layout.id,
    layoutTitle: layout.title,
    seed,
    width: size.w,
    height: size.h,
    sizeKey: size.key,
    palette: [...SUNSET_RAMP],
    accent: TEAL_ACCENT,
    panels,
    skyline: layout.id === 'skyline',
  };
}

// The same plan at another post size: shapes are fractions, so only the
// pixel size and the lettering scale change.
export function planAtSize(plan, sizeKey) {
  const size = sizeByKey(sizeKey);
  return { ...plan, width: size.w, height: size.h, sizeKey: size.key };
}

// ---------------------------------------------------------------- drawing

function panelPath(ctx, shape, W, H) {
  ctx.beginPath();
  if (shape.kind === 'rect') {
    const x = shape.x * W, y = shape.y * H, w = shape.w * W, h = shape.h * H;
    const cx = x + w / 2, cy = y + h / 2;
    if (shape.tilt) {
      // The rect rotated about its own centre, corners computed by hand so
      // the path and the geometry the painter reports are the same thing.
      const rad = (shape.tilt * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
      corners.forEach(([dx, dy], i) => {
        const px = cx + dx * cos - dy * sin;
        const py = cy + dx * sin + dy * cos;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.closePath();
      return { bbox: { x, y, w, h }, tilt: shape.tilt, cx, cy };
    }
    ctx.rect(x, y, w, h);
    return { bbox: { x, y, w, h }, tilt: 0, cx, cy };
  }
  shape.points.forEach(([fx, fy], i) => {
    const px = fx * W, py = fy * H;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.closePath();
  const xs = shape.points.map(([fx]) => fx * W);
  const ys = shape.points.map(([, fy]) => fy * H);
  const x = Math.min(...xs), y = Math.min(...ys);
  return {
    bbox: { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y },
    tilt: 0, cx: x + (Math.max(...xs) - x) / 2, cy: y + (Math.max(...ys) - y) / 2,
  };
}

function paintPhotoPanel(ctx, panel, drawn, photo, W, H) {
  const { bbox, tilt, cx, cy } = drawn;
  ctx.save();
  ctx.clip();
  if (tilt) {
    ctx.translate(cx, cy);
    ctx.rotate((tilt * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }
  if (photo && photo.naturalWidth) {
    const scale = Math.max(bbox.w / photo.naturalWidth, bbox.h / photo.naturalHeight) * panel.zoom;
    const dw = photo.naturalWidth * scale;
    const dh = photo.naturalHeight * scale;
    const dx = bbox.x + (bbox.w - dw) * panel.focusX;
    const dy = bbox.y + (bbox.h - dh) * panel.focusY;
    ctx.filter = 'saturate(1.38) contrast(1.09) brightness(1.03)';
    ctx.drawImage(photo, dx, dy, dw, dh);
    ctx.filter = 'none';
  } else {
    // No photo dealt here yet: a ramp gradient and the panel's number, so
    // an empty poster still reads as designed art, never as a hole.
    const g = ctx.createLinearGradient(bbox.x, bbox.y + bbox.h, bbox.x + bbox.w, bbox.y);
    SUNSET_RAMP.forEach((c, i) => g.addColorStop(i / (SUNSET_RAMP.length - 1), c));
    ctx.fillStyle = g;
    ctx.fillRect(bbox.x - bbox.h * 0.2, bbox.y - bbox.h * 0.2, bbox.w + bbox.h * 0.4, bbox.h * 1.4);
    ctx.fillStyle = 'rgba(255,247,234,0.5)';
    ctx.font = `900 ${Math.round(bbox.h * 0.5)}px 'Arial Black', system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(panel.index + 1), cx, cy);
    ctx.textBaseline = 'alphabetic';
  }
  // The grade's second pass: sunset light poured over every panel alike.
  const pour = ctx.createLinearGradient(0, bbox.y, 0, bbox.y + bbox.h);
  pour.addColorStop(0, 'rgba(23,7,54,0.22)');
  pour.addColorStop(0.45, 'rgba(23,7,54,0)');
  pour.addColorStop(1, 'rgba(232,68,124,0.20)');
  ctx.fillStyle = pour;
  ctx.fillRect(bbox.x - bbox.h * 0.2, bbox.y - bbox.h * 0.2, bbox.w + bbox.h * 0.4, bbox.h * 1.4);
  ctx.restore();
}

function paintSkyline(ctx, plan) {
  const { width: W, height: H } = plan;
  const rand = seededRandom(`${plan.seed}:skyline`);
  ctx.save();
  // A dusk scrim first, so the silhouette sits on light, not on photo.
  const scrim = ctx.createLinearGradient(0, H * 0.8, 0, H);
  scrim.addColorStop(0, 'rgba(21,6,39,0)');
  scrim.addColorStop(1, 'rgba(21,6,39,0.55)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, H * 0.8, W, H * 0.2);
  ctx.fillStyle = '#1c0733';
  let x = -W * 0.02;
  const base = H;
  while (x < W * 1.02) {
    const bw = W * (0.03 + rand() * 0.05);
    const bh = H * (0.05 + rand() * 0.11);
    ctx.fillRect(x, base - bh, bw, bh);
    // Lit windows, dealt by the same seed every time.
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,179,71,0.9)' : 'rgba(23,230,200,0.85)';
    const cols = Math.max(1, Math.floor(bw / (W * 0.012)));
    const rows = Math.max(1, Math.floor(bh / (H * 0.016)));
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (rand() > 0.55) continue;
        ctx.fillRect(x + bw * (0.15 + (0.7 * c) / cols), base - bh + bh * (0.12 + (0.76 * r) / rows), W * 0.005, H * 0.006);
      }
    }
    ctx.fillStyle = '#1c0733';
    x += bw + W * (0.004 + rand() * 0.01);
  }
  // Two palms leaning in from the edges.
  for (const [px, flip] of [[W * 0.045, 1], [W * 0.955, -1]]) {
    ctx.strokeStyle = '#1c0733';
    ctx.lineWidth = Math.max(3, W * 0.006);
    ctx.beginPath();
    ctx.moveTo(px, H);
    ctx.quadraticCurveTo(px + flip * W * 0.012, H * 0.9, px + flip * W * 0.03, H * 0.845);
    ctx.stroke();
    ctx.lineWidth = Math.max(2, W * 0.0035);
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (0.08 + i * 0.17);
      const topX = px + flip * W * 0.03, topY = H * 0.845;
      ctx.beginPath();
      ctx.moveTo(topX, topY);
      ctx.quadraticCurveTo(
        topX + flip * Math.cos(a) * W * 0.045, topY - Math.sin(a) * H * 0.03,
        topX + flip * Math.cos(a) * W * 0.075, topY - Math.sin(a) * H * 0.028 + H * 0.03,
      );
      ctx.stroke();
    }
  }
  ctx.restore();
}

const TITLE_FONT = (px) => `italic 900 ${px}px 'Arial Black', 'Archivo Black', 'Segoe UI', system-ui, sans-serif`;

function wrapTitle(ctx, text, maxWidth, startPx) {
  // Greedy word wrap into at most two lines, shrinking until both fit.
  let px = startPx;
  while (px > 20) {
    ctx.font = TITLE_FONT(px);
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [''];
    for (const word of words) {
      const trial = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${word}` : word;
      if (ctx.measureText(trial).width <= maxWidth || !lines[lines.length - 1]) {
        lines[lines.length - 1] = trial;
      } else if (lines.length < 2) {
        lines.push(word);
      } else {
        lines[lines.length - 1] = trial; // overflow: shrink and retry
      }
    }
    if (lines.every((l) => ctx.measureText(l).width <= maxWidth)) return { lines, px };
    px *= 0.92;
  }
  ctx.font = TITLE_FONT(px);
  return { lines: [text], px };
}

function paintLettering(ctx, plan) {
  const { width: W, height: H } = plan;
  const unit = Math.min(W, H);
  ctx.save();
  // Scrim so the lettering holds against any photo dealt beneath it.
  const scrim = ctx.createLinearGradient(0, 0, 0, H * 0.34);
  scrim.addColorStop(0, 'rgba(12,3,28,0.62)');
  scrim.addColorStop(1, 'rgba(12,3,28,0)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, H * 0.34);
  ctx.textAlign = 'center';

  let cursor = H * 0.045;
  if (plan.kicker.trim()) {
    const kickerText = plan.kicker.trim().toUpperCase();
    let kpx = Math.max(15, unit * 0.026);
    const setKickerFont = () => { ctx.font = `700 ${kpx}px 'Segoe UI', system-ui, sans-serif`; };
    setKickerFont();
    try { ctx.letterSpacing = `${Math.round(kpx * 0.55)}px`; } catch { /* older engines */ }
    // A long kicker shrinks until it fits the poster's width, spacing and all.
    while (kpx > 9 && ctx.measureText(kickerText).width > W * 0.94) {
      kpx *= 0.92;
      setKickerFont();
    }
    ctx.fillStyle = '#ffb347';
    ctx.shadowColor = 'rgba(232,68,124,0.9)';
    ctx.shadowBlur = kpx * 0.6;
    cursor += kpx;
    ctx.fillText(kickerText, W / 2, cursor);
    ctx.shadowBlur = 0;
    try { ctx.letterSpacing = '0px'; } catch { /* older engines */ }
    cursor += kpx * 0.9;
  }

  const title = plan.title.trim().toUpperCase();
  if (title) {
    const { lines, px } = wrapTitle(ctx, title, W * 0.93, unit * 0.155);
    ctx.font = TITLE_FONT(px);
    const lineHeight = px * 1.04;
    lines.forEach((line, i) => {
      const y = cursor + px + i * lineHeight;
      // Hard neon doubles first, then the ink keyline, then the hot fill.
      ctx.fillStyle = TEAL_ACCENT;
      ctx.fillText(line, W / 2 + px * 0.045, y + px * 0.035);
      ctx.fillStyle = '#e8447c';
      ctx.fillText(line, W / 2 - px * 0.045, y - px * 0.03);
      ctx.lineWidth = px * 0.16;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = INK;
      ctx.strokeText(line, W / 2, y);
      const fill = ctx.createLinearGradient(0, y - px, 0, y);
      fill.addColorStop(0, '#ffffff');
      fill.addColorStop(0.55, '#ffe9a8');
      fill.addColorStop(1, '#ffb347');
      ctx.fillStyle = fill;
      ctx.fillText(line, W / 2, y);
    });
    cursor += lines.length * lineHeight;
  }
  ctx.restore();
  return cursor;
}

function paintBadge(ctx, plan) {
  const { width: W, height: H } = plan;
  const unit = Math.min(W, H);
  const r = unit * 0.052;
  const cx = W - r - unit * 0.035;
  const cy = H - r - unit * 0.035;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = '#e8447c';
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = r * 0.14;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.strokeRect(-r, -r, r * 2, r * 2);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = PAPER;
  ctx.font = `900 ${Math.round(r * 0.78)}px 'Arial Black', system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NF', 0, r * 0.05);
  ctx.restore();
}

let grainCache = { key: '', tile: null };
function paintGrainAndVignette(ctx, plan) {
  const { width: W, height: H } = plan;
  if (grainCache.key !== plan.seed) {
    const rand = seededRandom(`${plan.seed}:grain`);
    const tile = document.createElement('canvas');
    tile.width = 160; tile.height = 160;
    const tctx = tile.getContext('2d');
    const img = tctx.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(rand() * 256);
      img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 13;
    }
    tctx.putImageData(img, 0, 0);
    grainCache = { key: plan.seed, tile };
  }
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = ctx.createPattern(grainCache.tile, 'repeat');
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  const vg = ctx.createRadialGradient(W / 2, H * 0.46, Math.min(W, H) * 0.4, W / 2, H * 0.52, Math.max(W, H) * 0.8);
  vg.addColorStop(0, 'rgba(12,3,28,0)');
  vg.addColorStop(1, 'rgba(12,3,28,0.4)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

// Paints the whole poster described by `plan`; `photos` is the array the
// plan's photoIndex values point into (images or canvases).
export function paintPoster(ctx, plan, photos) {
  const { width: W, height: H } = plan;
  // Backdrop: the sunset itself, for whatever the panels leave uncovered.
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#2a0a52');
  sky.addColorStop(0.45, '#8e2a7d');
  sky.addColorStop(0.75, '#ff7a3d');
  sky.addColorStop(1, '#3d1160');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  const sun = ctx.createRadialGradient(W * 0.5, H * 0.72, 0, W * 0.5, H * 0.72, Math.max(W, H) * 0.55);
  sun.addColorStop(0, 'rgba(255,233,168,0.75)');
  sun.addColorStop(0.25, 'rgba(255,179,71,0.35)');
  sun.addColorStop(1, 'rgba(255,179,71,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H);

  for (const panel of plan.panels) {
    const geom = panelPath(ctx, panel.shape, W, H);
    paintPhotoPanel(ctx, panel, geom, photos[panel.photoIndex], W, H);
  }

  // Paper keylines on every panel edge, then the poster's own ink frame.
  const seam = Math.max(3, Math.round(Math.min(W, H) * 0.0075));
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = seam;
  for (const panel of plan.panels) {
    panelPath(ctx, panel.shape, W, H);
    ctx.stroke();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = seam * 2.6;
  ctx.strokeRect(0, 0, W, H);
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = Math.max(2, seam * 0.5);
  ctx.strokeRect(seam * 1.3, seam * 1.3, W - seam * 2.6, H - seam * 2.6);

  if (plan.skyline) paintSkyline(ctx, plan);
  paintLettering(ctx, plan);
  paintBadge(ctx, plan);

  // The audit strip: the plan's own facts, lettered along the foot.
  ctx.save();
  ctx.font = `600 ${Math.max(13, Math.min(W, H) * 0.02)}px 'Segoe UI', system-ui, sans-serif`;
  try { ctx.letterSpacing = '2px'; } catch { /* older engines */ }
  ctx.fillStyle = 'rgba(255,247,234,0.85)';
  ctx.textAlign = 'left';
  ctx.fillText(`NEON FRAME · ${plan.layoutTitle.toUpperCase()} · SEED ${plan.seed} · ${W}×${H}`, W * 0.03, H - Math.min(W, H) * 0.028);
  ctx.restore();

  paintGrainAndVignette(ctx, plan);
}

// ---------------------------------------------------------------- outline

function shapeText(panel, W, H) {
  const s = panel.shape;
  if (s.kind === 'rect') {
    const x = Math.round(s.x * W), y = Math.round(s.y * H);
    const w = Math.round(s.w * W), h = Math.round(s.h * H);
    return `rect ${x},${y} ${w}×${h}${s.tilt ? ` tilt ${s.tilt}°` : ''}`;
  }
  const pts = s.points.map(([fx, fy]) => `${Math.round(fx * W)},${Math.round(fy * H)}`).join(' ');
  return `poly ${pts}`;
}

// The plan as text — generated from the very object paintPoster consumes.
export function outlineOf(plan) {
  const lines = [
    `Neon Frame poster · ${plan.width}×${plan.height} (${plan.sizeKey})`,
    `layout   ${plan.layoutTitle} (${plan.layoutId}) · seed ${plan.seed}`,
    `palette  ${plan.palette.join(' ')} + accent ${plan.accent}`,
    `title    "${plan.title}" · kicker "${plan.kicker}"`,
    `panels   ${plan.panels.length}:`,
  ];
  plan.panels.forEach((p) => {
    lines.push(
      `  P${p.index + 1}${p.hero ? ' HERO' : ''} photo #${p.photoIndex + 1} zoom ${p.zoom.toFixed(2)} ` +
      `focus ${Math.round(p.focusX * 100)}%/${Math.round(p.focusY * 100)}% · ${shapeText(p, plan.width, plan.height)}`,
    );
  });
  lines.push(`exports  ${POSTER_SIZES.map((s) => `${s.w}×${s.h}`).join(' · ')}`);
  if (plan.skyline) lines.push('art      skyline silhouette with seeded lit windows and palms');
  return lines.join('\n');
}
