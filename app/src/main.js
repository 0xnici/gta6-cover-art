// main.js — the editor: photos in, panels tuned, covers out.
// All state lives in one object; every control mutates it and calls draw(),
// which re-renders the preview, the before/after layer and the live source
// outline from that same state.

import {
  EXPORT_SIZES, GRADES, GRADE_IDS, LAYOUTS, LAYOUT_IDS,
  panelRectsPx, renderCover,
} from './engine.js';
import { applyShotScene } from './shots.js';

const $ = (id) => document.getElementById(id);

export const state = {
  layout: 'heroGrid',
  grade: 'sunset',
  caption: 'Neon Shore',
  subtitle: 'vice city nights',
  heat: 5,
  seed: 7,
  photos: [],        // { img, name } — img is an HTMLImageElement
  assignments: [],   // panel index -> photo index
  tunes: [],         // panel index -> { zoom, ox, oy }
  activePanel: 0,
};

const preview = $('previewCanvas');
const originalLayer = $('originalCanvas');
let drawQueued = false;

function ensurePanelSlots() {
  const count = LAYOUTS[state.layout].panels(1, 1).length;
  while (state.assignments.length < count) {
    state.assignments.push(state.assignments.length % Math.max(1, state.photos.length));
  }
  while (state.tunes.length < count) state.tunes.push({ zoom: 1, ox: 0, oy: 0 });
  state.assignments.length = count;
  state.tunes.length = count;
  if (state.activePanel >= count) state.activePanel = 0;
}

export function draw() {
  ensurePanelSlots();
  const W = preview.width;
  const H = preview.height;
  renderCover(preview.getContext('2d'), W, H, state);
  drawOriginalLayer();
  renderPanelList();
  renderOutline();
}

function queueDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; draw(); });
}

// The before/after layer paints the raw photos in the same panels with no
// grade at all; the slider clips how much of it covers the finished poster.
function drawOriginalLayer() {
  const ctx = originalLayer.getContext('2d');
  const W = originalLayer.width;
  const H = originalLayer.height;
  ctx.clearRect(0, 0, W, H);
  const frac = LAYOUTS[state.layout].panels(W, H);
  frac.forEach((p, i) => {
    const entry = state.photos[state.assignments[i]] ?? state.photos[0];
    const img = entry?.img ?? entry;
    if (!img) return;
    const tune = state.tunes[i];
    const w = p.w * W, h = p.h * H;
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight) * tune.zoom;
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    ctx.save();
    ctx.beginPath(); ctx.rect(p.x * W, p.y * H, w, h); ctx.clip();
    ctx.drawImage(img, p.x * W + (w - dw) / 2 + tune.ox * w * 0.35, p.y * H + (h - dh) / 2 + tune.oy * h * 0.35, dw, dh);
    ctx.restore();
  });
  applyBaClip();
}

function applyBaClip() {
  const v = Number($('baSlider').value);
  // v is "% cover": at 100 the graded poster covers everything and the raw
  // photo layer is clipped away entirely; at 0 the photos show untouched.
  originalLayer.style.clipPath = `inset(0 ${v}% 0 0)`;
  $('baLabel').textContent = v === 100 ? 'Cover' : v === 0 ? 'Photo' : `${v}% cover`;
}

// ---- controls ------------------------------------------------------------

function buildChips(boxId, ids, labels, current, onPick) {
  const box = $(boxId);
  box.innerHTML = '';
  ids.forEach((id) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (id === current ? ' active' : '');
    b.innerHTML = labels(id);
    b.addEventListener('click', () => onPick(id));
    box.appendChild(b);
  });
}

function refreshChips() {
  buildChips('layoutChips', LAYOUT_IDS, (id) => LAYOUTS[id].label, state.layout, (id) => {
    state.layout = id; state.activePanel = 0; refreshChips(); draw();
  });
  buildChips('gradeChips', GRADE_IDS, (id) => {
    const g = GRADES[id];
    const strip = `linear-gradient(90deg, ${g.stops.join(',')})`;
    return `<span class="swatch" style="background:${strip}"></span>${g.label}`;
  }, state.grade, (id) => { state.grade = id; refreshChips(); draw(); });
}

