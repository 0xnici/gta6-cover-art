// serve.ts — a pocket static server for trying the app locally.
// Node 22 standard library only. `node serve.ts` (or PORT=9000 node
// serve.ts, or `node serve.ts --port 9000`) serves app/ on 127.0.0.1.
// It will not follow a path out of app/, and it answers 404 plainly.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(fileURLToPath(new URL('./app', import.meta.url)));

function pickPort(): number {
  const flagAt = process.argv.indexOf('--port');
  const raw = flagAt >= 0 ? process.argv[flagAt + 1] : process.env.PORT;
  const n = raw ? Number(raw) : 8080;
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : 8080;
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer((req, res) => {
  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain' }).end('bad request\n');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const target = resolve(join(appRoot, '.' + pathname));
  if (target !== appRoot && !target.startsWith(appRoot + sep)) {
    res.writeHead(403, { 'content-type': 'text/plain' }).end('forbidden\n');
    return;
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found\n');
    return;
  }
  res.writeHead(200, {
    'content-type': CONTENT_TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
    'content-length': statSync(target).size,
    'cache-control': 'no-store',
  });
  createReadStream(target).pipe(res);
});

const port = pickPort();
server.listen(port, '127.0.0.1', () => {
  console.log(`Vice City Cover Maker app/ serving at http://localhost:${port}`);
});
