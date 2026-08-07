// Headless full-game bot: plays until game over, reports pacing and stall stats.
const { load } = require('./harness');
const X = load(`S, CONFIG, startFiring, stepPhysics, updateShift, FIXED_DT,
                traceTrajectory, clampAngleFromVertical, normalize, startFreshGame`);
const { S, CONFIG, startFiring, stepPhysics, updateShift, FIXED_DT, traceTrajectory, startFreshGame } = X;

startFreshGame();

const maxA = CONFIG.MAX_ANGLE_FROM_VERTICAL;
let longestTurn = 0, stuckTurns = 0, turns = 0;

function pickAim() {
  // Sample angles, score by how much brick value the predicted path reaches.
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

const ballCurve = [], hpCurve = [];
let guard = 0;
while (S.state !== 'gameover' && guard++ < 4000) {
  if (S.state === 'aiming') {
    if (S.round % 5 === 1) {
      ballCurve.push(`R${S.round}:${S.ballCount}`);
      const top = S.grid[0].find(c => c && c.type === 'hp');
      hpCurve.push(`R${S.round}:${top ? top.hp : '-'}`);
    }
    startFiring(pickAim());
    turns++;
    let ticks = 0;
    while (S.state === 'firing' && ticks < 4000) { stepPhysics(FIXED_DT); ticks++; }
    if (ticks >= 4000) stuckTurns++;
    if (ticks > longestTurn) longestTurn = ticks;
  } else if (S.state === 'shifting') {
    // Must drive updateShift, not stepPhysics: the row-descend animation is what
    // runs checkGameOver(). Forcing state back to 'aiming' skips the death check.
    let t = 0;
    while (S.state === 'shifting' && t++ < 600) updateShift(FIXED_DT);
    if (S.state === 'shifting') throw new Error('shift never resolved');
  } else break;
}

console.log(`final round       : ${S.round}`);
console.log(`ball curve        : ${ballCurve.join(' -> ')}`);
console.log(`hp curve          : ${hpCurve.join(' -> ')}`);
console.log(`final score       : ${S.score}`);
console.log(`max balls         : ${S.maxBalls}`);
console.log(`turns played      : ${turns}`);
console.log(`longest turn      : ${longestTurn} ticks = ${(longestTurn / 60).toFixed(1)} sec`);
console.log(`stuck turns       : ${stuckTurns}`);
