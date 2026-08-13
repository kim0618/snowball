// Shared harness: loads index.html's <script> into a headless sandbox.
const fs = require('fs'), vm = require('vm'), path = require('path');

// overrides: 샌드박스 전역을 바꿔 끼운다(예: 진짜처럼 동작하는 localStorage).
// 기본 스텁으로는 저장·계정 관련 코드를 시험할 수 없다.
function load(extraExports = '', overrides = {}) {
  const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const body = html.match(/<script>([\s\S]*)<\/script>/)[1];
  const script = body + `;globalThis.__x = { ${extraExports} };`;

  const noop = () => {};
  const ctxStub = new Proxy({}, {
    get(t, k) {
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createLinearGradient') return () => ({ addColorStop: noop });
      if (k === 'createRadialGradient') return () => ({ addColorStop: noop });
      return typeof t[k] === 'undefined' ? noop : t[k];
    },
    set(t, k, v) { t[k] = v; return true; }
  });
  const el = () => ({
    textContent: '', style: { setProperty: noop, getPropertyValue: () => '' },
    dataset: {}, innerHTML: '',
    clientWidth: 360, clientHeight: 700, width: 360, height: 600,
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, setPointerCapture: noop, appendChild: noop, append: noop,
    getContext: () => ctxStub,
    // 게으르게 만든다 - 즉시 el() 을 넣으면 무한 재귀
    get parentElement() { return el(); },
    querySelector: () => el(), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 600 })
  });
  const sandbox = {
    document: {
      getElementById: el, createElement: el, createTextNode: text => ({ textContent: text }),
      addEventListener: noop,
      body: { classList: { add: noop, remove: noop, toggle: noop, contains: () => false } },
    },
    window: { devicePixelRatio: 1, addEventListener: noop },
    navigator: {}, localStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    // 도전장 링크(?s=시드)를 읽는 코드가 로드 시점에 돈다. 이 셋이 없으면
    // 게임 로직과 상관없는 이유로 테스트 전체가 죽는다.
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    location: { origin: 'http://localhost', pathname: '/', search: '' },
    history: { replaceState: noop },
    URLSearchParams,
    // 뱃지 이미지(new Image())를 로드 시점에 만든다 - 브라우저 전용 생성자라
    // 스텁이 없으면 그 시도만으로 전체가 죽는다. 절대 로딩되지 않는 가짜라
    // badgeReady()가 항상 false를 돌려주고, 손으로 그린 대체 코드로 자연히 빠진다.
    Image: class { constructor(){ this.complete = false; this.naturalWidth = 0; } set src(v){} },
    // drawItemIcon의 번개·별 아이콘이 쓴다 - 실제 경로 데이터는 헤드리스 테스트엔
    // 안 중요하니(그려봤자 캔버스 스텁이 noop) 메서드만 있으면 된다.
    Path2D: class { moveTo(){} lineTo(){} bezierCurveTo(){} closePath(){} },
    requestAnimationFrame: () => 0, setTimeout: () => 0, clearTimeout: noop,
    performance: { now: () => 0 },
    Math, Date, JSON, Set, Map, Array, Object, Number, String, Boolean, isNaN, console
  };
  Object.assign(sandbox, overrides);
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  return sandbox.__x;
}

module.exports = { load };
