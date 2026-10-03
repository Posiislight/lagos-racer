// Play-test the game in headless Chrome and report what happened.
// Usage: node scripts/playtest.mjs [options]
//   --url=http://localhost:5173/   game URL (dev server must be running)
//   --size=1280x720                viewport; add --mobile for touch emulation
//   --seconds=20                   how long to run the race
//   --autopilot                    let the AI drive the player's car
//   --keys=ArrowUp:0-8,ArrowLeft:2-3   hold keys between seconds a-b (comma separated)
//   --shots=2,6,12                 screenshot times (s) after the race starts
//   --out=dir                      where to save screenshots (default: scratch dir)
//   --gpu                          try the real GPU instead of SwiftShader
//   --vehicle=okada --quality=high --unlock
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const base = args.url || 'http://localhost:5173/';
const [W, H] = (args.size || '1280x720').split('x').map(Number);
const seconds = +(args.seconds || 20);
const shots = String(args.shots || '3,10').split(',').filter(Boolean).map(Number);
const out = path.resolve(args.out || path.join(tmpdir(), 'lr-playtest'));
mkdirSync(out, { recursive: true });

const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const profile = mkdtempSync(path.join(tmpdir(), 'lr-play-'));
const gl = args.gpu ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = spawn(exe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', ...gl, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const done = code => { try { browser.kill(); } catch {} setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(code); }, 500); };

let port;
for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(); } catch {} }
if (!port) { console.error('browser did not start'); done(1); }
const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const errors = [], logs = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled') {
    const text = m.params.args.map(a => a.value ?? a.description).join(' ');
    (m.params.type === 'error' ? errors : logs).push(text.slice(0, 400));
  }
};
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; };
const shot = async name => { const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }); const f = path.join(out, name + '.jpg'); writeFileSync(f, Buffer.from(s.result.data, 'base64')); return f; };

await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: args.mobile ? 2 : 1, mobile: !!args.mobile });
if (args.mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
const params = new URLSearchParams();
if (args.autopilot) params.set('autopilot', '1');
if (args.unlock) params.set('unlock', 'all');
// Seed settings before the app loads.
const settings = { settings: { quality: args.quality || 'high', sound: false, autoGas: false, showFps: false }, coins: 0, best: {}, races: 0, vehicle: args.vehicle || 'okada', unlocked: ['brt-blue', 'brt-red'], accountPromptDismissed: false };
await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('lagos-racer:v1', ${JSON.stringify(JSON.stringify(settings))});` });
await send('Page.navigate', { url: base + (params.toString() ? '?' + params : '') });
await sleep(2500);
const files = [await shot('menu')];

// Start the race.
await evaluate(`[...document.querySelectorAll('button')].find(b => /RACE/.test(b.textContent)).click()`);
let ready = false;
for (let i = 0; i < 300 && !ready; i++) { await sleep(100); ready = await evaluate('!!(window.__lr && window.__lr.getRace() && window.__lr.getRace().racers.every(r => r.body))'); }
if (!ready) { console.log(JSON.stringify({ error: 'race never became ready', errors, logs: logs.slice(-10) }, null, 2)); done(1); }

const keyHold = String(args.keys || '').split(',').filter(Boolean).map(s => { const [k, r] = s.split(':'); const [a, b] = r.split('-').map(Number); return { k, a, b, down: false }; });
const codeOf = k => ({ ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Space: 'Space', ' ': 'Space' })[k] || ('Key' + k.toUpperCase());
const key = (type, k) => send('Input.dispatchKeyEvent', { type, key: k === 'Space' ? ' ' : k, code: codeOf(k), windowsVirtualKeyCode: { ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Space: 32 }[k] || k.toUpperCase().charCodeAt(0) });

const t0 = Date.now(); const samples = [];
const pendingShots = [...shots];
await evaluate(`window.__fps = { n: 0 }; (function f(){ window.__fps.n++; requestAnimationFrame(f); })();`);
while ((Date.now() - t0) / 1000 < seconds + 3.5) {
  const t = (Date.now() - t0) / 1000 - 3.5; // race time after the countdown (approx.)
  for (const h of keyHold) {
    if (!h.down && t >= h.a && t < h.b) { h.down = true; await key('keyDown', h.k); }
    if (h.down && t >= h.b) { h.down = false; await key('keyUp', h.k); }
  }
  if (pendingShots.length && t >= pendingShots[0]) files.push(await shot('race-' + pendingShots.shift() + 's'));
  const s = await evaluate(`(() => { const r = window.__lr.getRace(); const h = window.__lr.useGame.getState().hud; const n = window.__fps.n; window.__fps.n = 0;
    const gi = window.__lr.state.gl.info.render; return { frames: n, calls: gi.calls, tris: gi.triangles, phase: r.phase, clock: +r.clock.toFixed(1), hud: { pos: h.position, lap: h.lap, speed: Math.round(h.speed), item: h.item, msg: h.message },
      racers: r.racers.map(c => ({ n: c.name, v: c.vehicle.id, d: Math.round(c.progress.distance), lat: +c.progress.lateral.toFixed(1), sp: +c.speed.toFixed(1), laps: c.progress.lapsDone, fx: (c.boost > 0 ? 'B' : '') + (c.slip > 0 ? 'S' : '') + (c.curse > 0 ? 'J' : '') + (c.wobble > 0 ? 'W' : '') + (c.scraping ? '|' : ''), item: c.item })),
      hazards: r.hazards.length }; })()`);
  samples.push({ t: +t.toFixed(1), ...s });
  if (await evaluate('!!window.__lr.useGame.getState().results')) break;
  await sleep(1000);
}
const results = await evaluate('window.__lr.useGame.getState().results');
files.push(await shot('end'));
const fps = samples.slice(2).map(s => s.frames).filter(n => typeof n === 'number');
const line = s => `t=${s.t} fps=${s.frames} calls=${s.calls} tris=${Math.round(s.tris / 1000)}k ${s.phase} clock=${s.clock} hud[P${s.hud.pos} L${s.hud.lap} ${s.hud.speed}kmh${s.hud.item ? " item=" + s.hud.item.kind : ""}${s.hud.msg ? " msg=" + s.hud.msg : ""}] haz=${s.hazards} | ` +
  s.racers.map(r => `${r.v}:d${r.d} lat${r.lat} v${r.sp} L${r.laps}${r.fx ? " " + r.fx : ""}${r.item ? " [" + r.item + "]" : ""}`).join(" | ");
console.log(`size ${W}x${H} avgFps ${fps.length ? (fps.reduce((a, b) => a + b, 0) / fps.length).toFixed(1) : "?"}`);
console.log("errors:", JSON.stringify([...new Set(errors)].slice(0, 10)));
const every = Math.max(1, Math.floor(samples.length / (+args.lines || 12)));
samples.forEach((s, i) => { if (i % every === 0 || i === samples.length - 1) console.log(typeof s.racers === "object" ? line(s) : JSON.stringify(s)); });
console.log("results:", JSON.stringify(results));
console.log("files:", files.join(" "));
ws.close(); done(errors.length ? 2 : 0);
