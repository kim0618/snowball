// 타이틀에서 아이디·비밀번호를 넣고 로그인 버튼을 누르는 흐름을 실제로 재현한다.
// 서버는 진짜 서버를 쓴다 (PORT 환경변수로 지정).
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:8787';
const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const body = html.match(/<script>([\s\S]*)<\/script>/)[1];

// index.html 의 id 들을 그대로 가진 가짜 DOM
const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
const noop = () => {};
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createLinearGradient') return () => ({ addColorStop: noop });
    return typeof t[k] === 'undefined' ? noop : t[k];
  },
  set(t, k, v) { t[k] = v; return true; }
});
const nodes = {};
function mkNode(id) {
  const cls = new Set();
  return {
    id, value: '', textContent: '', innerHTML: '', disabled: false,
    style: { setProperty: noop, getPropertyValue: () => '' }, dataset: {},
    _handlers: {},
    classList: {
      add: c => cls.add(c), remove: c => cls.delete(c),
      toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)),
      contains: c => cls.has(c),
    },
    addEventListener(ev, fn) { (this._handlers[ev] ||= []).push(fn); },
    fire(ev, arg) { (this._handlers[ev] || []).forEach(f => f(arg || {})); },
    setPointerCapture: noop, focus: noop,
    getContext: () => ctxStub,
    querySelector: () => mkNode('tmp'), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 630 }),
    append: noop, appendChild: noop, remove: noop,
    clientWidth: 360, clientHeight: 700, width: 360, height: 630,
    offsetWidth: 360,
  };
}
for (const id of ids) nodes[id] = mkNode(id);

const store = {};
const bodyCls = new Set();
const sandbox = {
  document: {
    getElementById: id => (nodes[id] ||= mkNode(id)),
    createElement: () => mkNode('tmp'),
    createTextNode: text => ({ textContent: text }),
    addEventListener: noop,
    body: { classList: {
      add: c => bodyCls.add(c), remove: c => bodyCls.delete(c),
      contains: c => bodyCls.has(c), toggle: (c,on) => (on?bodyCls.add(c):bodyCls.delete(c)),
    } },
  },
  window: { devicePixelRatio: 1, addEventListener: noop },
  navigator: {},
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  },
  requestAnimationFrame: () => 0,
  setTimeout: (fn) => { try { fn(); } catch (e) {} return 0; },
  clearTimeout: noop,
  performance: { now: () => 0 },
  fetch: (...a) => fetch(...a),
  Math, Date, JSON, Set, Map, Array, Object, Number, String, Boolean, isNaN, console, Promise,
};
sandbox.window.SNOWBALL_API = BASE;       // 클라이언트가 실제 서버를 보게
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(body + ';globalThis.__x={S,LB};', sandbox);
const { S, LB } = sandbox.__x;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// CSS에서 각 패널의 z-index를 읽어온다. classList만 보면
// "열렸지만 다른 화면 뒤에 깔려 안 보이는" 상태를 놓친다.
function zOf(id){
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  const re = new RegExp('#' + id + '\\s*\\{[^}]*z-index:\\s*(\\d+)', 'm');
  const m = css.match(re);
  if (m) return Number(m[1]);
  const veil = css.match(/\.veil\s*\{[^}]*z-index:\s*(\d+)/m);
  return veil ? Number(veil[1]) : 0;
}

