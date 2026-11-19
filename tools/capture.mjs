// capture.mjs — makes every image this entry ships, in one run:
//
//   1. samples: renders tools/samples.html in headless Chrome and cuts the
//      two drawn scenes out of it as app/samples/boulevard.jpg (1600x1200)
//      and app/samples/pier.jpg (1200x1600).
//   2. screenshots: serves app/ with serve.ts, walks the scenes listed in
//      shots.json, waits for each scene's window.__shotReady, and saves
//      screenshots/<name> as a JPEG that fits the gate: at most 262144
//      bytes (dropping quality until it fits), long side at most 1280,
//      short side at least 480. For the exports scene it also reads back
//      window.__exportDims and checks the three true export sizes.
//
// Node standard library only: Chrome is driven over the DevTools protocol
// on Node's built-in WebSocket. Run: node tools/capture.mjs

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT_SERVE = 8971;
const PORT_DEBUG = 8972;
const SHOT_BYTE_CAP = 262144;
const EXPECTED_EXPORTS = [[1080, 1080], [1080, 1350], [1920, 1080]];

const CHROME_OPTIONS = [
  process.env.CHROME_BIN,
  '/home/hatch/.cache/puppeteer/chrome/linux-148.0.7778.97/chrome-linux64/chrome',
  '/opt/meta-chromium/chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].filter(Boolean);
const chromePath = CHROME_OPTIONS.find((p) => existsSync(p));
if (!chromePath) throw new Error('no Chrome binary found in the usual places');

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUntilUp(url, attempts = 80) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch { /* still starting */ }
    await pause(200);
  }
  throw new Error(`never came up: ${url}`);
}

// A flat-session DevTools client: one map of pending calls by id.
class DevTools {
  constructor(socket) {
    this.socket = socket;
    this.seq = 0;
    this.waiting = new Map();
    socket.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (!msg.id || !this.waiting.has(msg.id)) return;
      const { done, fail } = this.waiting.get(msg.id);
      this.waiting.delete(msg.id);
      if (msg.error) fail(new Error(msg.error.message));
      else done(msg.result);
    });
  }

  call(method, params = {}, sessionId) {
    const id = ++this.seq;
    const body = { id, method, params };
    if (sessionId) body.sessionId = sessionId;
    return new Promise((done, fail) => {
      this.waiting.set(id, { done, fail });
      this.socket.send(JSON.stringify(body));
    });
  }
}

function jpegDimensions(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG stream');
  let at = 2;
  while (at + 9 < buf.length) {
    if (buf[at] !== 0xff) { at += 1; continue; }
    const marker = buf[at + 1];
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { w: buf.readUInt16BE(at + 7), h: buf.readUInt16BE(at + 5) };
    }
    if (marker === 0xd9 || marker === 0xda) break;
    at += 2 + buf.readUInt16BE(at + 2);
  }
  throw new Error('JPEG has no frame header');
}

