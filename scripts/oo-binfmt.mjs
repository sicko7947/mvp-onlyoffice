// Compare editorConfig.binData (x2t raw bin, known-good for convertBinToDocument)
// against asc_nativeGetFile decoded bytes. Decides whether x2t wants the
// "DOCY;v5;size;" ASCII header or raw binary.
// args: URL FILE PORToff
import { spawn } from 'node:child_process';
const CHROME='/home/sicko/.cache/puppeteer/chrome/linux-143.0.7499.40/chrome-linux64/chrome';
const URL=process.argv[2]||'http://localhost:3001/docs/base';
const FILE=process.argv[3]||'-';
const PORT=9270+(Number(process.argv[4])||0);
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const proc=spawn(CHROME,['--headless=new',`--remote-debugging-port=${PORT}`,'--no-sandbox','--disable-gpu','--window-size=1400,900',`--user-data-dir=/tmp/oo-bf-${PORT}`,'about:blank'],{stdio:['ignore','ignore','ignore']});
async function ws(){for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const p=(await r.json()).find(t=>t.type==='page');if(p?.webSocketDebuggerUrl)return p.webSocketDebuggerUrl;}catch{}await sleep(200);}throw new Error('no ws');}
const sock=new WebSocket(await ws());let id=0;const pend=new Map();
const send=(m,p={})=>{const mid=++id;sock.send(JSON.stringify({id:mid,method:m,params:p}));return new Promise(r=>pend.set(mid,r));};
const log=(...a)=>console.log(...a);
await new Promise(r=>sock.onopen=r);
sock.onmessage=(ev)=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}};
await send('Runtime.enable');await send('Page.enable');await send('DOM.enable');
const ev=async(b)=>{const r=await send('Runtime.evaluate',{expression:`(function(){${b}})()`,returnByValue:true});return r?.result?.value;};
function fi(n){if(n.nodeName==='INPUT'&&(n.attributes||[]).join(' ').includes('file'))return n.nodeId;for(const c of n.children||[]){const r=fi(c);if(r)return r;}return null;}
await send('Page.navigate',{url:URL});await sleep(8000);
if(FILE!=='-'){const doc=await send('DOM.getDocument',{depth:-1});const inp=fi(doc.root);if(inp)await send('DOM.setFileInputFiles',{files:[FILE],nodeId:inp});await sleep(16000);}else{await sleep(14000);}

log('editorConfig.binData head:', await ev(`
  const m=window.editorManager; const cfg=m&&m.editorConfig;
  if(!cfg) return 'no-cfg';
  const b=cfg.binData;
  if(b==null) return 'binData null';
  if(typeof b==='string') return JSON.stringify({kind:'string', len:b.length, head:b.slice(0,24)});
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  const head=[...u.slice(0,24)].map(c=>String.fromCharCode(c)).join('');
  return JSON.stringify({kind:'bytes', len:u.length, headAscii:head, headCodes:[...u.slice(0,8)]});
`));
log('nativeGetFile head:', await ev(`
  const ifr=document.querySelector('iframe');const w=ifr&&ifr.contentWindow;const api=w&&(w.editor||(w.Asc&&w.Asc.editor));
  if(!api) return 'no-api';
  const s=api.asc_nativeGetFile();
  return JSON.stringify({len:s.length, head:s.slice(0,24)});
`));
try{proc.kill('SIGKILL');}catch{}process.exit(0);
