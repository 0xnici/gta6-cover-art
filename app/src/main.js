// main.js — Neon Frame's editor.
//
// One settings object and one photo list are the whole state. Every paint
// starts by asking the engine for a fresh plan from those settings, then
// lays the user's per-panel framing edits over it, so the preview, the
// poster view, the sizes sheet and the PNG exports are all paintings of
// the same plan — and the outline printed in the sidebar is generated
// from that plan, never written by hand.

import {
  LAYOUT_CATALOG, POSTER_SIZES, layoutById, makePlan, outlineOf,
  paintPoster, planAtSize, sizeByKey,
} from './engine.js';
import { runShot } from './shots.js';

const $ = (id) => document.getElementById(id);

const settings = {
  title: 'Neon Harbor',
  kicker: 'Vice City Nights',
  layoutId: 'hero-grid',
  seed: '19',
  sizeKey: 'portrait',
};

const photos = []; // { img, name } in the order they were added
const edits = new Map(); // panel index -> { photoIndex?, zoom?, focusX?, focusY? }
let selectedPanel = 0;

const stageCanvas = $('stageCanvas');
const posterCanvas = $('posterCanvas');

// ------------------------------------------------------------ plan & paint

export function currentPlan() {
  const plan = makePlan({
    title: settings.title,
    kicker: settings.kicker,
    layoutId: settings.layoutId,
    seed: settings.seed,
    sizeKey: settings.sizeKey,
    photoTotal: photos.length,
  });
  for (const [index, edit] of edits) {
    if (plan.panels[index]) Object.assign(plan.panels[index], edit);
  }
  return plan;
}

function paintCanvas(canvas, plan) {
  if (canvas.width !== plan.width || canvas.height !== plan.height) {
    canvas.width = plan.width;
    canvas.height = plan.height;
  }
  paintPoster(canvas.getContext('2d'), plan, photos.map((p) => p.img));
}

export function paintAll() {
  const plan = currentPlan();
  paintCanvas(stageCanvas, plan);
  paintCanvas(posterCanvas, plan);
  $('outlinePre').textContent = outlineOf(plan);
  window.__currentPlan = plan;
}

export function paintSizesSheet() {
  const base = currentPlan();
  const targets = [
    ['sheetSquare', 'square'],
    ['sheetPortrait', 'portrait'],
    ['sheetLandscape', 'landscape'],
  ];
  for (const [id, key] of targets) {
    const canvas = $(id);
    const sized = planAtSize(base, key);
    // The sheet is a drawing of the export, at sheet resolution: same
    // panels and fractions, smaller canvas.
    paintPoster(canvas.getContext('2d'), { ...sized, width: canvas.width, height: canvas.height }, photos.map((p) => p.img));
  }
}

// ------------------------------------------------------------------ photos

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

export async function addPhoto(img, name) {
  photos.push({ img, name });
  renderPhotoStrip();
  rebuildPanelControls();
  paintAll();
}

export async function loadSample(stem) {
  if (photos.some((p) => p.name === stem)) return;
  const img = await loadImage(`samples/${stem}.jpg`);
  await addPhoto(img, stem);
}

async function addFiles(fileList) {
  for (const file of fileList) {
    if (!file.type.startsWith('image/')) continue;
    const url = URL.createObjectURL(file);
    const img = await loadImage(url);
    await addPhoto(img, file.name.replace(/\.[^.]+$/, ''));
  }
}

// --------------------------------------------------------------- controls

function pickButtons(box, items, current, onPick) {
  box.innerHTML = '';
  for (const item of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick' + (item.id === current ? ' active' : '');
    b.textContent = item.label;
    b.addEventListener('click', () => onPick(item.id));
    box.appendChild(b);
  }
}