function renderPanelList() {
  const list = $('panelList');
  list.innerHTML = '';
  const count = LAYOUTS[state.layout].panels(1, 1).length;
  for (let i = 0; i < count; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip panel-chip' + (i === state.activePanel ? ' active' : '');
    const photoName = state.photos[state.assignments[i]]?.name ?? '—';
    b.textContent = `Panel ${i + 1} · ${photoName}`;
    b.addEventListener('click', () => { state.activePanel = i; syncTuneControls(); draw(); });
    list.appendChild(b);
  }
  const sel = $('panelPhotoSelect');
  sel.innerHTML = '';
  state.photos.forEach((p, i) => {
    const o = document.createElement('option');
    o.value = String(i); o.textContent = p.name;
    sel.appendChild(o);
  });
  sel.value = String(state.assignments[state.activePanel] ?? 0);
}

function syncTuneControls() {
  const t = state.tunes[state.activePanel] ?? { zoom: 1, ox: 0, oy: 0 };
  $('zoomInput').value = String(t.zoom);
  $('panXInput').value = String(t.ox);
  $('panYInput').value = String(t.oy);
  $('panelPhotoSelect').value = String(state.assignments[state.activePanel] ?? 0);
}

function renderOutline() {
  const grade = GRADES[state.grade];
  const lines = [];
  lines.push(`layout   ${LAYOUTS[state.layout].label} (${state.layout})`);
  lines.push(`grade    ${grade.label} (${state.grade})`);
  lines.push(`palette  ${grade.stops.join(' ')}`);
  lines.push(`caption  "${state.caption}" / "${state.subtitle}"`);
  lines.push(`heat     ${state.heat} stars · grain seed ${state.seed}`);
  lines.push('panels   @1080×1080:');
  panelRectsPx(state.layout, 1080, 1080).forEach((r, i) => {
    const photoName = state.photos[state.assignments[i]]?.name ?? 'gradient';
    const t = state.tunes[i];
    lines.push(`  #${i + 1} x${r.x} y${r.y} ${r.w}×${r.h}${r.hero ? ' HERO' : ''} photo=${photoName} zoom=${t.zoom.toFixed(2)} pan=${t.ox.toFixed(2)},${t.oy.toFixed(2)}`);
  });
  lines.push(`exports  ${EXPORT_SIZES.map((s) => `${s.w}×${s.h}`).join(' · ')}`);
  $('outlineBox').textContent = lines.join('\n');
}

// ---- photos ---------------------------------------------------------------

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function addPhotoSource(src, name) {
  const img = await loadImage(src);
  state.photos.push({ img, name });
  ensurePanelSlots();
  draw();
  return img;
}

async function addFiles(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const url = URL.createObjectURL(file);
    await addPhotoSource(url, file.name.replace(/\.[^.]+$/, ''));
  }
  syncTuneControls();
}

// ---- export ----------------------------------------------------------------

const GALLERY_KEY = 'vc-cover-gallery-v1';

function saveToGallery(dataUrl, label) {
  let items = [];
  try { items = JSON.parse(localStorage.getItem(GALLERY_KEY) || '[]'); } catch { items = []; }
  items.unshift({ dataUrl, label, at: Date.now() });
  items = items.slice(0, 6);
  try { localStorage.setItem(GALLERY_KEY, JSON.stringify(items)); } catch { /* quota: gallery is a nicety */ }
  renderGallery(items);
}

