// The dotted guide line must match where the ball actually goes.
// Board is frozen (indestructible bricks) so only physics-vs-preview is under test.
const { load } = require('./harness');
const X = load(`S, CONFIG, startFiring, stepPhysics, FIXED_DT, traceTrajectory,
                physicsSubsteps, substep, LAUNCHER_Y`);
const { S, CONFIG, startFiring, stepPhysics, FIXED_DT, traceTrajectory, LAUNCHER_Y } = X;

// Play a few rounds so the board has bricks in non-trivial places.
for (let t = 0; t < 6; t++) {
  startFiring({ x: Math.sin(0.3), y: -Math.cos(0.3) });
  let g = 0;
  while (S.state === 'firing' && g++ < 5000) stepPhysics(FIXED_DT);
  if (S.state !== 'aiming') { S.shiftAnim = 0; S.state = 'aiming'; }
}

for (let r = 0; r < S.grid.length; r++)
  for (let c = 0; c < S.grid[r].length; c++)
    if (S.grid[r][c]) S.grid[r][c] = { type: 'hp', hp: 99999, maxHp: 99999 };

const stepPx = CONFIG.BALL_SPEED * (FIXED_DT / X.physicsSubsteps());
const maxA = CONFIG.MAX_ANGLE_FROM_VERTICAL;
let worst = 0, checked = 0, beyond = 0;

for (let i = 0; i <= 24; i++) {
  const ang = -maxA + 2 * maxA * i / 24;
  const dir = { x: Math.sin(ang), y: -Math.cos(ang) };
  const grid0 = S.grid.map(r => r.map(c => (c ? { ...c } : null)));

  const { pts } = traceTrajectory(dir);
  if (pts.length < 2) continue;

  S.grid = grid0.map(r => r.map(c => (c ? { ...c } : null)));
  S.activeBalls = [{ x: S.launcherX, y: LAUNCHER_Y, vx: dir.x * CONFIG.BALL_SPEED, vy: dir.y * CONFIG.BALL_SPEED, age: 0 }];
  S.returning = []; S.fireQueueRemaining = 0; S.frenzyActive = false; S.state = 'firing';

  const path = [];
  const subs = X.physicsSubsteps();
  let guard = 0;
  while (S.activeBalls.length && guard++ < 3000) {
    for (let s = 0; s < subs; s++) X.substep(FIXED_DT / subs);
    if (S.activeBalls[0]) path.push({ x: S.activeBalls[0].x, y: S.activeBalls[0].y });
  }

  checked++;
  let maxDev = 0;
  for (const p of pts.slice(1, -1)) {
    let best = Infinity;
    for (const a of path) {
      const d = Math.hypot(a.x - p.x, a.y - p.y);
      if (d < best) best = d;
    }
    if (best > maxDev) maxDev = best;
  }
  if (maxDev > stepPx * 1.10) beyond++;
  if (maxDev > worst) worst = maxDev;
  S.grid = grid0;
}

console.log(`angles checked        : ${checked}  (+/-${(maxA * 180 / Math.PI).toFixed(0)}deg)`);
console.log(`integration step      : ${stepPx.toFixed(2)} px`);
console.log(`worst deviation       : ${worst.toFixed(2)} px`);
console.log(`vertices beyond 1 step: ${beyond}`);
const pass = worst <= stepPx * 1.10;
console.log(pass ? 'PASS: preview matches simulation' : 'FAIL: preview diverges');
process.exit(pass ? 0 : 1);
