// Measure how long the player actually waits per turn: from releasing the drag
// until aiming is possible again. Counts FRAMES through the real frame loop
// (including the auto speed-up ramp), so this is wall-clock, not physics time.
const { load } = require('./harness');
const X = load(`S, CONFIG, startFiring, stepPhysics, updateShift, FIXED_DT,
                traceTrajectory, startFreshGame, autoSpeedFor, updateParticles, tick`);
const { S, CONFIG, startFiring, stepPhysics, updateShift, FIXED_DT, traceTrajectory, startFreshGame, tick } = X;

startFreshGame();
const maxA = CONFIG.MAX_ANGLE_FROM_VERTICAL;

function pickAim() {
  let best = null, bestScore = -1;
  for (let i = 0; i <= 40; i++) {
    const ang = -maxA + 2 * maxA * i / 40;
    const dir = { x: Math.sin(ang), y: -Math.cos(ang) };
    const { hitBrick } = traceTrajectory(dir);
    let score = Math.random() * 0.5;
    if (hitBrick) {
      const b = S.grid[hitBrick.r] && S.grid[hitBrick.r][hitBrick.c];
      if (b) score += (b.type === 'op' || b.type === 'item') ? 6 : 3 + hitBrick.r * 0.4;
    }
    if (score > bestScore) { bestScore = score; best = dir; }
  }
  return best;
}

// 게임 루프를 흉내 내지 않고 tick() 을 그대로 돌린다. 예전엔 여기에 속도 램프를
// 베껴 뒀는데, 실제 tick() 이 updateParticles 까지 부르는 걸 빼먹은 탓에 화염 큐가
// 안 비워져 턴이 영영 안 끝나는 가짜 결과(한 턴 100초)가 나왔다. 미러는 언제든
// 본체와 갈라진다 - 잴 거면 본체를 돌릴 것.
function runTurnFrames() {
  let frames = 0;
  const before = S.turnWallTime;
  while (S.state === 'firing' && frames < 6000) { tick(); frames++; }
  return { frames, physTime: S.turnWallTime - before };
}

const rows = [];
let guard = 0;
while (S.state !== 'gameover' && guard++ < 3000) {
  if (S.state === 'aiming') {
    const balls = S.ballCount, round = S.round;
    startFiring(pickAim());
    const { frames, physTime } = runTurnFrames();
    rows.push({ round, balls, wall: frames / 60, sim: physTime });
  } else if (S.state === 'shifting') {
    let t = 0;
    while (S.state === 'shifting' && t++ < 600) updateShift(FIXED_DT);
  } else break;
}

console.log('round  balls   sim-time   wall-time (what you wait)');
for (const r of rows) {
  if (r.round % 4 === 1 || r.wall > 4) {
    console.log(`  ${String(r.round).padStart(3)}  ${String(r.balls).padStart(5)}   ${r.sim.toFixed(1).padStart(6)}s   ${r.wall.toFixed(1).padStart(6)}s`);
  }
}
const worstWall = Math.max(...rows.map(r => r.wall));
const worstSim = Math.max(...rows.map(r => r.sim));
const avgWall = rows.reduce((a, r) => a + r.wall, 0) / rows.length;
console.log(`\nturns            : ${rows.length}`);
console.log(`avg wait         : ${avgWall.toFixed(1)}s`);
console.log(`worst sim-time   : ${worstSim.toFixed(1)}s`);
console.log(`worst wall-wait  : ${worstWall.toFixed(1)}s`);
console.log(`total run        : ${(rows.reduce((a, r) => a + r.wall, 0) / 60).toFixed(1)} min of watching`);
