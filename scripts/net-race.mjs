// Run an online race between several headless Chrome tabs and check they all see the same standings.
// Usage: node scripts/net-race.mjs [options]
//   --tabs=3                       how many players (2-6)
//   --lag=250 --jitter=80 --loss=5 fake a bad network in every tab (ms, ms, percent)
//   --url=http://localhost:5175/   game URL; the dev server must already be running
//                                  (npx vite --port 5175 --strictPort)
//   --timeout=300                  seconds to wait for the results
//   --gpu                          try the real GPU instead of SwiftShader
// Spawns `npm run server` itself and stops it on the way out. Exits 0 only if every tab shows identical standings.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const base = args.url || 'http://localhost:5175/';
const tabs = Math.min(6, Math.max(2, +(args.tabs || 3)));
const timeout = +(args.timeout || 300);
const lagParams = ['lag', 'jitter', 'loss'].filter(k => args[k] !== undefined).map(k => `${k}=${args[k]}`);

const sleep = ms => new Promise(r => setTimeout(r, ms));
const exe = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const profile = mkdtempSync(path.join(tmpdir(), 'lr-net-'));
const gl = args.gpu ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');

// Same as `npm run server`, but as one plain node process so killing it really stops the server.
const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', d => { serverLog += d; });
server.stderr.on('data', d => { serverLog += d; });
const browser = spawn(exe, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--window-size=800,450',
  '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows', ...gl, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });

let finished = false;
const done = code => {
  if (finished) return;
  finished = true;
  try { browser.kill(); } catch { /* already gone */ }
  try { server.kill(); } catch { /* already gone */ }
  setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch { /* chrome may still hold files */ } process.exit(code); }, 1000);
};
process.on('SIGINT', () => done(1));
const fail = msg => { console.error(msg); done(1); return new Promise(() => {}); };
process.on('unhandledRejection', e => { console.error(e); done(1); });

let port;
for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim(); } catch { /* not yet */ } }
if (!port) await fail('browser did not start');
const ws = new WebSocket((await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') errors.push(`tab ${m.sessionId?.slice(0, 4)}: ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
};
const send = (method, params = {}, sessionId) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });

// Wait for the room server to listen before anyone tries to connect.
for (let i = 0; i < 100 && !/listen/i.test(serverLog); i++) await sleep(100);
if (!/listen/i.test(serverLog)) await fail(`room server did not start:\n${serverLog}`);

const settings = { settings: { quality: 'low', sound: false, autoGas: false, showFps: false }, coins: 0, best: {}, races: 0, vehicle: 'okada', unlocked: [], accountPromptDismissed: false };
const query = new URLSearchParams(['autopilot=1', ...lagParams].join('&')).toString();
const players = [];
for (let i = 0; i < tabs; i++) {
  const { result } = await send('Target.createTarget', { url: 'about:blank', newWindow: true, width: 800, height: 450 });
  const { result: att } = await send('Target.attachToTarget', { targetId: result.targetId, flatten: true });
  const sid = att.sessionId;
  const p = { name: `P${i + 1}`, sid, ev: async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }, sid); return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description; } };
  await send('Runtime.enable', {}, sid); await send('Page.enable', {}, sid);
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }, sid);
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `localStorage.setItem('lagos-racer:v1', ${JSON.stringify(JSON.stringify(settings))});` }, sid);
  await send('Page.navigate', { url: `${base}?${query}` }, sid);
  players.push(p);
}
const waitFor = async (what, fn, secs = 30) => {
  for (let i = 0; i < secs * 10; i++) { if (await fn()) return; await sleep(100); }
  await fail(`timed out waiting for ${what}`);
};
const net = expr => `window.__lrNet && window.__lrNet.getState()${expr}`;

await waitFor('the game to load', async () => (await Promise.all(players.map(p => p.ev('!!window.__lrNet')))).every(Boolean));
const [host, ...guests] = players;
await host.ev(`window.__lrNet.getState().create('P1', 'okada')`);
await waitFor('the room code', async () => !!(await host.ev(net('.code'))));
const code = await host.ev(net('.code'));
console.log(`room ${code}, ${tabs} tabs${lagParams.length ? `, ${lagParams.join(' ')}` : ''}`);
for (const g of guests) await g.ev(`window.__lrNet.getState().join('${code}', '${g.name}', 'okada')`);
await waitFor('everyone to join', async () => (await host.ev(net('.room?.players.length'))) === tabs);
for (const p of players) await p.ev(`window.__lrNet.getState().setReady(true)`);
await waitFor('everyone ready', async () => (await host.ev(net('.room?.players.every(p => p.ready)'))) === true);
await host.ev(`window.__lrNet.getState().start()`);
const t0 = Date.now();
console.log('race started');

const resultsOf = p => p.ev(`(() => { const r = window.__lr.useGame.getState().results; return r && JSON.stringify(r.map(x => ({ name: x.name, time: x.dnf || x.time === null ? 'DNF' : x.time }))); })()`);
let all = [];
while ((Date.now() - t0) / 1000 < timeout) {
  all = await Promise.all(players.map(resultsOf));
  if (all.every(r => typeof r === 'string' && r.startsWith('['))) break;
  all = [];
  await sleep(2000);
}
if (!all.length) {
  const state = await Promise.all(players.map(p => p.ev(`JSON.stringify({ screen: window.__lr.useGame.getState().screen, phase: window.__lr.getRace()?.phase, clock: window.__lr.getRace()?.clock, net: window.__lrNet.getState().status })`)));
  console.error(`no results in every tab after ${timeout}s`, state, errors.slice(0, 5));
  await fail('FAIL');
}

all.forEach((r, i) => console.log(`${players[i].name}: ${r}`));
const same = all.every(r => r === all[0]);
if (errors.length) console.log('page errors:', [...new Set(errors)].slice(0, 5));
console.log(same ? `PASS: identical standings in all ${tabs} tabs (${((Date.now() - t0) / 1000).toFixed(0)}s)` : 'FAIL: standings differ between tabs');
ws.close();
done(same ? 0 : 1);
