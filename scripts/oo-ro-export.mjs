// Test: edit -> toggle read-only -> export. Does the edit survive?
// args: URL FILE(or -) TOKEN "x,y" PORToff
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const CHROME='/home/sicko/.cache/puppeteer/chrome/linux-143.0.7499.40/chrome-linux64/chrome';
const URL=process.argv[2]||'http://localhost:3001/docs/base';
const FILE=process.argv[3]||'-';
const TOKEN=process.argv[4]||'ROTOKEN';
const CLICK=(process.argv[5]||'600,420').split(',').map(Number);
const PORT=9450+(Number(process.argv[6])||0);
const DL='/tmp/oo-dl';
fs.rmSync(DL,{recursive:true,force:true});fs.mkdirSync(DL,{recursive:true});
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const proc=spawn(CHROME,['--headless=new',`--remote-debugging-port=${PORT}`,'--no-sandbox','--disable-gpu','--window-size=1400,900',`--user-data-dir=/tmp/oo-ro-${PORT}`,'about:blank'],{stdio:['ignore','ignore','ignore']});
async function ws(){for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${PORT}/json/list`);const p=(await r.json()).find(t=>t.type==='page');if(p?.webSocketDebuggerUrl)return p.webSocketDebuggerUrl;}catch{}await sleep(200);}throw new Error('no ws');}
const sock=new WebSocket(await ws());let id=0;const pend=new Map();
const send=(m,p={})=>{const mid=++id;sock.send(JSON.stringify({id:mid,method:m,params:p}));return new Promise(r=>pend.set(mid,r));};
const log=(...a)=>console.log(...a);
await new Promise(r=>sock.onopen=r);
sock.onmessage=(ev)=>{const m=JSON.parse(ev.data);if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}};
await send('Runtime.enable');await send('Page.enable');await send('DOM.enable');
const ev=async(b)=>{const r=await send('Runtime.evaluate',{expression:`(function(){${b}})()`,returnByValue:true});return r?.result?.value;};
function fi(n){if(n.nodeName==='INPUT'&&(n.attributes||[]).join(' ').includes('file'))return n.nodeId;for(const c of n.children||[]){const r=fi(c);if(r)return r;}return null;}
async function key(ch){const up=ch.toUpperCase();const code=up.charCodeAt(0);const base={key:ch,code:`Key${up}`,windowsVirtualKeyCode:code,nativeVirtualKeyCode:code};
  await send('Input.dispatchKeyEvent',{type:'rawKeyDown',...base});await send('Input.dispatchKeyEvent',{type:'char',text:ch,unmodifiedText:ch,...base});await send('Input.dispatchKeyEvent',{type:'keyUp',...base});await sleep(90);}
async function type(s){for(const c of s)await key(c);}
async function dblclick(x,y){await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});await sleep(80);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:2});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:2});await sleep(250);}
await send('Page.navigate',{url:URL});await sleep(8000);
if(FILE!=='-'){const doc=await send('DOM.getDocument',{depth:-1});const inp=fi(doc.root);if(inp)await send('DOM.setFileInputFiles',{files:[FILE],nodeId:inp});await sleep(16000);}else{await sleep(14000);}
await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:DL,eventsEnabled:true}).catch(()=>{});
await send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:DL}).catch(()=>{});
// edit
await dblclick(CLICK[0],CLICK[1]);await type(TOKEN);await sleep(400);
await send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
await sleep(500);
log('typed token:',TOKEN);
// toggle to read-only (button text contains 编辑模式 when currently editable)
const toggled=await ev(`const b=[...document.querySelectorAll('button')].find(x=>x.textContent&&x.textContent.includes('编辑模式'));if(!b)return'no-toggle-btn';b.click();return'toggled-to-readonly';`);
log('toggle:',toggled);
await sleep(2500);
// export
const clicked=await ev(`const b=[...document.querySelectorAll('button')].find(x=>x.textContent&&x.textContent.includes('导出'));if(!b)return'no-export-btn';b.click();return'clicked';`);
log('export button:',clicked);
let found=null;
for(let i=0;i<40;i++){await sleep(500);const fl=fs.readdirSync(DL).filter(f=>!f.endsWith('.crdownload'));if(fl.length){found=fl[0];const sz=fs.statSync(`${DL}/${found}`).size;if(sz>0){await sleep(500);break;}}}
log('downloaded:',found,found?fs.statSync(`${DL}/${found}`).size+' bytes':'');
try{proc.kill('SIGKILL');}catch{}process.exit(0);
