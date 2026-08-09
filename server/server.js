// 눈덩이 랭킹 서버 - 의존성 없음, JSON 파일 하나에 저장
//
//   node server.js
//   PORT=9000 node server.js
//   DATA_FILE=/var/opbricks/data.json node server.js
//   ADMIN_ID=admin ADMIN_PW=1234 node server.js   (기본값 admin / 1234)
//
// API
//   POST /api/register        {id, pw, nick, gender, provider?}   -> {token}
//                              provider:'naver' 도 실제 연동 전에는 입력한 pw를 그대로 사용
//   POST /api/login           {id, pw}                -> {token}
//   GET  /api/check-id?id=                              아이디 중복 확인
//   GET  /api/check-nick?nick=                           닉네임 중복 확인
//   POST /api/score           {id, token, score, round}
//   GET  /api/scores                                   공개 순위표
//   POST /api/admin/login     {id, pw}                -> {token}
//   GET  /api/admin/users?token=                       전체 유저 목록
//   POST /api/admin/delete    {token, id}              유저 삭제
//
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8790);
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, '..', 'public');
const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml',
  '.ico':'image/x-icon', '.webmanifest':'application/manifest+json',
};
const ADMIN_ID = process.env.ADMIN_ID || 'admin';
const ADMIN_PW = process.env.ADMIN_PW || '1234';

const MAX_ID = 16;
const MAX_NICK = 12;
const MAX_PW = 32;
// 점수는 라운드가 갈수록 커진다(공격력 천장이 라운드의 제곱이라 점수는 그 이상으로 자란다).
// 5천만은 정상 플레이로 금방 넘겨서, 넘긴 사람은 그때부터 기록이 영영 안 올라갔다.
// 여기 값은 '말도 안 되는 값 거르기' 용도지 정상 상한이 아니다.
const MAX_SCORE = 1_000_000_000;
const MAX_ENTRIES = 500;
const USER_SESSION_MS = 60 * 60 * 1000;
// 8자 이상, 영문/숫자/특수문자를 모두 포함
const PW_RE = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,32}$/;
const GENDERS = ['m', 'f'];

// ---- 저장소: JSON 파일 하나 ----
// { 아이디: { pw, nick, gender, provider, score, round, at, joined, token } }
let users = {};
let adminToken = '';

function load() {
  try {
    users = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    console.log(`불러옴: ${Object.keys(users).length}명 (${DATA_FILE})`);
  } catch (e) {
    users = {};
    console.log(`새로 시작 (${DATA_FILE})`);
  }
}

let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const tmp = DATA_FILE + '.tmp';
    try {
      fs.writeFileSync(tmp, JSON.stringify(users, null, 2));
      fs.renameSync(tmp, DATA_FILE);   // 쓰다 죽어도 원본이 안 깨지게
    } catch (e) {
      console.error('저장 실패:', e.message);
    }
  }, 400);
}

function appendLoginHistory(u, success, provider = 'local', reason = '') {
  const history = Array.isArray(u.loginHistory) ? u.loginHistory : [];
  history.push({ at: new Date().toISOString(), success: !!success, provider, reason });
  u.loginHistory = history.slice(-50);
}

const makeToken = () => crypto.randomBytes(24).toString('hex');

