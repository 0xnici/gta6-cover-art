// shots.js — the fixed scenes tools/capture.mjs photographs.
//
// A ?shot=<name> URL rebuilds one exact poster from the bundled samples,
// paints it, and raises window.__shotReady only once the frame is final,
// so every capture of a scene is the same image. The four scenes are the
// entry's screenshots: an exported cover full-frame, the editor at work,
// the poster view, and the sizes sheet with the export dimensions proven.

function setField(id, value) {
  const el = document.getElementById(id);
  if (el && value !== undefined) el.value = value;
}

async function settle() {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

export async function runShot(params, api) {
  const { settings } = api;
  const shot = params.get('shot');

  // Settings every scene shares, each overridable from the query string.
  settings.title = params.get('caption') ?? settings.title;
  settings.kicker = params.get('sub') ?? settings.kicker;
  settings.layoutId = params.get('layout') ?? settings.layoutId;
  settings.seed = params.get('seed') ?? settings.seed;
  settings.sizeKey = params.get('size') ?? settings.sizeKey;
  setField('titleInput', settings.title);
  setField('kickerInput', settings.kicker);
  setField('seedInput', settings.seed);

  if (shot === 'cover') {
    document.body.classList.add('shot-cover');
    await api.loadSample(params.get('photo') ?? 'pier');
    // The hero panel's subject is the street at the photo's foot, not the
    // sky: deal the hero and the wide bottom panel a low focal point.
    api.setPanelEdit(0, { focusY: 0.82, zoom: 1.04 });
    api.setPanelEdit(4, { focusY: 0.85 });
    api.setView('editor');
    api.paintAll();
  } else if (shot === 'editor') {
    await api.loadSample(params.get('photo') ?? 'boulevard');
    await api.loadSample('pier');
    api.setView('editor');
    api.selectPanel(1);
    api.paintAll();
  } else if (shot === 'poster') {
    document.body.classList.add('shot-poster');
    await api.loadSample(params.get('photo') ?? 'boulevard');
    api.setView('poster');
    api.paintAll();
  } else if (shot === 'exports') {
    document.body.classList.add('shot-exports');
    await api.loadSample(params.get('photo') ?? 'pier');
    if (params.get('photo2')) await api.loadSample(params.get('photo2'));
    api.setView('sizes');
    api.paintSizesSheet();
    // Prove the real exports, encoded bytes and all, at their true sizes.
    const dims = [];
    for (const key of ['square', 'portrait', 'landscape']) {
      const verified = await api.exportPng(key, { download: false });
      dims.push([verified.w, verified.h]);
    }
    window.__exportDims = dims;
  } else {
    await api.loadSample('boulevard');
    api.paintAll();
  }

  await settle();
  window.__shotReady = true;
  window.__shotName = shot;
}
