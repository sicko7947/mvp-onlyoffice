// Multi-instance discriminating export test.
// Loads /multi/base (3 editors: Word/Excel/PPT auto-created), types a DISTINCT
// token into each, then clicks each 💾 export button in turn, capturing each
// download separately. Caller unzips+greps each file: editor N's download must
// contain ONLY its own token, never another editor's — catches a wrong-iframe
// (cross-instance) byte mix-up in getInnerApi's container.closest scoping.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const CHROME='/home/sicko/.cache/puppeteer/chrome/linux-143.0.7499.40/chrome-linux64/chrome';
const URL='http://localhost:3001/multi/base';
const PORT=9470;
const DL='/tmp/oo-multi-dl';
const T1='MULTIWORDAAA', T2='MULTIXLBBB', T3='MULTIPPTCCC';
fs.rmSync(DL,{recursive:true,force:true});fs.mkdirSync(DL,{recursive:true});
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const proc=spawn(CHROME,['--headless=new',`--remote-debugging-port=${PORT}`,'--no-sandbox','--disable-gpu','--window-size=2400,1300',`--user-data-dir=/tmp/oo-me-${PORT}`,'about:blank'],{stdio:['ignore','ignore','ignore']});
async function ws(){for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const p=(await r.json()).find(t=>t.type==='page');if(p?.webSocketDebuggerUrl)return p.webSocketDebuggerUrl;}catch{}await sleep(200);}throw new Error('no ws');}
const sock=new WebSocket(await ws());let id=0;const pend=new Map();
const send=(m,p={})=>{const mid=++id;sock.send(JSON.stringify({id:mid,method:m,params:p}));return new Promise(r=>pend.set(mid,r));};
const log=(...a)=>console.log(...a);
await new Promise(r=>sock.onopen=r);
sock.onmessage=(ev)=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}};
await send('Runtime.enable');await send('Page.enable');await send('DOM.enable');
const ev=async(b)=>{const r=await send('Runtime.evaluate',{expression:`(function(){${b}})()`,returnByValue:true});return r?.result?.value;};
async function key(ch){const up=ch.toUpperCase();const code=up.charCodeAt(0);const base={key:ch,code:`Key${up}`,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code};
  await send('Input.dispatchKeyEvent',{type:'rawKeyDown',...base});await send('Input.dispatchKeyEvent',{type:'char',text:ch,unmodifiedText:ch,...base});await send('Input.dispatchKeyEvent',{type:'keyUp',...base});await sleep(70);}
async function type(s){for(const c of s)await key(c);}
async function enter(){await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});await sleep(200);}
async function click(x,y){await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});await sleep(250);}
async function dblclick(x,y){await click(x,y);await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:2});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:2});await sleep(300);}

await send('Page.navigate',{url:URL});await sleep(26000);
await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:DL,eventsEnabled:true}).catch(()=>{});
await send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:DL}).catch(()=>{});

// Word (editor-1): iframe x257 y141 w697 -> body click
await click(607,330);await sleep(200);await type(T1);await sleep(400);
log('typed Word:',T1);
// Excel (editor-2): iframe x972 -> double-click a cell, type, Enter
await dblclick(1110,310);await type(T2);await enter();await sleep(400);
log('typed Excel:',T2);
// PPT (editor-3): iframe x1686 -> double-click title placeholder (replaces prompt text)
await dblclick(2031,471);await type(T3);await sleep(400);
log('typed PPT:',T3);

// helper: click Nth 💾 button, wait for a NEW settled file, rename with prefix
async function exportNth(n,prefix){
  const before=new Set(fs.readdirSync(DL));
  const r=await ev(`const bs=[...document.querySelectorAll('button')].filter(b=>b.textContent&&b.textContent.includes('💾'));if(bs[${n}]){bs[${n}].click();return 'clicked '+bs.length;}return 'no-btn '+bs.length;`);
  log('save#'+n,r);
  for(let i=0;i<50;i++){await sleep(500);const cur=fs.readdirSync(DL).filter(f=>!f.endsWith('.crdownload')&&!before.has(f));if(cur.length){const f=cur[0];const sz=fs.statSync(`${DL}/${f}`).size;if(sz>0){await sleep(500);const dest=`${DL}/${prefix}__${f}`;fs.renameSync(`${DL}/${f}`,dest);return {f,sz,dest};}}}
  return null;
}
const e1=await exportNth(0,'e1');log('export1:',JSON.stringify(e1));
const e2=await exportNth(1,'e2');log('export2:',JSON.stringify(e2));
const e3=await exportNth(2,'e3');log('export3:',JSON.stringify(e3));
log('FILES:',fs.readdirSync(DL).join(' | '));
try{proc.kill('SIGKILL');}catch{}process.exit(0);