function clean(raw, max) {
  return String(raw || '').replace(/[\s<>"'&\\/]/g, '').trim().slice(0, max);
}

const statsOf = u => ({ best: u.score || 0, bestRound: u.bestRound || u.round || 0, plays: u.plays || 0 });

// 공개 순위표에는 닉네임과 점수만
function ranking() {
  return Object.entries(users)
    .filter(([, u]) => typeof u.score === 'number' && u.score > 0)
    .map(([id, u]) => ({ id, nick: u.nick || id, score: u.score, round: u.round || 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ENTRIES);
}

function send(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function readBody(req, cb) {
  let raw = '';
  let tooBig = false;
  req.on('data', c => { raw += c; if (raw.length > 4096) { tooBig = true; req.destroy(); } });
  req.on('end', () => {
    if (tooBig) return;
    try { cb(JSON.parse(raw)); } catch { cb(null); }
  });
}

const server = http.createServer((req, res) => {
  // 잘못된 주소 하나에 서버 전체가 죽으면 안 된다 ('//' 같은 입력이 URL 파서를 던진다)
  let url;
  try {
    url = new URL(req.url, 'http://x');
  } catch {
    return send(res, 400, { ok: false, error: 'bad request' });
  }
  const p = url.pathname;

  if (req.method === 'OPTIONS') return send(res, 204, {});

  // ---- 공개 순위표 ----
  if (req.method === 'GET' && p === '/api/scores') {
    return send(res, 200, { ok: true, scores: ranking() });
  }

  // ---- 아이디 / 닉네임 중복 확인 ----
  if (req.method === 'GET' && p === '/api/check-id') {
    const id = clean(url.searchParams.get('id') || '', MAX_ID);
    if (!id) return send(res, 200, { ok: true, available: false });
    return send(res, 200, { ok: true, available: !users[id] });
  }
  if (req.method === 'GET' && p === '/api/check-nick') {
    const nick = clean(url.searchParams.get('nick') || '', MAX_NICK);
    if (!nick) return send(res, 200, { ok: true, available: false });
    const taken = Object.values(users).some(u => u.nick === nick);
    return send(res, 200, { ok: true, available: !taken });
  }

  // ---- 가입 ----
  // provider:'naver' 는 네이버 로그인 화면(아직 골격만, 실제 OAuth 연동 전) 경로다.
  // 연동 전에는 일반 가입처럼 화면에서 입력한 비밀번호를 그대로 저장한다.
  if (req.method === 'POST' && p === '/api/register') {
    return readBody(req, body => {
      if (!body) return send(res, 400, { ok: false, error: '잘못된 형식' });
      const provider = body.provider === 'naver' ? 'naver' : 'local';
      const id = clean(body.id, MAX_ID);
      const nick = clean(body.nick, MAX_NICK) || id;
      const gender = GENDERS.includes(body.gender) ? body.gender : '';
      if (!id) return send(res, 400, { ok: false, error: '아이디를 입력해주세요' });
      if (!nick) return send(res, 400, { ok: false, error: '닉네임을 입력해주세요' });
      if (!gender) return send(res, 400, { ok: false, error: '성별을 선택해주세요' });
      if (users[id]) return send(res, 409, { ok: false, error: '이미 있는 아이디예요' });
      if (Object.values(users).some(u => u.nick === nick)) {
        return send(res, 409, { ok: false, error: '이미 있는 닉네임이에요' });
      }

      let pw = String(body.pw || '').slice(0, MAX_PW);
      if (provider === 'local') {
        if (!PW_RE.test(pw)) {
          return send(res, 400, { ok: false, error: '비밀번호는 8자 이상, 영문·숫자·특수문자를 모두 포함해야 해요' });
        }
      } else if (!pw) {
        return send(res, 400, { ok: false, error: '비밀번호를 입력해주세요' });
      }

      const token = makeToken();
      const expiresAt = Date.now() + USER_SESSION_MS;
      users[id] = {
        pw, nick, gender, provider, token, tokenExpiresAt: expiresAt,
        score: 0, round: 0, at: null,
        bestRound: 0, plays: 0,
        joined: new Date().toISOString(),
      };
      appendLoginHistory(users[id], true, provider, '가입 후 로그인');
      save();
      return send(res, 200, { ok: true, id, nick, token, expiresAt, best: 0,
        stats: { best: 0, bestRound: 0, plays: 0 }, scores: ranking() });
    });
  }

  // ---- 로그인 ----
  // 같은 입력창 하나로 처리한다. 관리자 계정이면 관리자 토큰을 내주고
  // 클라이언트가 관리자 페이지로 보낸다.
  if (req.method === 'POST' && p === '/api/login') {
    return readBody(req, body => {
      if (!body) return send(res, 400, { ok: false, error: '잘못된 형식' });
      const id = clean(body.id, MAX_ID);
      const pw = String(body.pw || '');

      if (id === ADMIN_ID) {
        if (pw !== ADMIN_PW) return send(res, 401, { ok: false, error: '아이디 또는 비밀번호가 달라요' });
        adminToken = makeToken();
        return send(res, 200, { ok: true, admin: true, token: adminToken });
      }

      const u = users[id];
      if (!u || u.pw !== pw) {
        if (u) { appendLoginHistory(u, false, 'local', '비밀번호 오류'); save(); }
        return send(res, 401, { ok: false, error: '아이디 또는 비밀번호가 달라요' });
      }
      appendLoginHistory(u, true, 'local');
      u.token = makeToken();
      u.tokenExpiresAt = Date.now() + USER_SESSION_MS;
      save();
      return send(res, 200, { ok: true, id, nick: u.nick || id, token: u.token,
        expiresAt: u.tokenExpiresAt, best: u.score || 0,
        stats: statsOf(u), scores: ranking() });
    });
  }

  // ---- 점수 제출 ----
  if (req.method === 'POST' && p === '/api/score') {
    return readBody(req, body => {
      if (!body) return send(res, 400, { ok: false, error: '잘못된 형식' });
      const id = clean(body.id, MAX_ID);
      const u = users[id];
      if (!u || !u.token || u.token !== body.token || Number(u.tokenExpiresAt) <= Date.now()) {
        return send(res, 401, { ok: false, error: '다시 로그인해주세요' });
      }
      const score = Math.floor(Number(body.score));
      const round = Math.floor(Number(body.round)) || 0;
      if (!Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
        return send(res, 400, { ok: false, error: '점수 범위 오류' });
      }
      const isBest = score > (u.score || 0);
      u.plays = (u.plays || 0) + 1;
      u.bestRound = Math.max(u.bestRound || 0, round);
      if (isBest) {
        u.score = score; u.round = round; u.at = new Date().toISOString();
      }
      save();
      const list = ranking();
      const rank = list.findIndex(r => r.id === id) + 1;
      return send(res, 200, { ok: true, best: u.score, updated: isBest, rank: rank || null,
        stats: statsOf(u), scores: list });
    });
  }

  // ---- 관리자 ----
  if (req.method === 'POST' && p === '/api/admin/login') {
    return readBody(req, body => {
      if (!body) return send(res, 400, { ok: false, error: '잘못된 형식' });
      if (String(body.id) !== ADMIN_ID || String(body.pw) !== ADMIN_PW) {
        return send(res, 401, { ok: false, error: '아이디 또는 비밀번호가 달라요' });
      }
      adminToken = makeToken();
      return send(res, 200, { ok: true, token: adminToken });
    });
  }

  if (req.method === 'GET' && p === '/api/admin/users') {
    if (!adminToken || url.searchParams.get('token') !== adminToken) {
      return send(res, 401, { ok: false, error: '관리자 인증 필요' });
    }
    const list = Object.entries(users).map(([id, u]) => ({
      id,
      pw: u.pw,
      nick: u.nick || id,
      gender: u.gender || '',
      provider: u.provider || 'local',
      score: u.score || 0,
      round: u.round || 0,
      bestRound: u.bestRound || u.round || 0,
      plays: u.plays || 0,
      at: u.at,
      joined: u.joined,
      loginHistory: Array.isArray(u.loginHistory) ? u.loginHistory : [],
    })).sort((a, b) => b.score - a.score);
    return send(res, 200, { ok: true, users: list });
  }

  if (req.method === 'POST' && p === '/api/admin/delete') {
    return readBody(req, body => {
      if (!body || !adminToken || body.token !== adminToken) {
        return send(res, 401, { ok: false, error: '관리자 인증 필요' });
      }
      const id = clean(body.id, MAX_ID);
      if (users[id]) { delete users[id]; save(); }
      return send(res, 200, { ok: true });
    });
  }

  // ---- 정적 파일 (게임 · 관리자 페이지) ----
  // API와 같은 포트에서 서빙해야 브라우저가 같은 출처로 API를 부를 수 있다.
  if (req.method === 'GET') {
    const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
    // 경로 탈출 차단: 반드시 STATIC_DIR 안이어야 한다
    const full = path.resolve(STATIC_DIR, rel);
    if (!full.startsWith(path.resolve(STATIC_DIR) + path.sep)) {
      return send(res, 403, { ok: false, error: 'forbidden' });
    }
    fs.readFile(full, (err, buf) => {
      if (err) return send(res, 404, { ok: false, error: 'not found' });
      const ext = path.extname(full).toLowerCase();
      const type = MIME[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
      res.end(buf);
    });
    return;
  }

  send(res, 404, { ok: false, error: 'not found' });
});

load();
server.listen(PORT, () => {
  console.log(`눈덩이 서버  http://localhost:${PORT}`);
  console.log(`  게임    /`);
  console.log(`  관리자  /admin.html`);
  console.log(`관리자: ${ADMIN_ID} / ${ADMIN_PW}`);
});
