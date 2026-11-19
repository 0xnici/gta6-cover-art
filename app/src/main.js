// Vice City Cover Maker — editor wiring.
//
// Owns the interactive state (photos, panel assignments and edits, the
// chosen layout/grade/seed/words), renders the preview through the
// deterministic engine, keeps the source-outline panel in sync with the
// exact state that was rendered, and handles full-size PNG exports and
// the localStorage gallery.

import {
  EXPORT_SIZES,
  GRADE_NAMES,
  LAYOUTS,
  LAYOUT_NAMES,
  PALETTES,
  buildOutline,
  renderPoster,
} from './engine.js';

const $ = (id) => document.getElementById(id);

const els = {
  photoInput: $('photo-input'),
  photoList: $('photo-list'),
  layout: $('layout-select'),
  grade: $('grade-select'),
  seed: $('seed-input'),
  heat: $('heat-input'),
  heatOut: $('heat-out'),
  caption: $('caption-input'),
  subtitle: $('subtitle-input'),
  panel: $('panel-select'),
  panelPhoto: $('panel-photo-select'),
  zoom: $('zoom-input'),
  zoomOut: $('zoom-out'),
  ox: $('ox-input'),
  oxOut: $('ox-out'),
  oy: $('oy-input'),
  oyOut: $('oy-out'),
  panelReset: $('panel-reset'),
  compare: $('compare-input'),
  compareOut: $('compare-out'),
  preview: $('preview'),
  outline: $('outline-pre'),
  outlineDetails: $('outline-details'),
  exportStatus: $('export-status'),
  gallery: $('gallery'),
};

const GALLERY_KEY = 'vccm-gallery-v1';
const PREVIEW_W = 720;
const PREVIEW_H = 900;

const state = {
  photos: [], // [{ img, name }]
  layout: 'hero-grid',
  grade: 'sunset',
  seed: 7,
  caption: 'Sunset Heist',
  subtitle: 'Vice Coast · Leonida',
  heat: 4,
  assignments: [], // photo index per panel
  panelEdits: [], // { zoom, ox, oy } per panel
  activePanel: 0,
  compare: 100, // percent of the graded render left visible
};

function panelCount() {
  return LAYOUTS[state.layout].panels(PREVIEW_W, PREVIEW_H).length;
}

/** Keep assignments/edits sized to the current layout, with sane defaults. */
function syncPanelArrays() {
  const n = panelCount();
  while (state.assignments.length < n) {
    const i = state.assignments.length;
    state.assignments.push(state.photos.length ? i % state.photos.length : 0);
  }
  while (state.panelEdits.length < n) state.panelEdits.push({ zoom: 1, ox: 0, oy: 0 });
  state.assignments.length = n;
  state.panelEdits.length = n;
  if (state.activePanel >= n) state.activePanel = 0;
}

function engineState() {
  syncPanelArrays();
  return {
    photos: state.photos.map((p) => p.img),
    assignments: [...state.assignments],
    panelEdits: state.panelEdits.map((e) => ({ ...e })),
    layout: state.layout,
    grade: state.grade,
    seed: state.seed,
    caption: state.caption,
    subtitle: state.subtitle,
    heat: state.heat,
    graded: true,
  };
}

/** Render into any canvas at any size; returns the engine's render info. */
function renderTo(canvas, w, h) {
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  return renderPoster(canvas, engineState());
}

function renderPreview() {
  const canvas = els.preview;
  renderTo(canvas, PREVIEW_W, PREVIEW_H);
  if (state.compare < 100) {
    // Peel the grade back: draw the ungraded poster offscreen, then lay
    // the graded render's right-hand share back over it.
    const raw = document.createElement('canvas');
    const rawState = engineState();
    rawState.graded = false;
    renderPoster(raw, rawState);
    const ctx = canvas.getContext('2d');
    const splitX = Math.round((state.compare / 100) * PREVIEW_W);
    ctx.drawImage(raw, 0, 0, splitX, PREVIEW_H, 0, 0, splitX, PREVIEW_H);
    ctx.save();
    ctx.fillStyle = '#ffd76e';
    ctx.fillRect(splitX - 1, 0, 2, PREVIEW_H);
    ctx.restore();
  }
  updateOutline();
}

function updateOutline() {
  const outline = buildOutline(engineState(), PREVIEW_W, PREVIEW_H);
  els.outline.textContent = JSON.stringify(outline, null, 2);
}

// ---------------------------------------------------------------- photos

function loadImageFromUrl(url, name) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ img, name });
    img.onerror = () => reject(new Error(`could not load ${name}`));
    img.src = url;
  });
}

