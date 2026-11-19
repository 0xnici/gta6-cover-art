// Shot scenes for screenshots: ?shot=<name> arranges a fixed, honest
// scene through the same editor controls a person would use, renders it,
// and flags window.__shotReady once two animation frames have painted.
//
// Scenes (see shots.json at the repo root):
//   cover   — the finished portrait poster, full-bleed
//   editor  — the whole editor with a sample photo loaded
//   poster  — a second finished cover, square, different layout + words
//   exports — the editor focused on the export bar, outline open

function painted() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

async function loadSamples(editor, names) {
  for (const name of names) {
    await editor.addPhoto(`samples/${name}.jpg`, `${name}.jpg (sample)`);
  }
}

/** Scenes set seed/heat on the state directly; mirror them into the
 * dial fields so a screenshot never shows a control disagreeing with
 * the poster it sits beside. */
function syncDialFields(editor) {
  editor.els.seed.value = String(editor.state.seed);
  editor.els.heat.value = String(editor.state.heat);
  editor.els.heatOut.textContent = `${editor.state.heat} ★`;
}

const scenes = {
  async cover(editor) {
    document.body.classList.add('shot-cover');
    await loadSamples(editor, ['pier', 'boulevard']);
    editor.setLayout('hero-grid');
    editor.setGrade('sunset');
    editor.setWords('SUNSET HEIST', 'Vice Coast · Leonida');
    editor.setAssignments([0, 1, 0, 1]);
    editor.setPanelEdits([
      { zoom: 1.05 },
      { zoom: 1.2, oy: -0.1 },
      { zoom: 1.15, ox: 0.08 },
      { zoom: 1.25 },
    ]);
    editor.state.seed = 11;
    editor.state.heat = 5;
    syncDialFields(editor);
    editor.renderTo(editor.els.preview, 1024, 1280);
  },

  async editor(editor) {
    await loadSamples(editor, ['pier', 'boulevard']);
    editor.setLayout('hero-grid');
    editor.setGrade('sunset');
    editor.setWords('Sunset Heist', 'Vice Coast · Leonida');
    editor.setAssignments([0, 1, 1, 0]);
    editor.state.seed = 7;
    editor.state.heat = 4;
    syncDialFields(editor);
    editor.openOutline();
    editor.renderPreview();
  },

  async poster(editor) {
    document.body.classList.add('shot-poster');
    await loadSamples(editor, ['boulevard', 'pier']);
    editor.setLayout('skyline');
    editor.setGrade('neon');
    editor.setWords('BOULEVARD QUEEN', 'Neon Nights · Downtown');
    editor.setAssignments([1, 0, 1, 0]);
    editor.setPanelEdits([
      { zoom: 1.1 },
      { zoom: 1.3, oy: -0.06 },
      { zoom: 1.1, ox: -0.08 },
      { zoom: 1.05 },
    ]);
    editor.state.seed = 23;
    editor.state.heat = 4;
    syncDialFields(editor);
    editor.renderTo(editor.els.preview, 1080, 1080);
  },

  async exports(editor) {
    document.body.classList.add('shot-exports');
    await loadSamples(editor, ['pier']);
    editor.setLayout('collage');
    editor.setGrade('golden');
    editor.setWords('Golden Hour Heist', 'Three sizes · One click');
    editor.setAssignments([0, 0, 0, 0, 0]);
    editor.state.seed = 5;
    editor.state.heat = 3;
    syncDialFields(editor);
    editor.openOutline();
    editor.renderPreview();
    document.getElementById('export-bar').scrollIntoView({ block: 'center' });
  },
};

export async function runShot(editor, params) {
  const name = params.get('shot');
  const scene = scenes[name];
  if (!scene) throw new Error(`unknown shot scene: ${name}`);
  await scene(editor);
  await painted();
  window.__shotReady = true;
}