function renderGallery(items) {
  if (!items) {
    try { items = JSON.parse(localStorage.getItem(GALLERY_KEY) || '[]'); } catch { items = []; }
  }
  const box = $('galleryBox');
  box.innerHTML = '';
  if (!items.length) {
    box.innerHTML = '<span class="empty">Nothing exported yet — your covers land here.</span>';
    return;
  }
  items.forEach((it) => {
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    img.src = it.dataUrl; img.alt = it.label;
    const cap = document.createElement('figcaption');
    cap.textContent = it.label;
    fig.append(img, cap);
    box.appendChild(fig);
  });
}

export async function exportCover(sizeId) {
  const size = EXPORT_SIZES.find((s) => s.id === sizeId);
  if (!size) throw new Error(`unknown size ${sizeId}`);
  const off = document.createElement('canvas');
  off.width = size.w; off.height = size.h;
  renderCover(off.getContext('2d'), size.w, size.h, state);
  if (off.width !== size.w || off.height !== size.h) {
    throw new Error(`export size mismatch: got ${off.width}×${off.height}, wanted ${size.w}×${size.h}`);
  }
  const blob = await new Promise((res) => off.toBlob(res, 'image/png'));
  if (!blob) throw new Error('PNG encode failed');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `vice-cover-${size.w}x${size.h}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);

  const thumb = document.createElement('canvas');
  const tw = 216, th = Math.round(216 * size.h / size.w);
  thumb.width = tw; thumb.height = th;
  thumb.getContext('2d').drawImage(off, 0, 0, tw, th);
  saveToGallery(thumb.toDataURL('image/jpeg', 0.82), `${size.w}×${size.h}`);
  $('exportNote').textContent = `Exported ${size.w} × ${size.h} PNG (${(blob.size / 1024).toFixed(0)} KiB) — size asserted before download.`;
  return { w: size.w, h: size.h, bytes: blob.size };
}

// ---- wiring ------------------------------------------------------------------

function wire() {
  $('captionInput').addEventListener('input', (e) => { state.caption = e.target.value; queueDraw(); });
  $('subtitleInput').addEventListener('input', (e) => { state.subtitle = e.target.value; queueDraw(); });
  $('heatInput').addEventListener('input', (e) => {
    state.heat = Number(e.target.value);
    $('heatLabel').textContent = `${state.heat} star${state.heat === 1 ? '' : 's'}`;
    queueDraw();
  });
  $('baSlider').addEventListener('input', applyBaClip);
  $('photoInput').addEventListener('change', (e) => addFiles([...e.target.files]));
  $('shuffleSeedBtn').addEventListener('click', () => { state.seed = (state.seed * 31 + 17) % 100000; queueDraw(); });
  $('panelPhotoSelect').addEventListener('change', (e) => {
    state.assignments[state.activePanel] = Number(e.target.value); draw();
  });
  const tune = (key) => (e) => {
    state.tunes[state.activePanel][key] = Number(e.target.value); queueDraw();
  };
  $('zoomInput').addEventListener('input', tune('zoom'));
  $('panXInput').addEventListener('input', tune('ox'));
  $('panYInput').addEventListener('input', tune('oy'));
  document.querySelectorAll('.export-btn').forEach((b) => {
    b.addEventListener('click', () => exportCover(b.dataset.size).catch((err) => {
      $('exportNote').textContent = `Export failed: ${err.message}`;
    }));
  });
  const zone = $('dropZone');
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('dragging'); }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('dragging'); }));
  zone.addEventListener('drop', (e) => addFiles([...e.dataTransfer.files]));
}

async function boot() {
  wire();
  refreshChips();
  renderGallery();
  const params = new URLSearchParams(location.search);
  const shotMode = params.get('shot');
  if (shotMode) {
    await applyShotScene(state, params, { draw, exportCover, addPhotoSource });
  } else {
    await addPhotoSource('samples/boulevard.jpg', 'boulevard');
    await addPhotoSource('samples/pier.jpg', 'pier');
    state.assignments = [0, 1, 0, 1, 0, 1, 0, 1, 0];
    draw();
  }
  renderGallery();
  refreshChips();
  syncTuneControls();
}

boot();
