// Vice City Cover Maker — the hand-in program (Node 22, standard library
// plus the vendored make.fun dossier library, nothing else).
//
// What it does: copies the finished web app (app/) and its screenshots
// (screenshots/) into the output directory, then asks buildDossier to
// summarise them into dossier.json and re-reads that file to prove the
// bytes on disk are the bytes the library produced. The caps passed to
// buildDossier are the competition's own gate limits, so an entry that
// would fail the gate fails here first, on my machine, with a clear error.
//
// Run it:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// (MAKEFUN_OUTPUT_DIR unset means /output, the grader's mount.)

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

function treeBytes(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    total += entry.isDirectory() ? treeBytes(p) : statSync(p).size;
  }
  return total;
}

mkdirSync(outputDir, { recursive: true });
copyTree(join(repoRoot, 'app'), join(outputDir, 'app'));
if (existsSync(join(repoRoot, 'screenshots'))) {
  copyTree(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'));
}

const dossierBytes = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});

// Write the canonical bytes, then read them back and confirm nothing
// changed on the way to disk and the result parses as JSON.
const dossierPath = join(outputDir, 'dossier.json');
writeFileSync(dossierPath, dossierBytes);
const written = readFileSync(dossierPath);
if (!written.equals(Buffer.from(dossierBytes))) {
  throw new Error('dossier.json changed between build and write');
}
const parsed = JSON.parse(written.toString('utf8'));
if (!parsed || typeof parsed !== 'object') throw new Error('dossier.json is not an object');

const appBytes = treeBytes(join(outputDir, 'app'));
console.log(`dossier ok: app ${appBytes} bytes, dossier ${written.length} bytes -> ${outputDir}`);