function renderPhotoStrip() {
  const strip = $('photoStrip');
  strip.innerHTML = '';
  photos.forEach((photo, i) => {
    const chip = document.createElement('span');
    chip.className = 'photochip';
    const thumb = document.createElement('img');
    thumb.src = photo.img.src;
    thumb.alt = '';
    const label = document.createElement('span');
    label.textContent = `${i + 1} · ${photo.name}`;
    const drop = document.createElement('button');
    drop.type = 'button';
    drop.textContent = '×';
    drop.title = `Remove ${photo.name}`;
    drop.addEventListener('click', () => {
      photos.splice(i, 1);
      for (const [index, edit] of edits) {
        if (edit.photoIndex !== undefined && edit.photoIndex >= photos.length) {
          edits.set(index, { ...edit, photoIndex: 0 });
        }
      }
      renderPhotoStrip();
      rebuildPanelControls();
      paintAll();
    });
    chip.append(thumb, label, drop);
    strip.appendChild(chip);
  });
}

function rebuildPanelControls() {
  const plan = currentPlan();
  if (selectedPanel >= plan.panels.length) selectedPanel = 0;
  const list = $('panelList');
  list.innerHTML = '';
  plan.panels.forEach((panel, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick' + (i === selectedPanel ? ' active' : '');
    const photoName = photos[panel.photoIndex]?.name ?? 'art';
    b.textContent = `P${i + 1}${panel.hero ? ' ★' : ''} · ${photoName}`;
    b.addEventListener('click', () => selectPanel(i));
    list.appendChild(b);
  });
  const select = $('panelPhotoSelect');
  select.innerHTML = '';
  photos.forEach((photo, i) => {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = `${i + 1} · ${photo.name}`;
    select.appendChild(option);
  });
  syncTuneInputs();
}

function syncTuneInputs() {
  const panel = currentPlan().panels[selectedPanel];
  if (!panel) return;
  $('panelPhotoSelect').value = String(panel.photoIndex);
  $('zoomRange').value = String(panel.zoom);
  $('focusXRange').value = String(panel.focusX);
  $('focusYRange').value = String(panel.focusY);
}

export function selectPanel(index) {
  selectedPanel = index;
  rebuildPanelControls();
}

// Merge framing values into one panel's edit (used by the editor's tune
// controls and by the screenshot scenes).
export function setPanelEdit(index, edit) {
  edits.set(index, { ...edits.get(index), ...edit });
}

function tune(key, value) {
  const panel = currentPlan().panels[selectedPanel];
  edits.set(selectedPanel, {
    photoIndex: panel.photoIndex, zoom: panel.zoom,
    focusX: panel.focusX, focusY: panel.focusY,
    [key]: value,
  });
  paintAll();
  rebuildPanelControls();
}

// ----------------------------------------------------------------- export

window.__lastExports = {};

export async function exportPng(sizeKey, { download = true } = {}) {
  const size = sizeByKey(sizeKey);
  const plan = planAtSize(currentPlan(), sizeKey);
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  paintPoster(canvas.getContext('2d'), plan, photos.map((p) => p.img));
  if (canvas.width !== size.w || canvas.height !== size.h) {
    throw new Error(`render size drifted: ${canvas.width}×${canvas.height}, expected ${size.w}×${size.h}`);
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed');
  // Count the pixels of the encoded file itself, not just the canvas.
  const bitmap = await createImageBitmap(blob);
  const verified = { w: bitmap.width, h: bitmap.height, bytes: blob.size };
  bitmap.close();
  if (verified.w !== size.w || verified.h !== size.h) {
    throw new Error(`encoded PNG is ${verified.w}×${verified.h}, expected ${size.w}×${size.h}`);
  }
  window.__lastExports[sizeKey] = verified;
  if (download) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `neon-frame-${size.w}x${size.h}.png`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 5000);
    $('exportLog').textContent =
      `Exported neon-frame-${size.w}x${size.h}.png — ${verified.w} × ${verified.h} px verified from the encoded file, ${(verified.bytes / 1024).toFixed(0)} KiB.`;
  }
  return verified;
}

