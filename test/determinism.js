// Load-bearing check for the leaderboard: same seed + same aim angles must
// reproduce the same run, every time. This is what lets a server replay a
// submitted score instead of trusting the client.
const { load } = require('./harness');

function playRun(seed, angles) {
  const X = load(`S, CONFIG, startFiring, stepPhysics, updateShift, FIXED_DT, startFreshGame`);
  const { S, startFiring, stepPhysics, updateShift, FIXED_DT, startFreshGame } = X;

  startFreshGame(seed);

  let i = 0;
  const trace = [];
  while (S.state !== 'gameover' && i < angles.length) {
    if (S.state === 'aiming') {
      const a = angles[i++];
      startFiring({ x: Math.sin(a), y: -Math.cos(a) });
      let t = 0;
      while (S.state === 'firing' && t++ < 4000) stepPhysics(FIXED_DT);
      trace.push(`${S.round}:${S.score}:${S.ballCount}`);
    } else if (S.state === 'shifting') {
      let t = 0;
      while (S.state === 'shifting' && t++ < 600) updateShift(FIXED_DT);
    } else break;
  }
  return { score: S.score, round: S.round, balls: S.ballCount, trace: trace.join('|') };
}

const maxA = 80 * Math.PI / 180;
const angles = [];
for (let i = 0; i < 30; i++) angles.push(-maxA + 2 * maxA * ((i * 37) % 41) / 41);

const SEED = 20260805;
const a = playRun(SEED, angles);
const b = playRun(SEED, angles);
const c = playRun(SEED + 1, angles);
// A cheater who claims the same score with different play must not reproduce.
const tampered = playRun(SEED, angles.map((v, i) => (i === 5 ? v * 0.5 : v)));

console.log(`A  seed ${SEED}            : score ${a.score}  round ${a.round}`);
console.log(`B  same seed + same input : score ${b.score}  round ${b.round}`);
console.log(`C  different seed         : score ${c.score}  round ${c.round}`);
console.log(`D  same seed, one shot changed : score ${tampered.score}  round ${tampered.round}`);

const checks = [
  ['same seed + inputs reproduce the run exactly', a.trace === b.trace && a.score === b.score],
  ['different seed gives a different run',          a.trace !== c.trace],
  ['changing one shot changes the run',             a.trace !== tampered.trace],
];
console.log('');
let fail = 0;
for (const [name, ok] of checks) { if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`); }
console.log(fail === 0
  ? '\nPASS: a server can replay a submitted run and verify the score'
  : '\nFAIL: runs are not reproducible, server-side verification is impossible');
process.exit(fail === 0 ? 0 : 1);
