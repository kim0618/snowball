// Verify the boss and curse bricks actually spawn and actually do their thing.
const { load } = require('./harness');
const X = load(`S, CONFIG, generateRow, createRng, brickBaseHp, startFreshGame,
                startFiring, stepPhysics, updateShift, FIXED_DT, traceTrajectory`);
const { S, CONFIG, generateRow, createRng, brickBaseHp, FIXED_DT } = X;

// --- spawn rates ---
const rng = createRng(12345);
let boss = 0, curse = 0, plain = 0, op = 0, item = 0;
let x2 = 0, addB = 0, subB = 0;
let bossHpSum = 0, plainHpSum = 0;
const POWER = 40;
for (let round = 1; round <= 400; round++) {
  const row = generateRow(rng, round, POWER);
  for (const b of row) {
    if (!b) continue;
    if (b.type === 'op') { op++; if (b.op==='x2') x2++; else if (b.op==='add') addB++; else subB++; }
    else if (b.type === 'item') item++;
    else if (b.boss)  { boss++;  bossHpSum  += b.hp; }
    else if (b.curse) { curse++; }
    else              { plain++; plainHpSum += b.hp; }
  }
}
const totalHp = boss + curse + plain;
console.log('--- spawn mix over 400 rows ---');
console.log(`boss   : ${boss} (${(100*boss/totalHp).toFixed(1)}% of HP bricks)`);
console.log(`curse  : ${curse} (${(100*curse/totalHp).toFixed(1)}% of HP bricks)`);
console.log(`plain  : ${plain}`);
console.log(`op mix : x2=${x2}  +N=${addB}  -N=${subB}   (x2 is ${(100*x2/(boss+curse+plain+op+item)).toFixed(1)}% of all bricks)`);
console.log(`avg boss HP ${(bossHpSum/boss).toFixed(0)} vs plain ${(plainHpSum/plain).toFixed(0)}  (x${(bossHpSum/boss/(plainHpSum/plain)).toFixed(1)})`);

// --- gating ---
const early = createRng(999);
let earlyBoss = 0, earlyCurse = 0;
for (let round = 1; round < CONFIG.BOSS_FROM_ROUND; round++)
  for (const b of generateRow(early, round, POWER)) if (b && b.boss) earlyBoss++;
for (let round = 1; round < CONFIG.CURSE_FROM_ROUND; round++)
  for (const b of generateRow(early, round, POWER)) if (b && b.curse) earlyCurse++;

// --- curse effect: hitting it must raise neighbours ---
X.startFreshGame();
S.grid = Array.from({length: CONFIG.GRID_ROWS}, () => new Array(CONFIG.COLS).fill(null));
S.grid[3][4] = { type:'hp', hp: 50, maxHp: 50, curse: true };
S.grid[3][3] = { type:'hp', hp: 10, maxHp: 10 };
S.grid[2][4] = { type:'hp', hp: 10, maxHp: 10 };
S.grid[3][5] = { type:'hp', hp: 10, maxHp: 10 };
S.grid[7][0] = { type:'hp', hp: 10, maxHp: 10 }; // far away, must not change

const before = { left: S.grid[3][3].hp, up: S.grid[2][4].hp, right: S.grid[3][5].hp, far: S.grid[7][0].hp };
// Fire a ball straight into the curse brick from directly below.
S.activeBalls = [{ x: 4*CONFIG.CELL + CONFIG.CELL/2, y: 5*CONFIG.CELL, vx: 0, vy: -CONFIG.BALL_SPEED, age: 0, lastHit: 0 }];
S.returning = []; S.fireQueueRemaining = 0; S.state = 'firing';
for (let i = 0; i < 40 && S.grid[3][4]; i++) X.stepPhysics(FIXED_DT);
const after = { left: S.grid[3][3].hp, up: S.grid[2][4].hp, right: S.grid[3][5].hp, far: S.grid[7][0].hp };

console.log('\n--- curse effect (hit once from below) ---');
console.log(`left  ${before.left} -> ${after.left}`);
console.log(`up    ${before.up} -> ${after.up}`);
console.log(`right ${before.right} -> ${after.right}`);
console.log(`far   ${before.far} -> ${after.far}  (must not change)`);

const checks = [
  ['boss spawns',            boss > 0],
  ['curse spawns',           curse > 0],
  ['boss HP is much bigger', bossHpSum/boss > (plainHpSum/plain) * 2],
  ['boss gated before R'+CONFIG.BOSS_FROM_ROUND,  earlyBoss === 0],
  ['curse gated before R'+CONFIG.CURSE_FROM_ROUND, earlyCurse === 0],
  ['curse raised neighbours', after.left > before.left && after.up > before.up && after.right > before.right],
  ['curse left far brick alone', after.far === before.far],
];
console.log('');
let fail = 0;
for (const [name, ok] of checks) { if (!ok) fail++; console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}`); }
console.log(fail === 0 ? '\nPASS' : `\nFAIL: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
