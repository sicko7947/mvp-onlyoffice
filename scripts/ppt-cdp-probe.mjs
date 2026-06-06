// Headless-CDP probe: load a URL, capture console / exceptions / JS dialogs / 404s,
// surviving a renderer freeze (the page-level alert() parks the JS thread).
import { spawn } from 'node:child_process';

const CHROME = '/home/sicko/.cache/puppeteer/chrome/linux-143.0.7499.40/chrome-linux64/chrome';
const URL = process.argv[2] || 'http://localhost:3001/ppt/base';
const PORT = 9222;
const RUN_MS = 35000;

const proc = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  '--no-sandbox',
  '--disable-gpu',
  '--window-size=1400,900',
  '--user-data-dir=/tmp/ppt-cdp-profile',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore'] });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const tabs = await r.json();
      const page = tabs.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error('no devtools ws');
}

const wsUrl = await getWsUrl();
const ws = new WebSocket(wsUrl);
let id = 0;
const pending = new Map();
const send = (method, params = {}) => {
  const mid = ++id;
  ws.send(JSON.stringify({ id: mid, method, params }));
  return new Promise((res) => pending.set(mid, res));
};

const log = (...a) => console.log(...a);

await new Promise((res) => (ws.onopen = res));

ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
  const { method, params } = m;
  if (method === 'Runtime.consoleAPICalled') {
    const txt = (params.args || []).map((a) => a.value ?? a.description ?? a.unserializableValue ?? JSON.stringify(a.preview?.properties?.map(p=>p.value)) ?? '').join(' ');
    log(`[console.${params.type}] ${txt}`);
  } else if (method === 'Runtime.exceptionThrown') {
    const d = params.exceptionDetails;
    log(`[EXCEPTION] ${d.exception?.description || d.text} @ ${d.url}:${d.lineNumber}`);
  } else if (method === 'Log.entryAdded') {
    const e = params.entry;
    if (e.level === 'error' || e.level === 'warning') log(`[log.${e.level}] ${e.text} ${e.url||''}`);
  } else if (method === 'Page.javascriptDialogOpening') {
    log(`\n>>> JS DIALOG (${params.type}): ${JSON.stringify(params.message)}\n`);
    send('Page.handleJavaScriptDialog', { accept: true });
  } else if (method === 'Network.requestWillBeSent') {
    log(`[net ->] ${params.request.url}`);
  } else if (method === 'Network.responseReceived') {
    const s = params.response.status;
    if (s >= 400) log(`[net ${s}] ${params.response.url}`);
  }
};

await send('Runtime.enable');
await send('Log.enable');
await send('Network.enable');
await send('Page.enable');
log(`=== navigating to ${URL} ===`);
await send('Page.navigate', { url: URL });

await sleep(RUN_MS);
// Responsiveness probe: if the renderer JS thread is frozen, this never resolves.
log('=== testing renderer responsiveness (5s timeout) ===');
const alive = await Promise.race([
  send('Runtime.evaluate', { expression: '1+1', returnByValue: true }).then((r) => `RESPONSIVE result=${JSON.stringify(r?.result?.value)}`),
  sleep(5000).then(() => 'FROZEN (evaluate timed out)'),
]);
log(`>>> ${alive}`);
log('=== done, killing chrome ===');
try { proc.kill('SIGKILL'); } catch {}
process.exit(0);
