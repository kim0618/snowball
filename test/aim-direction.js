// Drag direction must equal fire direction, always upward, within the clamp.
const { load } = require('./harness');
const { CONFIG, clampAngleFromVertical, normalize } =
  load('CONFIG, clampAngleFromVertical, normalize');

const aimFor = (dx, dy) =>
  clampAngleFromVertical(normalize({ x: dx, y: dy }), CONFIG.MAX_ANGLE_FROM_VERTICAL);

const maxDeg = CONFIG.MAX_ANGLE_FROM_VERTICAL * 180 / Math.PI;
const cases = [
  ['drag up',         0, -100, d => Math.abs(d.x) < 0.05],
  ['drag up-right', 100, -100, d => d.x > 0],
  ['drag up-left', -100, -100, d => d.x < 0],
  ['drag right',    100,    0, d => d.x > 0],
  ['drag left',    -100,    0, d => d.x < 0],
  ['steep right',    20, -100, d => d.x > 0],
  ['steep left',    -20, -100, d => d.x < 0],
];

let fail = 0;
for (const [name, dx, dy, ok] of cases) {
  const d = aimFor(dx, dy);
  const deg = Math.atan2(d.x, -d.y) * 180 / Math.PI;
  const pass = ok(d) && d.y < 0 && Math.abs(deg) <= maxDeg + 0.01;
  if (!pass) fail++;
  console.log(`${pass ? 'ok  ' : 'FAIL'}  ${name.padEnd(12)} -> (${d.x.toFixed(2)}, ${d.y.toFixed(2)})  ${deg.toFixed(1)}deg`);
}

// Anti-stall is now time-gated, not angle-gated: a fresh shot at any legal angle
// must fly untouched long enough to reach the bricks, or it stops matching the
// preview. Grid is 12 cells tall, so worst case a near-horizontal shot needs a
// while; require the grace period to cover at least a straight run up the board.
const straightRunSec = (CONFIG.GRID_ROWS * CONFIG.CELL) / CONFIG.BALL_SPEED;
const graceOk = CONFIG.IDLE_GRAVITY_AFTER > straightRunSec;
console.log(`\ngrace before gravity : ${CONFIG.IDLE_GRAVITY_AFTER}s`);
console.log(`time to cross board  : ${straightRunSec.toFixed(2)}s`);
console.log(`${graceOk ? 'ok  ' : 'FAIL'}  a fresh shot reaches the bricks before gravity applies`);
if (!graceOk) fail++;

console.log(fail === 0 ? '\nPASS' : `\nFAIL: ${fail} case(s)`);
process.exit(fail === 0 ? 0 : 1);
