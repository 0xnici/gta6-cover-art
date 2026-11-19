// Capture the four screenshots in shots.json by driving headless Chrome
// over the DevTools protocol — Node standard library only (spawn, fetch,
// WebSocket). Starts serve.ts on a scratch port, opens each ?shot= scene
// at its viewport, waits for the page to flag window.__shotReady, saves a
// JPEG into screenshots/, and verifies the competition's caps: at most
// 262144 bytes, long side at most 1280 px, short side at least 480 px.
// If a frame is too heavy it is re-captured at a lower JPEG quality.
//
//   node tools/capture.mjs

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_PORT = 8123;
const CDP_PORT = 9341;
const BASE = `http://127.0.0.1:${SERVER_PORT}`;
const MAX_BYTES = 262144;
const QUALITIES = [80, 65, 50, 35, 22];

const CHROME_CANDIDATES = [
  '/home/hatch/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome',
  '/opt/meta-chromium/chrome',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (err) {
      lastError = err;
    }
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`);
}

/** Read the frame size out of a JPEG's SOF0/SOF2 marker. */
function jpegDimensions(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG');
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xc0 || marker === 0xc2) {
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      return { width, height };
    }
    if (marker === 0xd9 || marker === 0xda) break;
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) break;
    i += 2 + len;
  }
  throw new Error('no SOF marker found in JPEG');
}

/** A minimal CDP client: request/response over one WebSocket. */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`CDP ${msg.error.message}`));
        else resolve(msg.result);
      }
    });
  }

  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    return new Cdp(ws);
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* already gone */
    }
  }
}

async function main() {
  const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!chrome) throw new Error(`no Chrome binary in: ${CHROME_CANDIDATES.join(', ')}`);
  const shots = JSON.parse(readFileSync(join(repo, 'shots.json'), 'utf8'));
  mkdirSync(join(repo, 'screenshots'), { recursive: true });

  const server = spawn('node', ['serve.ts'], {
    cwd: repo,
    env: { ...process.env, PORT: String(SERVER_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const profile = mkdtempSync(join(tmpdir(), 'vccm-chrome-'));
  const browser = spawn(
    chrome,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--hide-scrollbars',
      '--mute-audio',
      '--force-device-scale-factor=1',
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let cdp;
  try {
    await waitFor(async () => {
      const res = await fetch(`${BASE}/`);
      return res.ok;
    }, 15000, 'the app server');
    await waitFor(async () => {
      const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
      return res.ok;
    }, 15000, 'the Chrome debugger');

    const targetRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, {
      method: 'PUT',
    });
    if (!targetRes.ok) throw new Error(`could not open a tab: HTTP ${targetRes.status}`);
    const target = await targetRes.json();
    cdp = await Cdp.connect(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    for (const shot of shots) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: shot.w,
        height: shot.h,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await cdp.send('Page.navigate', { url: `${BASE}/${shot.query}` });
      await waitFor(async () => {
        const res = await cdp.send('Runtime.evaluate', {
          expression: 'window.__shotReady === true',
          returnByValue: true,
        });
        return res.result && res.result.value === true;
      }, 30000, `shot ${shot.name} to render`);
      await sleep(250);

      let saved = null;
      for (const quality of QUALITIES) {
        const shotRes = await cdp.send('Page.captureScreenshot', {
          format: 'jpeg',
          quality,
          captureBeyondViewport: false,
        });
        const buf = Buffer.from(shotRes.data, 'base64');
        if (buf.length <= MAX_BYTES || quality === QUALITIES[QUALITIES.length - 1]) {
          saved = { buf, quality };
          break;
        }
      }
      const { width, height } = jpegDimensions(saved.buf);
      const longSide = Math.max(width, height);
      const shortSide = Math.min(width, height);
      if (saved.buf.length > MAX_BYTES) {
        throw new Error(`${shot.name}: ${saved.buf.length} bytes exceeds ${MAX_BYTES} even at lowest quality`);
      }
      if (longSide > 1280) throw new Error(`${shot.name}: long side ${longSide} exceeds 1280`);
      if (shortSide < 480) throw new Error(`${shot.name}: short side ${shortSide} below 480`);
      writeFileSync(join(repo, 'screenshots', shot.name), saved.buf);
      console.log(`${shot.name}: ${width}x${height}, ${saved.buf.length} bytes (jpeg quality ${saved.quality})`);
    }
    console.log(`captured ${shots.length} screenshots into screenshots/`);
  } finally {
    if (cdp) cdp.close();
    browser.kill('SIGKILL');
    server.kill('SIGKILL');
  }
}

main().catch((err) => {
  console.error(`capture failed: ${err.message}`);
  process.exit(1);
});
