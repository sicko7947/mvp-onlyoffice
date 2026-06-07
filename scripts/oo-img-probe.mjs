// Diagnostic + in-page capture for Word/Excel image round-trip.
// Uploads an image-bearing file, edits (token), then drives the page export
// pipeline IN-PAGE (export()->convertBinToDocument) and writes the resulting
// office bytes to disk via base64 — bypassing the flaky browser download path.
// args: URL  FILE  TOKEN  "x,y"  PORToffset  OUT
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const CHROME='/home/sicko/.cache/puppeteer/chrome/linux-143.0.7499.40/chrome-linux64/chrome';
const URL=process.argv[2], FILE=process.argv[3], TOKEN=process.argv[4]||'IMGTK';
const CLICK=(process.argv[5]||'600,430').split(',').map(Number);
const PORT=9300+(Number(process.argv[6])||0);
const OUT=process.argv[7]||'/tmp/oo-img-out.bin';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const proc=spawn(CHROME,['--headless=new',`--remote-debugging-port=${PORT}`,'--no-sandbox','--disable-gpu','--window-size=1400,900',`--user-data-dir=/tmp/oo-probe-${PORT}`,'about:blank'],{stdio:['ignore','ignore','ignore']});
async function ws(){for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const p=(await r.json()).find(t=>t.type==='page');if(p?.webSocketDebuggerUrl)return p.webSocketDebuggerUrl;}catch{}await sleep(200);}throw new Error('no ws');}
const sock=new WebSocket(await ws());let id=0;const pend=new Map();
const send=(m,p={})=>{const mid=++id;sock.send(JSON.stringify({id:mid,method:m,params:p}));return new Promise(r=>pend.set(mid,r));};
const log=(...a)=>console.log(...a);
await new Promise(r=>sock.onopen=r);
sock.onmessage=(ev)=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}};
await send('Runtime.enable');await send('Page.enable');await send('DOM.enable');
const ev=async(b,awaitP=false)=>{const r=await send('Runtime.evaluate',{expression:`(async function(){${b}})()`,returnByValue:true,awaitPromise:true});if(r?.exceptionDetails)return 'EXC:'+JSON.stringify(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r?.result?.value;};
function fi(n){if(n.nodeName==='INPUT'&&(n.attributes||[]).join(' ').includes('file'))return n.nodeId;for(const c of n.children||[]){const r=fi(c);if(r)return r;}return null;}
async function key(ch){const up=ch.toUpperCase();const code=up.charCodeAt(0);const base={key:ch,code:`Key${up}`,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code};
  await send('Input.dispatchKeyEvent',{type:'rawKeyDown',...base});await send('Input.dispatchKeyEvent',{type:'char',text:ch,unmodifiedText:ch,...base});await send('Input.dispatchKeyEvent',{type:'keyUp',...base});await sleep(80);}
async function dblclick(x,y){await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});await sleep(80);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:2});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:2});await sleep(250);}

await send('Page.navigate',{url:URL});await sleep(9000);
const doc=await send('DOM.getDocument',{depth:-1});const inp=fi(doc.root);
if(!inp){log('NO FILE INPUT');proc.kill('SIGKILL');process.exit(1);}
await send('DOM.setFileInputFiles',{files:[FILE],nodeId:inp});
await sleep(18000);
// DIAGNOSTIC: did it load?
log('EXISTS:', await ev(`const m=window.editorManager;return m?(''+m.exists()):'no-manager';`));
log('EXPORT_BTN:', await ev(`return [...document.querySelectorAll('button')].some(b=>b.textContent&&b.textContent.includes('导出'))?'present':'absent';`));
// edit (modify-then-download)
await dblclick(CLICK[0],CLICK[1]);for(const c of TOKEN)await key(c);await sleep(500);
// Drive export pipeline IN-PAGE: replicate the 导出 button handler, capture bytes.
// convertBinToDocument is a module import in the page closure; we reach it by
// clicking the real button but intercepting URL.createObjectURL to grab the blob.
await ev(`
  window.__cap=null;
  const orig=URL.createObjectURL.bind(URL);
  URL.createObjectURL=function(blob){ window.__capBlob=blob; return orig(blob); };
  return 'hooked';
`);
const clicked=await ev(`
  const b=[...document.querySelectorAll('button')].find(x=>x.textContent&&x.textContent.includes('导出'));
  if(!b)return 'no-btn'; b.click(); return 'clicked';
`);
log('CLICK:',clicked);
await sleep(4000);
// read captured blob bytes as base64
const b64=await ev(`
  const bl=window.__capBlob; if(!bl)return 'NO-BLOB';
  const buf=new Uint8Array(await bl.arrayBuffer());
  let s=''; const CH=0x8000; for(let i=0;i<buf.length;i+=CH){s+=String.fromCharCode.apply(null,buf.subarray(i,i+CH));}
  return 'OK:'+buf.length+':'+btoa(s);
`);
if(typeof b64==='string'&&b64.startsWith('OK:')){
  const [,len,data]=b64.split(/:(.*)/s)[0]==='OK'?['','',''] :[];
  const parts=b64.split(':'); const L=parts[1]; const payload=b64.slice(('OK:'+L+':').length);
  fs.writeFileSync(OUT,Buffer.from(payload,'base64'));
  log('WROTE',OUT,'len',L);
}else{log('CAPTURE FAIL:',typeof b64==='string'?b64.slice(0,200):b64);}
try{proc.kill('SIGKILL');}catch{}process.exit(0);
