const { spawn } = require('child_process');
const CHROME = process.env.CHROME;
const [, , URL_, Ws, Hs, ...clicks] = process.argv;
const W = Number(Ws || 1200), H = Number(Hs || 900);
const PORT = 9700 + Math.floor(Math.random() * 200);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--no-sandbox','--hide-scrollbars',
  '--force-device-scale-factor=1',`--remote-debugging-port=${PORT}`,`--window-size=${W},${H}`,'about:blank'],
  { env: { ...process.env, LD_LIBRARY_PATH: process.env.HOME + '/.local/emulib' } });
(async () => {
  let ws;
  for (let i=0;i<60;i++){ try{
    const l=await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r=>r.json());
    const p=l.find(t=>t.type==='page'); if(p){ws=new WebSocket(p.webSocketDebuggerUrl);break;}
  }catch{} await sleep(200); }
  await new Promise(r=>ws.addEventListener('open',r));
  let id=0; const pend=new Map(); let loaded=false;
  ws.addEventListener('message',e=>{const m=JSON.parse(e.data);
    if(m.method==='Page.loadEventFired')loaded=true;
    if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}});
  const cmd=(m,p={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}));});
  const js=async e=>(await cmd('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true})).result?.value;
  await cmd('Page.enable'); await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride',{width:W,height:H,deviceScaleFactor:1,mobile:W<500});
  await cmd('Page.navigate',{url:URL_});
  for(let i=0;i<60&&!loaded;i++) await sleep(100);
  await sleep(1200);
  for (const c of clicks){ await js(`document.getElementById(${JSON.stringify(c)})?.click(),1`); await sleep(800); }
  await sleep(400);
  const out = await js(`JSON.stringify((()=>{
    const rows=[];
    const walk=(el,d)=>{
      for(const c of el.children){
        const cs=getComputedStyle(c), b=c.getBoundingClientRect();
        const vis = cs.visibility!=='hidden' && cs.display!=='none' && +cs.opacity>0.05 && b.width>0 && b.height>0;
        if(vis){
          const txt=(c.childElementCount===0?c.textContent:'').trim().slice(0,22);
          rows.push({t:c.tagName.toLowerCase()+(c.id?'#'+c.id:'')+(c.className&&typeof c.className==='string'?'.'+c.className.split(' ')[0]:''),
                     x:Math.round(b.left),y:Math.round(b.top),w:Math.round(b.width),h:Math.round(b.height),txt});
          walk(c,d+1);
        }
      }
    };
    walk(document.body,0);
    return rows;
  })())`);
  const rows = JSON.parse(out);
  console.log('요소  '.padEnd(34)+'x    y     w    h    텍스트');
  for(const r of rows) console.log(
    r.t.slice(0,33).padEnd(34)+String(r.x).padStart(4)+String(r.y).padStart(6)+
    String(r.w).padStart(6)+String(r.h).padStart(5)+'  '+r.txt);
  chrome.kill(); process.exit(0);
})();
