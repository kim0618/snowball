// server/data.json → Cloudflare KV 로 계정·순위표 옮기기 (1회용)
//   node tools/migrate-kv.mjs        미리보기
//   node tools/migrate-kv.mjs --go   실제 반영
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const GO = process.argv.includes('--go');
const users = JSON.parse(readFileSync(new URL('../server/data.json', import.meta.url), 'utf8'));

const put = (key, value) => {
  console.log(`${GO ? 'PUT ' : '(미리보기) '}${key}`);
  if (!GO) return;
  execFileSync('npx', ['wrangler', 'kv', 'key', 'put', '--binding=SNOWBALL_KV', key, value, '--remote'],
    { stdio: ['ignore', 'ignore', 'inherit'] });
};

const board = [];
for (const [id, u] of Object.entries(users)) {
  put(`user:${id}`, JSON.stringify(u));
  if (u.nick) put(`nick:${u.nick}`, id);
  if (typeof u.score === 'number' && u.score > 0) {
    board.push({ id, nick: u.nick || id, score: u.score, round: u.round || 0 });
  }
}
board.sort((a, b) => b.score - a.score);
put('board', JSON.stringify(board.slice(0, 500)));

console.log(`\n계정 ${Object.keys(users).length}명, 순위표 ${board.length}줄`);
if (!GO) console.log('실제로 올리려면: node tools/migrate-kv.mjs --go');
