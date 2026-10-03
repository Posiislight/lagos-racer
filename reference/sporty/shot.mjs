// Render one showroom vehicle from several angles with headless Chrome/Edge and save PNGs.
// Usage: node shot.mjs <vehicle-id> [outDir] [angle,angle,...]
//   vehicle-id: okada | keke | danfo | brt-blue | brt-red
//   angles: hero, front, right, left, rear, rearq, top, low (default: hero,front,right,left,rear,top)
// Prints render stats (mesh count, draw calls, triangles) and any page errors as JSON.
// Each run uses its own throwaway browser profile, so several runs can go at once.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const [vehicle = 'okada', outArg, angleArg] = process.argv.slice(2);
const outDir = path.resolve(outArg || path.join(here, 'shots', vehicle));
const ANGLES = {
  hero:  { az: .7,   el: .26, zoom: 1.0 },  // front three-quarter, right (door) side
  front: { az: 0,    el: .12, zoom: 1.0 },
  right: { az: Math.PI / 2,  el: .1, zoom: 1.0 },  // kerb/door side
  left:  { az: -Math.PI / 2, el: .1, zoom: 1.0 },  // driver side
  rear:  { az: Math.PI, el: .15, zoom: 1.0 },
  rearq: { az: 2.45, el: .3, zoom: 1.0 },          // rear three-quarter
  top:   { az: .7, el: 1.2, zoom: 1.0 },
  low:   { az: -.6, el: .04, zoom: .85 },          // low dramatic angle, driver side front
};
const angles = (angleArg || 'hero,front,right,left,rear,top').split(',').filter(a => ANGLES[a]);

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!exe) { console.error('No Chrome or Edge found'); process.exit(1); }

const W = 1100, H = 760;
const profile = mkdtempSync(path.join(tmpdir(), 'lr-shot-'));
const browser = spawn(exe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, '--hide-scrollbars', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist', '--no-first-run', '--no-default-browser-check', '--allow-file-access-from-files', 'about:blank'],
  { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const cleanup = () => { try { browser.kill(); } catch {} setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} }, 500); };
const fail = msg => { console.error(msg); cleanup(); process.exit(1); };

let port;
for (let i = 0; i < 100 && !port; i++) {
  await sleep(100);
  try { port = readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(); } catch {}
}
if (!port) fail('Browser did not start');

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails; errors.push((d.exception && d.exception.description) || d.text);
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error')
    errors.push(msg.params.args.map(a => a.value ?? a.description).join(' '));
};
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  return r.result && r.result.result ? r.result.result.value : undefined;
};

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
const url = pathToFileURL(path.join(here, process.env.LR_PAGE || 'index.html')).href + `?v=${encodeURIComponent(vehicle)}&spin=0&ui=0`;
await send('Page.navigate', { url });

let ready = false;
for (let i = 0; i < 300 && !ready; i++) { await sleep(100); ready = await evaluate('!!(window.__lr && window.__lr.ready)'); }
if (!ready) { console.log(JSON.stringify({ vehicle, error: 'page never became ready', errors }, null, 2)); cleanup(); process.exit(1); }

mkdirSync(outDir, { recursive: true });
const files = [];
const nextFrames = 'new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))))';
for (const name of angles) {
  await evaluate(`window.__lr.setView(${JSON.stringify(ANGLES[name])})`);
  await evaluate(nextFrames);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(outDir, `${name}.png`);
  writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
  files.push(file);
}
const stats = await evaluate('window.__lr.stats()');
console.log(JSON.stringify({ ...stats, files, errors }, null, 2));
ws.close(); cleanup();
setTimeout(() => process.exit(errors.length ? 2 : 0), 600);
