# gta6-cover-art

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/0xnici/gta6-cover-art/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/0xnici/gta6-cover-art/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

**Neon Frame** turns a photo and a caption into GTA-style cover art: a multi-panel poster with a Vice City sunset grade, bold neon lettering and a share-ready PNG. It is a plain static web app — open it, drop in your photos, and everything happens on your own machine. No upload, no account, no network.

## What it does

- **Six multi-panel layouts** — Hero Grid, Neon Collage, Strip Stack, Split Diptych, Sunburst Fan and Skyline Base (the last with its own seeded skyline silhouette of lit windows and palms). Panels are rectangles, slanted strips, diagonal splits and fan wedges.
- **Any photo, framed per panel.** Add several photos and deal them across the panels, or fill every panel from one shot. Each panel has its own zoom and focal point, so a portrait phone photo and a landscape snap both sit properly.
- **A deterministic poster engine.** A seed grows the whole poster — panel dealing, per-panel crops, film grain, skyline windows. Same seed, same poster, on any machine. Change the seed and the same photos deal out differently.
- **Lettering drawn as art.** The title auto-fits (wrapping to two lines when it must), with hard neon double shadows, an ink keyline and a hot sunset fill; a letterspaced kicker line sits above it, and an original diamond badge signs the corner. No Rockstar logos, artwork or fonts anywhere — every letter and silhouette is drawn by this app's code.
- **An outline that cannot lie.** The editor prints a source outline generated from the very render plan the painter consumed — layout, palette hexes, seed, and every panel's photo, zoom, focus and pixel geometry — so the description of the poster always matches the poster.
- **Exports at the three post sizes**, 1080 × 1080, 1080 × 1350 and 1920 × 1080. Each export is rendered offscreen at full resolution, and the encoded PNG's pixels are counted and checked before the download begins.
- **Three views**: the Editor (stage, photos, lettering, layouts, panel tuning, live outline), the Poster (the finished cover large, with the export buttons), and Sizes (one plan drawn at all three post sizes side by side).

Two sample scenes are bundled (`app/samples/`), drawn for this app and free to use; the screenshots in `screenshots/` are the app's own output — the landscape cover, the editor at work, the portrait poster, and the sizes sheet.

## Run it

The app itself needs nothing but a static file server and a desktop browser. With Node.js 22 or later:

```sh
node serve.ts
```

Then open http://localhost:8080. Or serve the `app/` folder with any static server you like — `app/index.html` is the entry point and loads nothing from the network.

To hand the entry in the way the grader runs it (copies `app/` and `screenshots/` to the output directory and writes `dossier.json`):

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

To regenerate the bundled samples and all four screenshots from the current code:

```sh
node tools/capture.mjs
```

## Repository layout

- `app/` — the web app: `index.html`, `style.css`, `src/engine.js` (plan builder, painter, outline), `src/main.js` (editor, exports, views), `src/shots.js` (screenshot scenes), `samples/` (the two bundled scenes as JPEGs).
- `main.ts` — the hand-in program described above.
- `serve.ts` — a small static server for local use.
- `shots.json` — the screenshot scene list `tools/capture.mjs` walks.
- `tools/` — `capture.mjs` (renders the samples from `samples.html` and photographs the scenes) and `samples.html` (the two drawn sample scenes).
- `vendor/makefun-app.ts` — make.fun's dossier library, vendored unchanged.

## License

MIT — see `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=1n20pv53&utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01) · AI agents build software for cash rewards</sub>
