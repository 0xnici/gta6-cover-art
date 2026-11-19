// shots.js — deterministic screenshot scenes for tools/capture.mjs.
// A ?shot=<name> page sets up one fixed scene from the bundled sample
// photos, renders it, and raises window.__shotReady when the frame is
// final, so captures are identical on every run.

const SCENES = {
  // A finished portrait poster, full frame — the money shot.
  cover: {
    bodyClass: 'shot-cover',
    canvas: [1024, 1280],
    setup: { layout: 'heroGrid', grade: 'sunset', caption: 'Neon Shore', subtitle: 'vice city nights', heat: 5, seed: 11, assignments: [0, 1, 0, 1] },
  },
  // The editor at work: collage layout, both samples placed, outline live.
  editor: {
    bodyClass: 'shot-editor',
    canvas: [880, 880],
    setup: { layout: 'collage', grade: 'neon', caption: 'Boulevard Queen', subtitle: 'midnight run', heat: 4, seed: 23, assignments: [0, 1, 1, 0, 1] },
  },
  // A finished wide poster in a second grade and layout.
  poster: {
    bodyClass: 'shot-poster',
    canvas: [1280, 720],
    setup: { layout: 'skyline', grade: 'goldenhour', caption: 'Pier Pressure', subtitle: 'one last score', heat: 5, seed: 5, assignments: [1, 0, 1, 0] },
  },
  // The editor with the export gallery filled at all three post sizes.
  exports: {
    bodyClass: 'shot-exports',
    canvas: [880, 880],
    setup: { layout: 'nineGrid', grade: 'lagoon', caption: 'Lagoon City', subtitle: 'salt & neon', heat: 3, seed: 41, assignments: [0, 1, 0, 1, 0, 1, 0, 1, 0] },
    after: async (api) => {
      // Seed the gallery the way real exports would, minus the downloads:
      // render the three sizes and keep their thumbnails.
      const { EXPORT_SIZES, renderCover } = await import('./engine.js');
      const items = [];
      for (const size of EXPORT_SIZES) {
        const off = document.createElement('canvas');
        off.width = size.w; off.height = size.h;
        renderCover(off.getContext('2d'), size.w, size.h, api.state);
        const thumb = document.createElement('canvas');
        thumb.width = 216; thumb.height = Math.round(216 * size.h / size.w);
        thumb.getContext('2d').drawImage(off, 0, 0, thumb.width, thumb.height);
        items.push({ dataUrl: thumb.toDataURL('image/jpeg', 0.82), label: `${size.w}×${size.h}`, at: Date.now() });
      }
      try { localStorage.setItem('vc-cover-gallery-v1', JSON.stringify(items)); } catch { /* scene still renders */ }
      const panel = document.querySelector('.panel');
      if (panel) panel.scrollTop = panel.scrollHeight;
    },
  },
};

export async function applyShotScene(state, params, api) {
  const name = params.get('shot') || 'cover';
  const scene = SCENES[name] ?? SCENES.cover;
  document.body.classList.add(scene.bodyClass);

  const captionOverride = params.get('caption');
  await api.addPhotoSource('samples/boulevard.jpg', 'boulevard');
  await api.addPhotoSource('samples/pier.jpg', 'pier');

  Object.assign(state, scene.setup);
  if (captionOverride) state.caption = captionOverride;
  state.tunes = state.assignments.map((_, i) => ({
    zoom: 1 + (i % 3) * 0.12,
    ox: (i % 2 === 0 ? 1 : -1) * 0.08,
    oy: 0,
  }));

  const preview = document.getElementById('previewCanvas');
  const original = document.getElementById('originalCanvas');
  preview.width = scene.canvas[0]; preview.height = scene.canvas[1];
  original.width = scene.canvas[0]; original.height = scene.canvas[1];

  const captionInput = document.getElementById('captionInput');
  const subtitleInput = document.getElementById('subtitleInput');
  if (captionInput) captionInput.value = state.caption;
  if (subtitleInput) subtitleInput.value = state.subtitle;
  const heatInput = document.getElementById('heatInput');
  const heatLabel = document.getElementById('heatLabel');
  if (heatInput) heatInput.value = String(state.heat);
  if (heatLabel) heatLabel.textContent = `${state.heat} star${state.heat === 1 ? '' : 's'}`;

  api.draw();
  if (scene.after) await scene.after({ ...api, state });
  api.draw();
  // Two frames so fonts, patterns and the gallery are all painted.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.__shotReady = true;
  window.__shotName = name;
}
