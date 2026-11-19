// A tiny static server for trying the app locally: `node serve.ts`
// serves app/ at http://localhost:8080 (set PORT to change the port).
// Standard library only; it refuses anything outside app/.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(fileURLToPath(new URL('./app', import.meta.url)));
const port = Number(process.env.PORT ?? 8080);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer((req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const decoded = decodeURIComponent(url.pathname);
    const relative = normalize(decoded.replace(/^\/+/, ''));
    const filePath = resolve(join(appRoot, relative === '.' ? 'index.html' : relative));
    if (filePath !== appRoot && !filePath.startsWith(appRoot + sep)) {
      res.writeHead(403, { 'content-type': 'text/plain' });
      res.end('forbidden');
      return;
    }
    let target = filePath;
    if (existsSync(target) && statSync(target).isDirectory()) {
      target = join(target, 'index.html');
    }
    if (!existsSync(target) || !statSync(target).isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    createReadStream(target).pipe(res);
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end('server error');
  }
});

server.listen(port, () => {
  console.log(`Vice City Cover Maker running at http://localhost:${port}`);
});
