// 크롬 원격 디버깅으로 실제 페이지를 열어 레이아웃을 재고 스크린샷을 찍는다.
//   node shot.js <url> <w> <h> <out.png> [클릭할id ...]
const { spawn } = require('child_process');
const fs = require('fs');

const CHROME = process.env.CHROME;
const [, , URL_, Ws, Hs, OUT, ...clicks] = process.argv;
const W = Number(Ws || 1200), H = Number(Hs || 900);
const PORT = 9400 + Math.floor(Math.random() * 300);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--force-device-scale-factor=1',
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
  const evalJS = async expr => (await cmd('Runtime.evaluate',
    { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;

  await cmd('Page.enable');
  await cmd('Runtime.enable');
  await cmd('Emulation.setDeviceMetricsOverride',
    { width: W, height: H, deviceScaleFactor: 1, mobile: W < 500 });
  await cmd('Page.navigate', { url: URL_ });
  for (let i = 0; i < 60 && !loaded; i++) await sleep(100);
  await sleep(1200);

  // 요청한 버튼을 순서대로 눌러 원하는 화면까지 이동
  for (const cid of clicks) {
    await evalJS(`document.getElementById(${JSON.stringify(cid)})?.click(), 1`);
    await sleep(700);
  }
  await sleep(500);

  const info = await evalJS(`JSON.stringify((()=>{
    const o = { href: location.href, title: document.title };
    for (const id of ['frame','app','titleScreen','lobby','namePanel','stage','game']) {
      const el = document.getElementById(id);
      if (!el) { o[id] = null; continue; }
      const b = el.getBoundingClientRect(), cs = getComputedStyle(el);
      o[id] = { w: Math.round(b.width), h: Math.round(b.height),
                x: Math.round(b.left), y: Math.round(b.top),
                r: +(b.width / b.height).toFixed(3),
                vis: cs.visibility, op: +cs.opacity,
                bg: (cs.backgroundImage.match(/[^/"]+\\.webp/) || ['-'])[0] };
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
