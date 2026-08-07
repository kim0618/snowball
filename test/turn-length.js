// Measure how long the player actually waits per turn: from releasing the drag
// until aiming is possible again. Counts FRAMES through the real frame loop
// (including the auto speed-up ramp), so this is wall-clock, not physics time.
const { load } = require('./harness');
const X = load(`S, CONFIG, startFiring, stepPhysics, updateShift, FIXED_DT,
                traceTrajectory, startFreshGame, autoSpeedFor, updateParticles`);
const { S, CONFIG, startFiring, stepPhysics, updateShift, FIXED_DT, traceTrajectory, startFreshGame, autoSpeedFor } = X;

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

// Mirror of the real frame loop's speed ramp.
function runTurnFrames() {
  let frames = 0;
  while (S.state === 'firing' && frames < 6000) {
    // 히트스톱은 실제 대기 시간이므로 프레임으로 세어야 한다
    if (S.hitstop > 0) { S.hitstop -= FIXED_DT; frames++; continue; }
    S.turnWallTime += FIXED_DT;
    const auto = autoSpeedFor(S.turnWallTime);  // same function the game uses
    for (let i = 0; i < auto; i++) stepPhysics(FIXED_DT);
    frames++;
  }
  return frames;
}

const rows = [];
let guard = 0;
while (S.state !== 'gameover' && guard++ < 3000) {
  if (S.state === 'aiming') {
    const balls = S.ballCount, round = S.round;
    startFiring(pickAim());
    const frames = runTurnFrames();
    rows.push({ round, balls, wall: frames / 60, sim: S.turnTime });
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
