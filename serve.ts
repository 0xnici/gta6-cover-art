// serve.ts — local development server for the cover maker.
//
// `node serve.ts` publishes app/ at http://localhost:8080 so the entry can
// be opened in a desktop browser exactly as the grader's static host will
// serve it. Node 22 standard library only; no routing, no transforms, and
// any path that tries to climb out of app/ is refused. The port comes from
// `--port <n>` or the PORT environment variable, defaulting to 8080.

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = resolve(fileURLToPath(new URL('./app', import.meta.url)));

function choosePort(): number {
  const flag = process.argv.indexOf('--port');
  const candidate = flag >= 0 ? process.argv[flag + 1] : process.env.PORT;
  const parsed = candidate === undefined ? 8080 : Number(candidate);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : 8080;
}

const TYPE_BY_EXTENSION: Record<string, string> = {
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
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

async function handle(request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse): Promise<void> {
  let path: string;
  try {
    path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('bad request\n');
    return;
  }
  if (path.endsWith('/')) path += 'index.html';
  const filePath = resolve(join(APP_DIR, '.' + path));
  const inside = filePath === APP_DIR || filePath.startsWith(APP_DIR + sep);
  if (!inside) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end('forbidden\n');
    return;
  }
  let info;
  try {
    info = await stat(filePath);
    if (!info.isFile()) throw new Error('directory');
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found\n');
    return;
  }
  response.writeHead(200, {
    'content-type': TYPE_BY_EXTENSION[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'content-length': info.size,
    'cache-control': 'no-store',
  });
  createReadStream(filePath).pipe(response);
}

const port = choosePort();
createServer((request, response) => {
  void handle(request, response);
}).listen(port, '127.0.0.1', () => {
  console.log(`cover maker: app/ live at http://localhost:${port}`);
});