// ------------------------------------------------------------------ views

export function setView(name) {
  document.body.dataset.view = name;
  for (const view of ['editor', 'poster', 'sizes']) {
    $(`view-${view}`).hidden = view !== name;
  }
  document.querySelectorAll('[data-view-tab]').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.viewTab === name);
  });
  if (name === 'sizes') paintSizesSheet();
  if (name === 'poster') paintAll();
}

// ------------------------------------------------------------------- wire

let paintQueued = false;
function queuePaint() {
  if (paintQueued) return;
  paintQueued = true;
  requestAnimationFrame(() => { paintQueued = false; paintAll(); });
}

function wire() {
  document.querySelectorAll('[data-view-tab]').forEach((tab) => {
    tab.addEventListener('click', () => setView(tab.dataset.viewTab));
  });
  $('fileInput').addEventListener('change', (e) => { void addFiles([...e.target.files]); });
  $('sampleBoulevard').addEventListener('click', () => { void loadSample('boulevard'); });
  $('samplePier').addEventListener('click', () => { void loadSample('pier'); });
  $('titleInput').addEventListener('input', (e) => { settings.title = e.target.value; queuePaint(); });
  $('kickerInput').addEventListener('input', (e) => { settings.kicker = e.target.value; queuePaint(); });
  $('seedInput').addEventListener('input', (e) => { settings.seed = e.target.value || '0'; queuePaint(); });
  $('diceButton').addEventListener('click', () => {
    settings.seed = String(1000 + Math.floor(Math.random() * 98999));
    $('seedInput').value = settings.seed;
    paintAll();
  });
  wirePickers();
  $('panelPhotoSelect').addEventListener('change', (e) => tune('photoIndex', Number(e.target.value)));
  $('zoomRange').addEventListener('input', (e) => tune('zoom', Number(e.target.value)));
  $('focusXRange').addEventListener('input', (e) => tune('focusX', Number(e.target.value)));
  $('focusYRange').addEventListener('input', (e) => tune('focusY', Number(e.target.value)));
  document.querySelectorAll('[data-export]').forEach((button) => {
    button.addEventListener('click', () => {
      exportPng(button.dataset.export).catch((err) => {
        $('exportLog').textContent = `Export failed: ${err.message}`;
      });
    });
  });
  const zone = $('dropZone');
  for (const event of ['dragenter', 'dragover']) {
    zone.addEventListener(event, (e) => { e.preventDefault(); zone.classList.add('dragging'); });
  }
  for (const event of ['dragleave', 'drop']) {
    zone.addEventListener(event, (e) => { e.preventDefault(); zone.classList.remove('dragging'); });
  }
  zone.addEventListener('drop', (e) => { void addFiles([...e.dataTransfer.files]); });
}

// The layout/size pickers re-render to move the active marker.
function wirePickers() {
  pickButtons($('layoutButtons'),
    LAYOUT_CATALOG.map((l) => ({ id: l.id, label: l.title })),
    settings.layoutId,
    (id) => {
      settings.layoutId = id;
      selectedPanel = 0;
      wirePickers();
      rebuildPanelControls();
      paintAll();
    });
  pickButtons($('sizeButtons'),
    POSTER_SIZES.map((s) => ({ id: s.key, label: `${s.label} ${s.w}×${s.h}` })),
    settings.sizeKey,
    (key) => { settings.sizeKey = key; wirePickers(); paintAll(); });
}

// ------------------------------------------------------------------- boot

async function boot() {
  wire();
  const params = new URLSearchParams(location.search);
  if (params.get('shot')) {
    await runShot(params, {
      settings, loadSample, selectPanel, setPanelEdit, paintAll, paintSizesSheet, exportPng, setView,
    });
    return;
  }
  await loadSample('boulevard');
  await loadSample('pier');
  rebuildPanelControls();
  paintAll();
}

void boot();
