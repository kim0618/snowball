// Shared harness: loads index.html's <script> into a headless sandbox.
const fs = require('fs'), vm = require('vm'), path = require('path');

function load(extraExports = '') {
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
    requestAnimationFrame: () => 0, setTimeout: () => 0, clearTimeout: noop,
    performance: { now: () => 0 },
    Math, Date, JSON, Set, Map, Array, Object, Number, String, Boolean, isNaN, console
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox);
  return sandbox.__x;
}

module.exports = { load };
