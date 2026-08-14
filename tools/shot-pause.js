// 일시정지 화면만 찍는다(시안 대조용). 값은 시안과 같은 숫자로 고정한다.
//   CHROME=... node shot-pause.js <url> <w> <h> <out.png>
const { spawn } = require('child_process');
const fs = require('fs');
const CHROME = process.env.CHROME;
const [, , URL_, Ws, Hs, OUT] = process.argv;
const W = Number(Ws || 390), H = Number(Hs || 844);
const PORT = 9600 + Math.floor(Math.random() * 300);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new','--disable-gpu','--no-sandbox','--hide-scrollbars',
  '--force-device-scale-factor=2', `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`, 'about:blank'],
  { env: { ...process.env, LD_LIBRARY_PATH: process.env.HOME + '/.local/emulib' } });
(async () => {
  let ws;
  for (let i = 0; i < 60; i++) {
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r=>r.json());
      const p = l.find(t=>t.type==='page'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; } } catch {}
    await sleep(200);
  }
  if (!ws) { console.error('크롬 연결 실패'); chrome.kill(); process.exit(1); }
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pend = new Map(); let loaded = false;
  ws.addEventListener('message', e => { const m = JSON.parse(e.data);
    if (m.method === 'Page.loadEventFired') loaded = true;
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } });
  const cmd = (m, p={}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({id:i,method:m,params:p})); });
  const evalJS = async expr => {
    const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) console.error('JS 오류:', JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails));
    return r.result?.value;
  };
  await cmd('Page.enable'); await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true });
  await cmd('Page.navigate', { url: URL_ });
  for (let i = 0; i < 60 && !loaded; i++) await sleep(100);
  await sleep(1200);
  await evalJS(`(()=>{ try{ Object.keys(localStorage).filter(k=>k.startsWith('opbricks.save.')).forEach(k=>localStorage.removeItem(k)); }catch(e){} ; enterGame(); return 1; })()`);
  await sleep(1500);
  // 시안과 같은 숫자로 맞춰 글자 길이까지 대조할 수 있게 한다
  // 값은 S 에 넣고 setPaused 를 그대로 태운다(자릿수 등급까지 실제 코드가 붙게).
  // 공격력만 게임 진행에서 나오는 값이라 뒤에서 시안 숫자로 갈아 끼운다.
  // 값은 S 에 넣고 setPaused 를 그대로 태운다(자릿수 등급까지 실제 코드가 붙게).
  // 공격력만 게임 진행에서 나오는 값이라 뒤에서 시안 숫자로 갈아 끼운다.
  // 환경변수 SC/RD/BK/PW 로 바꿔가며 잴 수 있다(Node 쪽에서 미리 끼워 넣는다).
  const V = { SC: process.env.SC || 22914, RD: process.env.RD || 18,
              BK: process.env.BK || 3, PW: process.env.PW || '478' };
  await evalJS(`(()=>{ S.score=${V.SC}; S.round=${V.RD}; S.bossKills=${V.BK}; setPaused(true);
    pausePower.textContent='${V.PW}'; pausePower.className=''; return 1; })()`);
  await sleep(700);
  const box = await evalJS(`JSON.stringify((()=>{const b=document.querySelector('.pauseCard').getBoundingClientRect();
    return {w:Math.round(b.width),h:Math.round(b.height),x:Math.round(b.left),y:Math.round(b.top),vp:innerWidth+'x'+innerHeight};})())`);
  console.log(box);
  const shot = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log('저장:', OUT);
  chrome.kill(); process.exit(0);
})();
