// 눈덩이 Cloudflare Pages Functions 공용 헬퍼 (KV 기반)
//
// KV 키 구조 (바인딩: SNOWBALL_KV)
//   user:<id>   → { pw, nick, gender, provider, token, score, round, at, bestRound, plays, joined }
//   nick:<닉>   → id            닉네임 중복 확인용 역인덱스 (전체 목록을 훑지 않으려고)
//   board       → [{ id, nick, score, round }]  점수순 상위 500
//   admin:<토큰> → { at }        관리자 세션, 12시간 후 자동 만료
//
// 로컬 server.js 와 규칙(길이 제한·비밀번호 정책·응답 모양)을 똑같이 맞춰야
// 같은 index.html 이 양쪽에서 다 돈다.

export const MAX_ID = 16;
export const MAX_NICK = 12;
export const MAX_PW = 32;
export const MAX_SCORE = 50_000_000;
export const MAX_ENTRIES = 500;
export const PW_RE = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,32}$/;
export const GENDERS = ['m', 'f'];

const ADMIN_TTL = 60 * 60 * 12;

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export const ok = (data) => json({ ok: true, ...data });
export const fail = (error, status = 400) => json({ ok: false, error }, status);

export function clean(raw, max) {
  return String(raw || '').replace(/[\s<>"'&\\/]/g, '').trim().slice(0, max);
}

export function makeToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export const statsOf = (u) => ({
  best: u.score || 0,
  bestRound: u.bestRound || u.round || 0,
  plays: u.plays || 0,
});

export const getUser = (env, id) => env.SNOWBALL_KV.get(`user:${id}`, 'json');
export const putUser = (env, id, u) => env.SNOWBALL_KV.put(`user:${id}`, JSON.stringify(u));

// ---- 순위표 ----
// 전체 유저를 매번 list+get 하면 KV 요청이 인원수만큼 늘어난다.
// 대신 순위표 자체를 키 하나에 통째로 넣고 점수 제출 때만 고쳐 쓴다.
export async function getBoard(env) {
  return (await env.SNOWBALL_KV.get('board', 'json')) || [];
}

export async function putBoard(env, board) {
  await env.SNOWBALL_KV.put('board', JSON.stringify(board.slice(0, MAX_ENTRIES)));
}

// 한 사람의 최고 기록을 순위표에 반영한 새 배열을 돌려준다
export function withEntry(board, entry) {
  const next = board.filter((r) => r.id !== entry.id);
  if (entry.score > 0) next.push(entry);
  next.sort((a, b) => b.score - a.score);
  return next.slice(0, MAX_ENTRIES);
}

// ---- 관리자 ----
// 아이디·비밀번호는 Pages 환경변수(ADMIN_ID / ADMIN_PW)로만 받는다.
// 공개 주소라서 코드에 기본 비밀번호를 두면 누구나 전체 계정을 열람할 수 있다.
export function adminCreds(env) {
  const id = env.ADMIN_ID;
  const pw = env.ADMIN_PW;
  return id && pw ? { id, pw } : null;
}

export async function newAdminSession(env) {
  const token = makeToken();
  await env.SNOWBALL_KV.put(
    `admin:${token}`,
    JSON.stringify({ at: new Date().toISOString() }),
    { expirationTtl: ADMIN_TTL }
  );
  return token;
}

export async function isAdmin(env, token) {
  if (!token) return false;
  return (await env.SNOWBALL_KV.get(`admin:${token}`)) !== null;
}

// 관리자 API 로 들어오는 모든 요청은 먼저 이 문을 지나야 한다.
// admin/1234 는 짧아서 공개 주소에서는 아무 방어가 못 된다. 그래서 아이디·비밀번호와
// 별개로, 주소에 박아둔 긴 무작위 키(ADMIN_KEY)를 함께 보내야만 통과시킨다.
// 키가 없으면 admin/1234 를 정확히 알아도 회원 목록을 못 본다.
export function hasAdminKey(request, env) {
  const want = env.ADMIN_KEY;
  if (!want) return false;
  const url = new URL(request.url);
  const got = request.headers.get('X-Admin-Key') || url.searchParams.get('k') || '';
  // 길이가 같을 때만 한 글자씩 비교해 응답 시간으로 키를 캐내지 못하게 한다
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

export async function listAll(env, prefix) {
  const keys = [];
  let cursor;
  do {
    const res = await env.SNOWBALL_KV.list({ prefix, cursor, limit: 1000 });
    keys.push(...res.keys);
    cursor = res.list_complete ? null : res.cursor;
  } while (cursor);
  return keys;
}
