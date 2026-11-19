# Vice City Cover Maker

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/0xnici/gta6-cover-art/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/0xnici/gta6-cover-art/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

Turn any photo into multi-panel GTA-style cover art — the loading-screen poster look, rebuilt as an original offline web app. Drop in a photo, pick a layout and a Vice City colour grade, letter your caption, and export a share-ready PNG. Everything runs in your browser from static files: no upload, no account, no network. Your photos never leave your machine.

## What it does

- **A real poster engine, not a frame overlay.** Every panel of the cover is gradient-mapped pixel by pixel through a Vice City colour ramp, then finished with seeded film grain, a vignette, white keyline seams, heat stars and a badge. Five named grades: Vice Sunset, Neon Nights, Golden Hour, Lagoon Teal and Ultraviolet.
- **Six multi-panel layouts** — Hero Grid, Cover Grid 3×3, Collage Cut, Stacked Strips, Diptych + Band and Skyline Split — each panel independently assigned a photo, with its own zoom and pan so any photo can be framed into any panel.
- **Bold cover lettering.** The caption is auto-fitted, drawn with a sunset gradient fill, a heavy dark outline and a neon glow; a script subtitle, a 0–5 heat-star row and a circular VC badge complete the poster.
- **Before/after slider** that wipes between the raw photos in their panels and the finished graded cover, so the grade is never a mystery.
- **Live source outline.** A panel in the editor prints the current render state as it changes: layout, grade palette hexes, every panel's pixel rectangle at export size with its photo and framing, the grain seed and the export sizes.
- **One-step exports** at 1080 × 1080, 1080 × 1350 and 1920 × 1080, rendered offscreen at full resolution with the dimensions asserted before the download starts. Exported covers are thumbnailed into a gallery kept in localStorage.
- **Original art only.** No Rockstar Games logos, artwork or fonts — the lettering uses system font stacks and every decoration is drawn by the app itself.

## Run it

You need Node.js 22 or later for the two helper programs; the app itself is plain static files.

```sh
node serve.ts          # serves app/ at http://localhost:8080
```

Open http://localhost:8080 in a desktop browser. Two sample photos load by default; add your own with the **Add photos** button or by dropping files onto the stage.

To hand the entry in the way the grader runs it:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

That copies `app/` and `screenshots/` into `out/` and writes `out/dossier.json`. The screenshots in `screenshots/` are produced by `node tools/capture.mjs`, which drives headless Chrome through the app's deterministic `?shot=` scenes.

## Layout of the repo

- `app/` — the web app: `index.html`, `style.css`, `src/engine.js` (the poster engine), `src/main.js` (the editor), `src/shots.js` (screenshot scenes), `samples/` (two bundled photos).
- `main.ts` — the hand-in program described above.
- `serve.ts` — a small static server for local use.
- `tools/capture.mjs` — the screenshot tool (Node standard library only, DevTools protocol over WebSocket).
- `vendor/makefun-app.ts` — make.fun's dossier library, vendored unchanged.

## License

MIT — see `LICENSE`.

---

Entered on make.fun with referral link https://make.fun/?ref=1n20pv53
