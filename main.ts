// Vice City Cover Maker — the hand-in program for gta6-cover-art-01.
//
// The entry is the app/ folder beside this file: plain static files a
// desktop browser opens offline (app/index.html plus its ES modules, no
// build step, no network). This program copies app/ and screenshots/
// into the output directory and writes dossier.json there with the
// vendored make.fun library (vendor/makefun-app.ts, kept byte-identical
// with the kit — the scorer compares against its own copy).
//
// Try the app locally with `node serve.ts`, then open the printed URL.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for
// /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The competition's caps, mirrored so a local run refuses anything the
// scorer would refuse: at most 4 screenshots of 256 KiB each, at most
// 993 files and 48 MiB across app/, no app/ path over 1000 bytes.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
};

function walk(dir: string, base: string, acc: { files: number; bytes: number }): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    const rel = join(base, entry.name);
    if (entry.isDirectory()) {
      walk(full, rel, acc);
    } else {
      acc.files += 1;
      acc.bytes += statSync(full).size;
      if (Buffer.byteLength(rel) > CAPS.app_path_max_bytes) {
        throw new Error(`app path too long (${rel.length} bytes): ${rel}`);
      }
    }
  }
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

const dossierBytes = buildDossier(out, CAPS);
writeFileSync(join(out, 'dossier.json'), dossierBytes);

// Verification pass: prove the hand-in on disk is whole before reporting
// success — re-read the dossier, parse it, and recount what was copied.
const parsed = JSON.parse(readFileSync(join(out, 'dossier.json'), 'utf8'));
const appStats = { files: 0, bytes: 0 };
walk(join(out, 'app'), 'app', appStats);
const shotDir = join(out, 'screenshots');
const shotNames = existsSync(shotDir) ? readdirSync(shotDir).sort() : [];
if (appStats.files > CAPS.app_max_files) {
  throw new Error(`app/ holds ${appStats.files} files, over the ${CAPS.app_max_files} cap`);
}
if (appStats.bytes > CAPS.app_max_bytes) {
  throw new Error(`app/ holds ${appStats.bytes} bytes, over the ${CAPS.app_max_bytes} cap`);
}
for (const name of shotNames) {
  const size = statSync(join(shotDir, name)).size;
  if (size > CAPS.screenshots.max_bytes) {
    throw new Error(`screenshot ${name} is ${size} bytes, over the ${CAPS.screenshots.max_bytes} cap`);
  }
}
console.log(
  `vice-city-cover-maker: dossier ok (schema=${parsed.schema ?? 'unknown'}, ` +
    `${dossierBytes.length} bytes), app files=${appStats.files} (${appStats.bytes} bytes), ` +
    `screenshots=${shotNames.length} [${shotNames.join(', ')}] -> ${out}`,
);
