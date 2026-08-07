// 게임 본편 화면을 찍는다. 로그인 없이 enterGame() 을 직접 불러 바로 게임판으로 들어간다.
//   CHROME=... node shot-game.js <url> <w> <h> <out.png> [추가로_평가할_JS]
// 시안 대조용이라 눈 내리는 위치까지 매번 달라지면 곤란해서, 찍기 전에 한 프레임으로 고정한다.
const { spawn } = require('child_process');
const fs = require('fs');

const CHROME = process.env.CHROME;
const [, , URL_, Ws, Hs, OUT, EXTRA] = process.argv;
const W = Number(Ws || 390), H = Number(Hs || 844);
const PORT = 9500 + Math.floor(Math.random() * 300);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--force-device-scale-factor=2',
  `--remote-debugging-port=${PORT}`, `--window-size=${W},${H}`, 'about:blank',
], { env: { ...process.env, LD_LIBRARY_PATH: process.env.HOME + '/.local/emulib' } });

(async () => {
  let ws;
  for (let i = 0; i < 60; i++) {
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const page = list.find(t => t.type === 'page');
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
    } catch {}
    await sleep(200);
  }
  if (!ws) { console.error('크롬 연결 실패'); chrome.kill(); process.exit(1); }
  await new Promise(r => ws.addEventListener('open', r));

  let id = 0; const pending = new Map(); let loaded = false;
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Page.loadEventFired') loaded = true;
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  });
  const cmd = (method, params = {}) => new Promise(res => {
    const i = ++id; pending.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evalJS = async expr => {
    const r = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) console.error('JS 오류:', JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails));
    return r.result?.value;
  };

  await cmd('Page.enable');
  await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride',
    { width: W, height: H, deviceScaleFactor: 2, mobile: true });
  await cmd('Page.navigate', { url: URL_ });
  for (let i = 0; i < 60 && !loaded; i++) await sleep(100);
  await sleep(1200);

  // 저장된 판이 있으면 그걸 이어받아 화면이 매번 달라지므로 지우고 새 판으로 고정
  await evalJS(`(()=>{ try{ Object.keys(localStorage).filter(k=>k.startsWith('opbricks.save.')).forEach(k=>localStorage.removeItem(k)); }catch(e){} ; enterGame(); return 1; })()`);
  await sleep(1500);
  if (EXTRA) { await evalJS(EXTRA); await sleep(600); }

  const info = await evalJS(`JSON.stringify((()=>{
    const o = { round: hudRound?.textContent, score: hudScore?.textContent, playing: document.body.classList.contains('playing') };
    for (const id of ['app','stage','game']) {
      const el = document.getElementById(id); if (!el) { o[id] = null; continue; }
      const b = el.getBoundingClientRect();
      o[id] = { w: Math.round(b.width), h: Math.round(b.height), y: Math.round(b.top) };
    }
    o.viewport = innerWidth + 'x' + innerHeight;
    return o;
  })())`);
  console.log(info);

  const shot = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log('저장:', OUT);
  chrome.kill(); process.exit(0);
})();
