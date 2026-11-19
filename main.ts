// main.ts — the program that hands this entry in (Node 22, standard
// library only, plus the vendored make.fun dossier builder).
//
// It stages the web app (app/) and the screenshot set (screenshots/) into
// the output directory, then writes dossier.json by running buildDossier
// over that staged tree. The limits handed to buildDossier are the gate's
// own numbers — screenshot count and size, app file count and bytes, path
// length, dossier text budget — so a tree the sealed scorer would refuse
// is refused here first, while it can still be fixed.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// With MAKEFUN_OUTPUT_DIR unset the output directory is /output, which is
// where the grader mounts it. The program runs twice there and must write
// the same bytes both times: everything below is a pure copy plus the
// deterministic dossier build, with no clocks or randomness involved.

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const root = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const GATE_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
} as const;

function stageTree(name: string): void {
  const from = join(root, name);
  if (!existsSync(from)) return;
  cpSync(from, join(outDir, name), { recursive: true });
}

mkdirSync(outDir, { recursive: true });
stageTree('app');
stageTree('screenshots');

const dossierBytes = buildDossier(outDir, GATE_LIMITS);
const dossierPath = join(outDir, 'dossier.json');
writeFileSync(dossierPath, dossierBytes);

// Prove the file on disk is exactly the bytes the library produced and
// that they parse; a mismatch here means the hand-in is corrupt.
const back = readFileSync(dossierPath);
if (!back.equals(Buffer.from(dossierBytes))) {
  throw new Error('dossier.json on disk differs from the built dossier');
}
JSON.parse(back.toString('utf8'));

console.log(`handed in: app/ + screenshots/ staged, dossier.json ${dossierBytes.byteLength} bytes -> ${outDir}`);
