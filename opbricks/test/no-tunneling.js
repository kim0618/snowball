// A ball must never end a substep buried inside a brick.
// Frozen board (indestructible) so bricks can't vanish out from under a ball.
const { load } = require('./harness');
const X = load(`S, CONFIG, startFiring, stepPhysics, updateShift, FIXED_DT,
                substep, physicsSubsteps, LAUNCHER_Y, startFreshGame, WIDTH`);
const { S, CONFIG, FIXED_DT, LAUNCHER_Y, startFreshGame } = X;

startFreshGame();

// Build a dense board with tight seams: this is where burrowing shows up.
for (let r = 0; r < CONFIG.GRID_ROWS - 3; r++) {
  S.grid[r] = new Array(CONFIG.COLS).fill(null).map((_, c) =>
    ((r + c) % 4 === 0) ? null : { type: 'hp', hp: 99999, maxHp: 99999 });
}

function insideBrick(b) {
  const col = Math.floor(b.x / CONFIG.CELL);
  const row = Math.floor(b.y / CONFIG.CELL);
  for (let rr = row - 1; rr <= row + 1; rr++) {
    if (rr < 0 || rr >= CONFIG.GRID_ROWS) continue;
    for (let cc = col - 1; cc <= col + 1; cc++) {
      if (cc < 0 || cc >= CONFIG.COLS) continue;
      if (!S.grid[rr][cc]) continue;
      const x0 = cc * CONFIG.CELL, y0 = rr * CONFIG.CELL;
      // Strictly interior: center past the face by more than a hair.
      if (b.x > x0 + 0.5 && b.x < x0 + CONFIG.CELL - 0.5 &&
          b.y > y0 + 0.5 && b.y < y0 + CONFIG.CELL - 0.5) return { rr, cc };
    }
  }
  return null;
}

const maxA = CONFIG.MAX_ANGLE_FROM_VERTICAL;
const subs = X.physicsSubsteps();
let worstDepth = 0, violations = 0, shots = 0;

for (let i = 0; i <= 60; i++) {
  const ang = -maxA + 2 * maxA * i / 60;
  for (const lx of [30, WIDTHmid(), CONFIG.COLS * CONFIG.CELL - 30]) {
    S.launcherX = lx;
    S.activeBalls = [{
      x: lx, y: LAUNCHER_Y,
      vx: Math.sin(ang) * CONFIG.BALL_SPEED,
      vy: -Math.cos(ang) * CONFIG.BALL_SPEED,
      age: 0
    }];
    S.returning = []; S.fireQueueRemaining = 0; S.frenzyActive = false; S.state = 'firing';
    shots++;
    let guard = 0;
    while (S.activeBalls.length && guard++ < 2500) {
      for (let s = 0; s < subs; s++) {
        X.substep(FIXED_DT / subs);
        const b = S.activeBalls[0];
        if (!b) break;
        const hitCell = insideBrick(b);
        if (hitCell) {
          violations++;
          const x0 = hitCell.cc * CONFIG.CELL, y0 = hitCell.rr * CONFIG.CELL;
          const depth = Math.min(
            b.x - x0, x0 + CONFIG.CELL - b.x,
            b.y - y0, y0 + CONFIG.CELL - b.y);
          if (depth > worstDepth) worstDepth = depth;
        }
      }
    }
  }
}
function WIDTHmid() { return (CONFIG.COLS * CONFIG.CELL) / 2; }

console.log(`shots fired          : ${shots}`);
console.log(`substeps inside brick: ${violations}`);
console.log(`deepest penetration  : ${worstDepth.toFixed(2)} px  (cell ${CONFIG.CELL}, radius ${CONFIG.BALL_RADIUS})`);
const pass = violations === 0;
console.log(pass ? 'PASS: no ball ever entered a brick' : 'FAIL: balls burrow into bricks');
process.exit(pass ? 0 : 1);