(async () => {
  let fail = 0;
  const check = (name, ok, extra='') => {
    if (!ok) fail++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  };

  // 유니크한 테스트 계정
  const uid = 'test' + (Date.now() % 100000);

  // --- 1. 시작하면 타이틀이 떠 있고 게임은 멈춰 있어야 한다 ---
  check('시작 시 타이틀 표시', nodes.titleScreen.classList.contains('show'));
  check('로드 직후 게임판 숨김(새로고침 번쩍임 방지)', !bodyCls.has('playing'));
  check('게임판이 CSS 기본값으로 숨겨져 있음',
        /#app\{[^}]*opacity:0/.test(html.replace(/\s+/g,'')));
  check('타이틀 동안 게임 정지', S.paused === true);

  // --- 2. 없는 계정으로 로그인 -> 에러 메시지 ---
  nodes.idInput.value = uid;
  nodes.pwInput.value = 'wrongpw';
  nodes.btnGoLogin.fire('click');
  await sleep(300);
  check('없는 계정은 로그인 거부', /달라요|실패/.test(nodes.authErr.textContent),
        `"${nodes.authErr.textContent}"`);
  check('실패 시 타이틀 유지', nodes.titleScreen.classList.contains('show'));

  // --- 3. 회원가입 ---
  nodes.btnGoRegister.fire('click');
  check('가입창 열림', nodes.namePanel.classList.contains('show'));
  check('가입 화면이 팝업이 아닌 전체 화면', /id="namePanel" class="screen"/.test(html));
  check('가입 화면이 타이틀을 덮음', zOf('namePanel') > zOf('titleScreen'),
        `namePanel=${zOf('namePanel')} titleScreen=${zOf('titleScreen')}`);
  check('전환 중 타이틀이 아래에 유지됨(배경 안 뚫림)',
        nodes.titleScreen.classList.contains('show'));
  check('화면 전환에 display 토글을 쓰지 않음',
        !/\.screen\{[^}]*display:none/.test(html.replace(/\s+/g,'')) );
  check('아이디가 가입창으로 넘어옴', nodes.regId.value === uid, `"${nodes.regId.value}"`);
  nodes.regPw.value = 'pw1234';
  nodes.regNick.value = '테스터';
  nodes.btnAuthOk.fire('click');
  await sleep(400);
  check('로비에서는 게임판 숨김', !bodyCls.has('playing'));
  check('가입 후 로비 진입', nodes.lobby.classList.contains('show'),
        nodes.regErr.textContent ? `err="${nodes.regErr.textContent}"` : '');
  check('로비에서는 게임이 정지', S.paused === true);
  check('토큰 저장됨', !!LB.token);
  check('닉네임 저장됨', LB.nick === '테스터', `"${LB.nick}"`);

  // --- 4. 로그아웃 후 같은 계정으로 로그인 ---
  LB.token = '';
  nodes.titleScreen.classList.add('show');
  S.paused = true;
  nodes.idInput.value = uid;
  nodes.pwInput.value = 'pw1234';
  nodes.authErr.textContent = '';
  nodes.btnGoLogin.fire('click');
  await sleep(400);
  check('가입한 계정으로 로그인 성공',
        nodes.lobby.classList.contains('show') && !!LB.token,
        nodes.authErr.textContent ? `err="${nodes.authErr.textContent}"` : '');

  // 로비 -> 게임 시작
  nodes.btnPlay.fire('click');
  check('로비에서 게임 시작', !nodes.lobby.classList.contains('show') && S.paused === false);
  check('게임 진입 시에만 게임판 표시', bodyCls.has('playing'));

  // 도감 / 게임 방법
  nodes.btnGuide.fire('click');
  check('블록 도감 열림', nodes.guideScreen.classList.contains('show'));
  nodes.btnGuideBack.fire('click');
  check('도감 닫힘', !nodes.guideScreen.classList.contains('show'));
  nodes.btnHow.fire('click');
  check('게임 방법 열림', nodes.guideScreen.classList.contains('show'));
  nodes.btnGuideBack.fire('click');

  // --- 4b. 뒤로 누르면 타이틀로 ---
  nodes.titleScreen.classList.add('show');
  nodes.btnGoRegister.fire('click');
  nodes.btnAuthBack.fire('click');
  check('뒤로 -> 타이틀 복귀',
        nodes.titleScreen.classList.contains('show') && !nodes.namePanel.classList.contains('show'));

  // --- 4c. 관리자 계정은 관리자 페이지로 분기 ---
  {
    const r = await fetch(BASE + '/api/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id:'admin', pw:'1234' })
    }).then(r=>r.json());
    check('admin/1234 로그인 성공', r.ok === true);
    check('admin 은 관리자로 표시됨', r.admin === true);
    check('클라이언트가 관리자 페이지로 보냄', /data\.admin[\s\S]{0,200}admin\.html/.test(html));

    const bad = await fetch(BASE + '/api/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id:'admin', pw:'nope' })
    }).then(r=>r.json());
    check('admin 틀린 비번은 거부', bad.ok === false);

    const usr = await fetch(BASE + '/api/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ id:'jaehyun', pw:'1111' })
    }).then(r=>r.json());
    check('일반 계정은 관리자 아님', usr.ok === true && !usr.admin);
  }

  // --- 5. 게스트 버튼은 없어야 한다 ---
  check('로그인 없이 하기 버튼 제거됨', !/btnGuest/.test(html));

  // --- 6. 빈 입력 방어 ---
  nodes.titleScreen.classList.add('show');
  nodes.idInput.value = '';
  nodes.pwInput.value = '';
  nodes.authErr.textContent = '';
  nodes.btnGoLogin.fire('click');
  await sleep(150);
  check('빈 아이디는 막힘', /아이디/.test(nodes.authErr.textContent), `"${nodes.authErr.textContent}"`);

  console.log(fail === 0 ? '\nPASS: 로그인 흐름 정상' : `\nFAIL: ${fail}건`);
  process.exit(fail === 0 ? 0 : 1);
})();
