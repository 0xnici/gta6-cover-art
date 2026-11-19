// capture.mjs — screenshot the app's ?shot= scenes into screenshots/.
// Node standard library only: it starts serve.ts on a scratch port, launches
// headless Chrome, and drives it over the DevTools protocol using Node's
// built-in WebSocket. Each shot retries at lower JPEG quality until it fits
// the competition cap (262144 bytes), and every file's dimensions are read
// back from its JPEG markers and checked against the gate's size rules
// (long side <= 1280, short side >= 480) before this tool calls it done.
//
// Run: node tools/capture.mjs

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = JSON.parse(readFileSync(join(repoRoot, 'shots.json'), 'utf8'));
const SERVE_PORT = 8931;
const DEBUG_PORT = 8932;
const MAX_BYTES = 262144;

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  '/home/hatch/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome',
  '/opt/meta-chromium/chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const chromeBin = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chromeBin) throw new Error('no Chrome binary found');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForHttp(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${url}`);
}

// Minimal CDP client over the browser-level WebSocket, one flat session.
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message}`));
        else resolve(msg.result);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }
}

function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG');
  let off = 2;
  while (off < buf.length - 9) {
    if (buf[off] !== 0xff) { off++; continue; }
    const marker = buf[off + 1];
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { h: buf.readUInt16BE(off + 5), w: buf.readUInt16BE(off + 7) };
    }
    if (marker === 0xd9 || marker === 0xda) break;
    off += 2 + buf.readUInt16BE(off + 2);
  }
  throw new Error('no SOF marker in JPEG');
}

async function main() {
  const server = spawn('node', ['serve.ts', '--port', String(SERVE_PORT)], {
    cwd: repoRoot, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const chrome = spawn(chromeBin, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--remote-debugging-port=${DEBUG_PORT}`, '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=/tmp/vc-cover-chrome-${process.pid}`,
    '--window-size=1280,900', 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  try {
    await waitForHttp(`http://127.0.0.1:${SERVE_PORT}/`);
    const version = await (await waitForHttp(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json();
    const ws = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    const cdp = new Cdp(ws);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);

    mkdirSync(join(repoRoot, 'screenshots'), { recursive: true });
    const results = [];
    for (const shot of shots) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: shot.w, height: shot.h, deviceScaleFactor: 1, mobile: false,
      }, sessionId);
      await cdp.send('Page.navigate', {
        url: `http://127.0.0.1:${SERVE_PORT}/index.html${shot.query}`,
      }, sessionId);
      let ready = false;
      for (let i = 0; i < 80 && !ready; i++) {
        const r = await cdp.send('Runtime.evaluate', {
          expression: 'window.__shotReady === true', returnByValue: true,
        }, sessionId);
        ready = r.result?.value === true;
        if (!ready) await sleep(250);
      }
      if (!ready) throw new Error(`scene never became ready: ${shot.name} (${shot.query})`);
      await sleep(150);

      let buf = null;
      for (let quality = 88; quality >= 40; quality -= 8) {
        const shotRes = await cdp.send('Page.captureScreenshot', {
          format: 'jpeg', quality, captureBeyondViewport: false,
        }, sessionId);
        buf = Buffer.from(shotRes.data, 'base64');
        if (buf.length <= MAX_BYTES) break;
      }
      if (!buf || buf.length > MAX_BYTES) {
        throw new Error(`${shot.name}: still ${buf?.length} bytes after quality retries`);
      }
      const { w, h } = jpegSize(buf);
      const longSide = Math.max(w, h), shortSide = Math.min(w, h);
      if (longSide > 1280 || shortSide < 480) {
        throw new Error(`${shot.name}: ${w}x${h} breaks the gate size rules`);
      }
      writeFileSync(join(repoRoot, 'screenshots', shot.name), buf);
      results.push(`${shot.name} ${w}x${h} ${buf.length} bytes`);
      console.log(`captured ${shot.name}: ${w}x${h}, ${buf.length} bytes (cap ${MAX_BYTES})`);
    }
    console.log(`all ${results.length} screenshots within caps`);
    ws.close();
  } finally {
    chrome.kill('SIGKILL');
    server.kill('SIGKILL');
  }
}

main().catch((err) => {
  console.error(`capture failed: ${err.message}`);
  process.exit(1);
});