async function openPage(devtools) {
  const { targetId } = await devtools.call('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await devtools.call('Target.attachToTarget', { targetId, flatten: true });
  await devtools.call('Page.enable', {}, sessionId);
  await devtools.call('Runtime.enable', {}, sessionId);
  return sessionId;
}

async function evaluate(devtools, sessionId, expression) {
  const out = await devtools.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
  if (out.exceptionDetails) throw new Error(`page threw: ${out.exceptionDetails.text}`);
  return out.result?.value;
}

async function shoot(devtools, sessionId, params) {
  const res = await devtools.call('Page.captureScreenshot', { format: 'jpeg', ...params }, sessionId);
  return Buffer.from(res.data, 'base64');
}

async function makeSamples(devtools, sessionId) {
  await devtools.call('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
  const url = pathToFileURL(join(root, 'tools', 'samples.html')).href;
  await devtools.call('Page.navigate', { url }, sessionId);
  await evaluate(devtools, sessionId, 'document.fonts.ready.then(() => true)');
  await pause(400);
  mkdirSync(join(root, 'app', 'samples'), { recursive: true });
  const report = [];
  for (const [id, file] of [['boulevard', 'boulevard.jpg'], ['pier', 'pier.jpg']]) {
    const box = await evaluate(devtools, sessionId,
      `(() => { const r = document.getElementById('${id}').getBoundingClientRect(); return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height }; })()`);
    const buf = await shoot(devtools, sessionId, {
      quality: 92,
      captureBeyondViewport: true,
      clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 1 },
    });
    const dims = jpegDimensions(buf);
    if (dims.w !== box.w || dims.h !== box.h) {
      throw new Error(`${file}: cut out ${dims.w}x${dims.h}, scene is ${box.w}x${box.h}`);
    }
    writeFileSync(join(root, 'app', 'samples', file), buf);
    report.push(`sample ${file}: ${dims.w}x${dims.h}, ${buf.length} bytes`);
  }
  return report;
}

async function makeScreenshots(devtools, sessionId) {
  const shots = JSON.parse(readFileSync(join(root, 'shots.json'), 'utf8'));
  mkdirSync(join(root, 'screenshots'), { recursive: true });
  const report = [];
  for (const shot of shots) {
    await devtools.call('Emulation.setDeviceMetricsOverride', { width: shot.w, height: shot.h, deviceScaleFactor: 1, mobile: false }, sessionId);
    await devtools.call('Page.navigate', { url: `http://127.0.0.1:${PORT_SERVE}/index.html${shot.query}` }, sessionId);
    let ready = false;
    for (let i = 0; i < 100 && !ready; i++) {
      ready = (await evaluate(devtools, sessionId, 'window.__shotReady === true').catch(() => false)) === true;
      if (!ready) await pause(200);
    }
    if (!ready) throw new Error(`scene never settled: ${shot.name}`);
    await pause(120);

    if (shot.query.includes('shot=exports')) {
      const dims = await evaluate(devtools, sessionId, 'window.__exportDims');
      if (JSON.stringify(dims) !== JSON.stringify(EXPECTED_EXPORTS)) {
        throw new Error(`export size proof failed: got ${JSON.stringify(dims)}`);
      }
      report.push(`export proof: ${JSON.stringify(dims)}`);
    }

    let buf = null;
    for (let quality = 88; quality >= 36; quality -= 6) {
      buf = await shoot(devtools, sessionId, { quality, captureBeyondViewport: false });
      if (buf.length <= SHOT_BYTE_CAP) break;
    }
    if (!buf || buf.length > SHOT_BYTE_CAP) throw new Error(`${shot.name}: ${buf?.length} bytes even at floor quality`);
    const dims = jpegDimensions(buf);
    const long = Math.max(dims.w, dims.h);
    const short = Math.min(dims.w, dims.h);
    if (long > 1280 || short < 480) throw new Error(`${shot.name}: ${dims.w}x${dims.h} breaks the gate's size rules`);
    writeFileSync(join(root, 'screenshots', shot.name), buf);
    report.push(`shot ${shot.name}: ${dims.w}x${dims.h}, ${buf.length} bytes`);
  }
  return report;
}

async function main() {
  const server = spawn('node', ['serve.ts', '--port', String(PORT_SERVE)], { cwd: root, stdio: 'ignore' });
  const chrome = spawn(chromePath, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--remote-debugging-port=${PORT_DEBUG}`, '--remote-debugging-address=127.0.0.1',
    `--user-data-dir=/tmp/neon-frame-chrome-${process.pid}`,
    'about:blank',
  ], { stdio: 'ignore' });
  try {
    await waitUntilUp(`http://127.0.0.1:${PORT_SERVE}/index.html`);
    const version = await (await waitUntilUp(`http://127.0.0.1:${PORT_DEBUG}/json/version`)).json();
    const socket = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((done, fail) => {
      socket.addEventListener('open', done, { once: true });
      socket.addEventListener('error', fail, { once: true });
    });
    const devtools = new DevTools(socket);
    const sessionId = await openPage(devtools);
    const report = [];
    report.push(...await makeSamples(devtools, sessionId));
    report.push(...await makeScreenshots(devtools, sessionId));
    socket.close();
    for (const line of report) console.log(line);
    console.log('capture complete: samples + screenshots all inside the caps');
  } finally {
    chrome.kill('SIGKILL');
    server.kill('SIGKILL');
  }
}

main().catch((err) => {
  console.error(`capture failed: ${err.message}`);
  process.exit(1);
});