async function addPhoto(url, name) {
  const photo = await loadImageFromUrl(url, name);
  state.photos.push(photo);
  refreshPhotoUi();
  renderPreview();
  return photo;
}

function addPhotoFiles(files) {
  return [...files].reduce(
    (chain, file) =>
      chain.then(() => addPhoto(URL.createObjectURL(file), file.name)),
    Promise.resolve(),
  );
}

function refreshPhotoUi() {
  els.photoList.replaceChildren(
    ...state.photos.map((p, i) => {
      const li = document.createElement('li');
      const b = document.createElement('b');
      b.textContent = `Photo ${i + 1}`;
      const span = document.createElement('span');
      const dims = p.img.naturalWidth ? ` · ${p.img.naturalWidth}×${p.img.naturalHeight}` : '';
      span.textContent = `${p.name}${dims}`;
      li.append(b, span);
      return li;
    }),
  );
  const options = state.photos.length
    ? state.photos.map((p, i) => new Option(`Photo ${i + 1} — ${p.name}`, String(i)))
    : [new Option('Sample gradient (no photo yet)', '0')];
  els.panelPhoto.replaceChildren(...options);
  els.panelPhoto.value = String(state.assignments[state.activePanel] || 0);
}

// ---------------------------------------------------------------- panels

function refreshPanelUi() {
  syncPanelArrays();
  const labels = LAYOUTS[state.layout].panels(PREVIEW_W, PREVIEW_H).map(
    (r, i) => new Option(`Panel ${i + 1} — ${r.role}`, String(i)),
  );
  els.panel.replaceChildren(...labels);
  els.panel.value = String(state.activePanel);
  const edit = state.panelEdits[state.activePanel];
  els.zoom.value = String(edit.zoom);
  els.ox.value = String(edit.ox);
  els.oy.value = String(edit.oy);
  els.zoomOut.textContent = `${edit.zoom.toFixed(2)}×`;
  els.oxOut.textContent = `${Math.round(edit.ox * 100)}%`;
  els.oyOut.textContent = `${Math.round(edit.oy * 100)}%`;
  els.panelPhoto.value = String(state.assignments[state.activePanel] || 0);
}

// ---------------------------------------------------------------- exports

function assertSize(canvas, w, h) {
  if (canvas.width !== w || canvas.height !== h) {
    throw new Error(`export canvas is ${canvas.width}x${canvas.height}, expected ${w}x${h}`);
  }
}

function saveToGallery(dataUrl, label) {
  let items = [];
  try {
    items = JSON.parse(localStorage.getItem(GALLERY_KEY) || '[]');
  } catch {
    items = [];
  }
  items.unshift({ ts: Date.now(), label, thumb: dataUrl });
  items = items.slice(0, 12);
  try {
    localStorage.setItem(GALLERY_KEY, JSON.stringify(items));
  } catch {
    // Storage full of posters is a good problem; keep the newest few.
    localStorage.setItem(GALLERY_KEY, JSON.stringify(items.slice(0, 4)));
  }
  renderGallery();
}

function renderGallery() {
  let items = [];
  try {
    items = JSON.parse(localStorage.getItem(GALLERY_KEY) || '[]');
  } catch {
    items = [];
  }
  if (!items.length) {
    els.gallery.innerHTML = '<p class="empty">Nothing exported yet — your covers will land here.</p>';
    return;
  }
  els.gallery.replaceChildren(
    ...items.map((item) => {
      const fig = document.createElement('figure');
      const img = document.createElement('img');
      img.src = item.thumb;
      img.alt = item.label;
      img.title = 'Click to view full size';
      img.addEventListener('click', () => window.open(item.thumb, '_blank'));
      const cap = document.createElement('figcaption');
      cap.textContent = item.label;
      fig.append(img, cap);
      return fig;
    }),
  );
}

async function exportPNG(sizeId) {
  const size = EXPORT_SIZES.find((s) => s.id === sizeId);
  if (!size) return;
  const canvas = document.createElement('canvas');
  renderTo(canvas, size.w, size.h);
  assertSize(canvas, size.w, size.h);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encode failed');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vice-coast-cover-${size.w}x${size.h}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  // A small thumbnail joins the on-page gallery.
  const thumb = document.createElement('canvas');
  const tw = 240;
  const th = Math.round((size.h / size.w) * tw);
  thumb.width = tw;
  thumb.height = th;
  thumb.getContext('2d').drawImage(canvas, 0, 0, tw, th);
  saveToGallery(thumb.toDataURL('image/jpeg', 0.82), `${state.caption || 'Cover'} — ${size.w}×${size.h}`);
  const kib = Math.max(1, Math.round(blob.size / 1024));
  els.exportStatus.textContent = `Saved ${a.download} (${size.w} × ${size.h}, dimensions verified, ${kib} KiB).`;
}

