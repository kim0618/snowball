// server/data.json → 로컬(miniflare) KV 로 계정·순위표 심기
//   node tools/seed-local-kv.mjs        미리보기
//   node tools/seed-local-kv.mjs --go   실제 반영
//
// migrate-kv.mjs 와 키 구조는 같고 저장 위치만 다르다. 그쪽은 --remote(프로덕션 KV),
// 이쪽은 --local(.wrangler/state) 이다.
//
// 왜 필요한가: `npm start`(server/server.js)는 data.json 을 직접 읽지만
// `npm run dev`(wrangler pages dev)는 functions/api/* → KV 를 읽는다.
// 로컬 KV 는 miniflare 가 만든 빈 흉내본이라 data.json 의 계정이 하나도 없어서
// 로컬 dev 서버에서는 kjs 같은 기존 아이디로 로그인이 안 된다.
//
// ⚠️ 반영 뒤에는 dev 서버를 다시 띄워야 한다(뜬 채로 넣으면 안 읽는 경우가 있다).
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const GO = process.argv.includes('--go');
const users = JSON.parse(readFileSync(new URL('../server/data.json', import.meta.url), 'utf8'));

const put = (key, value) => {
  console.log(`${GO ? 'PUT ' : '(미리보기) '}${key}`);
  if (!GO) return;
  execFileSync('npx', ['wrangler', 'kv', 'key', 'put', '--binding=SNOWBALL_KV', key, value,
    '--local', '--persist-to', new URL('../.wrangler/state', import.meta.url).pathname],
    { stdio: ['ignore', 'ignore', 'inherit'] });
};

// 순위표는 덮어쓰면 안 된다. 로컬에서 이미 만들어 놀던 계정(testuser 등)의 기록이
// data.json 에는 없으므로 그대로 밀어 넣으면 사라진다. 지금 떠 있는 dev 서버에서
// 현재 순위표를 받아 와 합친다(같은 id 는 점수 높은 쪽을 남긴다).
const DEV = process.env.DEV_URL || 'http://127.0.0.1:8788';
let board = [];
try {
  const r = await fetch(`${DEV}/api/scores`);
  const d = await r.json();
  if (d.ok && Array.isArray(d.scores)) board = d.scores;
  console.log(`기존 로컬 순위표 ${board.length}줄 읽음 (${DEV})`);
} catch {
  console.log(`⚠️ ${DEV} 에서 기존 순위표를 못 읽었다. dev 서버가 떠 있어야 안전하게 합친다.`);
  if (GO) process.exit(1);
}

for (const [id, u] of Object.entries(users)) {
  put(`user:${id}`, JSON.stringify(u));
  if (u.nick) put(`nick:${u.nick}`, id);
  if (typeof u.score === 'number' && u.score > 0) {
    const cur = board.find((r) => r.id === id);
    const row = { id, nick: u.nick || id, score: u.score, round: u.round || 0 };
    if (!cur) board.push(row);
    else if (u.score > cur.score) Object.assign(cur, row);
  }
}
board.sort((a, b) => b.score - a.score);
put('board', JSON.stringify(board.slice(0, 500)));

console.log(`\n계정 ${Object.keys(users).length}명, 순위표 ${board.length}줄`);
if (!GO) console.log('실제로 심으려면: node tools/seed-local-kv.mjs --go');
