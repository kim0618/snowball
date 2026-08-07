const { spawn } = require('child_process');
const CHROME = process.env.CHROME;
const [, , URL_, EXPR, Ws, Hs] = process.argv;
const W=Number(Ws||1400), H=Number(Hs||900), PORT=9800+Math.floor(Math.random()*180);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ch=spawn(CHROME,['--headless=new','--disable-gpu','--no-sandbox','--hide-scrollbars',
 `--remote-debugging-port=${PORT}`,`--window-size=${W},${H}`,'about:blank'],
 {env:{...process.env,LD_LIBRARY_PATH:process.env.HOME+'/.local/emulib'}});
(async()=>{let ws;for(let i=0;i<60;i++){try{const l=await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r=>r.json());
 const p=l.find(t=>t.type==='page');if(p){ws=new WebSocket(p.webSocketDebuggerUrl);break;}}catch{}await sleep(200);}
 await new Promise(r=>ws.addEventListener('open',r));
 let id=0;const pend=new Map();let loaded=false;
 ws.addEventListener('message',e=>{const m=JSON.parse(e.data);
  if(m.method==='Page.loadEventFired')loaded=true;
  if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}});
 const cmd=(m,p={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}));});
 await cmd('Page.enable');await cmd('Runtime.enable');
 await cmd('Emulation.setDeviceMetricsOverride',{width:W,height:H,deviceScaleFactor:1,mobile:W<500});
 await cmd('Page.navigate',{url:URL_});
 for(let i=0;i<60&&!loaded;i++)await sleep(100); await sleep(1500);
 const r=await cmd('Runtime.evaluate',{expression:EXPR,returnByValue:true,awaitPromise:true});
 console.log(typeof r.result?.value==='object'?JSON.stringify(r.result.value,null,1):r.result?.value);
 if(r.exceptionDetails) console.log('오류:', JSON.stringify(r.exceptionDetails.exception));
 ch.kill();process.exit(0);})();