// ---------------------------------------------------------------- wiring

function fillSelect(select, names, labels) {
  select.replaceChildren(...names.map((n) => new Option(labels[n] || n, n)));
}

function bindControls() {
  fillSelect(els.layout, LAYOUT_NAMES, Object.fromEntries(LAYOUT_NAMES.map((n) => [n, LAYOUTS[n].label])));
  fillSelect(els.grade, GRADE_NAMES, Object.fromEntries(GRADE_NAMES.map((n) => [n, PALETTES[n].label])));
  els.layout.value = state.layout;
  els.grade.value = state.grade;

  els.photoInput.addEventListener('change', () => {
    if (els.photoInput.files.length) addPhotoFiles(els.photoInput.files);
  });
  $('sample-pier').addEventListener('click', () => addPhoto('samples/pier.jpg', 'pier.jpg (sample)'));
  $('sample-boulevard').addEventListener('click', () => addPhoto('samples/boulevard.jpg', 'boulevard.jpg (sample)'));

  els.layout.addEventListener('change', () => {
    state.layout = els.layout.value;
    state.activePanel = 0;
    refreshPanelUi();
    renderPreview();
  });
  els.grade.addEventListener('change', () => {
    state.grade = els.grade.value;
    renderPreview();
  });
  els.seed.addEventListener('change', () => {
    state.seed = Math.max(1, Math.round(Number(els.seed.value) || 7));
    els.seed.value = String(state.seed);
    renderPreview();
  });
  els.heat.addEventListener('input', () => {
    state.heat = Number(els.heat.value);
    els.heatOut.textContent = `${state.heat} ★`;
    renderPreview();
  });
  els.caption.addEventListener('input', () => {
    state.caption = els.caption.value;
    renderPreview();
  });
  els.subtitle.addEventListener('input', () => {
    state.subtitle = els.subtitle.value;
    renderPreview();
  });

  els.panel.addEventListener('change', () => {
    state.activePanel = Number(els.panel.value);
    refreshPanelUi();
  });
  els.panelPhoto.addEventListener('change', () => {
    state.assignments[state.activePanel] = Number(els.panelPhoto.value);
    renderPreview();
  });
  const bindEdit = (input, out, key, fmt) => {
    input.addEventListener('input', () => {
      const edit = state.panelEdits[state.activePanel];
      edit[key] = Number(input.value);
      out.textContent = fmt(edit[key]);
      renderPreview();
    });
  };
  bindEdit(els.zoom, els.zoomOut, 'zoom', (v) => `${v.toFixed(2)}×`);
  bindEdit(els.ox, els.oxOut, 'ox', (v) => `${Math.round(v * 100)}%`);
  bindEdit(els.oy, els.oyOut, 'oy', (v) => `${Math.round(v * 100)}%`);
  els.panelReset.addEventListener('click', () => {
    state.panelEdits[state.activePanel] = { zoom: 1, ox: 0, oy: 0 };
    refreshPanelUi();
    renderPreview();
  });

  els.compare.addEventListener('input', () => {
    state.compare = Number(els.compare.value);
    els.compareOut.textContent = `${state.compare}%`;
    renderPreview();
  });

  document.querySelectorAll('[data-export]').forEach((btn) => {
    btn.addEventListener('click', () => {
      exportPNG(btn.dataset.export).catch((err) => {
        els.exportStatus.textContent = `Export failed: ${err.message}`;
      });
    });
  });
}

// ---------------------------------------------------------------- editor API (used by shots.js)

const editor = {
  state,
  els,
  addPhoto,
  renderTo,
  renderPreview,
  refreshPanelUi,
  refreshPhotoUi,
  setLayout(name) {
    state.layout = name;
    els.layout.value = name;
    state.activePanel = 0;
    refreshPanelUi();
  },
  setGrade(name) {
    state.grade = name;
    els.grade.value = name;
  },
  setWords(caption, subtitle) {
    state.caption = caption;
    state.subtitle = subtitle;
    els.caption.value = caption;
    els.subtitle.value = subtitle;
  },
  setAssignments(list) {
    state.assignments = [...list];
  },
  setPanelEdits(list) {
    state.panelEdits = list.map((e) => ({ zoom: 1, ox: 0, oy: 0, ...e }));
  },
  openOutline() {
    els.outlineDetails.open = true;
  },
};

window.__editor = editor;

async function init() {
  bindControls();
  refreshPhotoUi();
  refreshPanelUi();
  renderGallery();
  renderPreview();
  const params = new URLSearchParams(location.search);
  if (params.has('shot')) {
    const { runShot } = await import('./shots.js');
    await runShot(editor, params);
  }
}

init();
