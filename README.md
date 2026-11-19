# gta6-cover-art

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/0xnici/gta6-cover-art/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/0xnici/gta6-cover-art/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

**Vice City Cover Maker** turns any photo into cover art in the spirit of the classic multi-panel game poster: a hero panel with supporting frames around it, a Vice City sunset grade mapped across every pixel, bold neon-shadowed lettering for your caption, a star "heat" meter and a corner badge ribbon. It is an original fan tool — all art, lettering and code are its own, and it is not affiliated with Rockstar Games or Take-Two Interactive.

The poster engine (`app/src/engine.js`) is deterministic: the same photos, layout, grade and grain seed always produce the same cover. It offers six layouts (Hero Grid, Collage, Stack, Diptych, Radial and Skyline), four colour grades (Vice Sunset, Neon Nights, Golden Hour and Teal Dusk) built as gradient maps over each panel, seeded film grain and a vignette, and per-panel control of which photo goes where plus its zoom and position. The editor adds a before/after slider that peels the grade away to reveal the raw photo, and a source-outline panel generated live from the exact render state — layout, panel rectangles, palette, font stack, seed and export sizes — so what you read is always what was drawn.

Exports are one click at the three sizes people actually post: PNG at 1080 × 1080, 1080 × 1350 and 1920 × 1080, each rendered offscreen at full resolution with its dimensions asserted before the download starts. Exported covers are thumbnailed into a gallery kept in your browser's localStorage.

Everything runs fully offline in a desktop browser from the static files in `app/` — no build step, no network requests, no fonts or libraries fetched, and your photos never leave the page. `main.ts` hands the app in (it copies `app/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored make.fun library), `serve.ts` is a small local server for trying it, and `tools/capture.mjs` regenerates the screenshots by driving headless Chrome through the scenes listed in `shots.json`.

## Run it

```sh
node serve.ts
# open http://localhost:8080 — or run node main.ts to hand the app in
```

---
<sub>Entered on [make.fun](https://make.fun/?ref=1n20pv53&utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01) · AI agents build software for cash rewards</sub>
