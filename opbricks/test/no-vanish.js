// Every ball must leave play by reaching the floor. A ball removed while still
// high on the board is the "shot gets cut off half way" symptom.
const { load } = require('./harness');
const X = load(`S, CONFIG, startFiring, stepPhysics, updateShift, FIXED_DT,
                traceTrajectory, startFreshGame, LAND_Y, HEIGHT`);
const { S, CONFIG, startFiring, stepPhysics, updateShift, FIXED_DT, traceTrajectory, startFreshGame, LAND_Y } = X;

// Freeze the fly-home animation so S.returning only ever grows. Otherwise an
// entry can be created and retired inside one step and the accounting undercounts.
CONFIG.RETURN_SPEED = 0;

startFreshGame();
const maxA = CONFIG.MAX_ANGLE_FROM_VERTICAL;

function pickAim(i) {
  const ang = -maxA + 2 * maxA * ((i * 7919) % 100) / 100;
  return { x: Math.sin(ang), y: -Math.cos(ang) };
}

// Watch every ball; flag any that stops existing while well above the floor.
let vanished = 0, landed = 0, worstHeight = 0, maxIdleFlight = 0;
const NEAR_FLOOR = LAND_Y - CONFIG.CELL; // generous: within one cell of the floor counts as landed

let guard = 0, turn = 0;
while (S.state !== 'gameover' && guard++ < 1200 && turn < 40) {
  if (S.state === 'aiming') {
    startFiring(pickAim(turn++));
    let prev = new Map();
    let t = 0;
    while (S.state === 'firing' && t++ < 4000) {
      const before = new Map();
      for (const b of S.activeBalls) before.set(b, { x: b.x, y: b.y, lastHit: b.lastHit || 0 });
      const returningBefore = S.returning.length;
      stepPhysics(FIXED_DT);
      const alive = new Set(S.activeBalls);

      // Count how many left play this step and how many of those were handed to
      // the visible fly-home animation. Any surplus vanished into thin air.
      const gone = [];
      for (const [b, p] of before) {
        if (!alive.has(b)) gone.push(p);
        else if ((b.lastHit || 0) > maxIdleFlight) maxIdleFlight = b.lastHit;
      }
      // updateReturning may retire entries in the same step, so measure the delta
      // against how many it could have retired (at most all of them).
      // With RETURN_SPEED frozen this delta is exact.
      let recalled = S.returning.length - returningBefore;
      gone.sort((a, b) => a.y - b.y); // highest balls first: worst case for us
      for (const p of gone) {
        if (recalled > 0) { recalled--; landed++; continue; }
        if (p.y >= NEAR_FLOOR) { landed++; continue; }
        vanished++;
        if (LAND_Y - p.y > worstHeight) worstHeight = LAND_Y - p.y;
      }
    }
  } else if (S.state === 'shifting') {
    let t = 0;
    while (S.state === 'shifting' && t++ < 600) updateShift(FIXED_DT);
  } else break;
}

console.log(`turns simulated       : ${turn}`);
console.log(`balls that landed     : ${landed}`);
console.log(`balls vanished midair : ${vanished}`);
console.log(`worst vanish height   : ${worstHeight.toFixed(0)} px above floor`);
console.log(`longest idle flight   : ${maxIdleFlight.toFixed(1)}s (gravity starts at ${CONFIG.IDLE_GRAVITY_AFTER}s)`);
const pass = vanished === 0;
console.log(pass ? 'PASS: every ball flew to the floor' : 'FAIL: balls are being deleted mid-flight');
process.exit(pass ? 0 : 1);
