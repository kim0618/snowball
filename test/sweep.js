// Sweep difficulty parameters and report rounds survived per config.
const { load } = require('./harness');

function runOnce(overrides, seed) {
  const X = load(`S, CONFIG, startFiring, stepPhysics, updateShift, FIXED_DT,
                  traceTrajectory, startFreshGame, createRng`);
  const { S, CONFIG, startFiring, stepPhysics, updateShift, FIXED_DT, traceTrajectory, startFreshGame } = X;
  Object.assign(CONFIG, overrides);
  startFreshGame();
  S.rng = X.createRng(seed);

  const maxA = CONFIG.MAX_ANGLE_FROM_VERTICAL;
  let rnd = seed;
  const rand = () => { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return rnd / 0x7fffffff; };

  function pickAim() {
    let best = null, bestScore = -1;
    for (let i = 0; i <= 40; i++) {
      const ang = -maxA + 2 * maxA * i / 40;
      const dir = { x: Math.sin(ang), y: -Math.cos(ang) };
      const { hitBrick } = traceTrajectory(dir);
      let score = rand() * 0.5;
      if (hitBrick) {
        const b = S.grid[hitBrick.r] && S.grid[hitBrick.r][hitBrick.c];
        if (b) score += (b.type === 'op' || b.type === 'item') ? 6 : 3 + hitBrick.r * 0.4;
      }
      if (score > bestScore) { bestScore = score; best = dir; }
    }
    return best;
  }

  let guard = 0, turnTicks = [];
  while (S.state !== 'gameover' && guard++ < 3000) {
    if (S.state === 'aiming') {
      startFiring(pickAim());
      let t = 0;
      while (S.state === 'firing' && t < 4000) { stepPhysics(FIXED_DT); t++; }
      turnTicks.push(t);
    } else if (S.state === 'shifting') {
      let t = 0;
      while (S.state === 'shifting' && t++ < 600) updateShift(FIXED_DT);
    } else break;
  }
  const avgTurn = turnTicks.reduce((a, b) => a + b, 0) / (turnTicks.length || 1) / 60;
  return { round: S.round, score: S.score, avgTurn, turns: turnTicks.length };
}

const configs = [
  { name: 'A base .55 (now)   ', o: {} },
  { name: 'B base .65         ', o: { PRESSURE_BASE: 0.65 } },
  { name: 'C base .75         ', o: { PRESSURE_BASE: 0.75 } },
  { name: 'D .65 + floor 1.6  ', o: { PRESSURE_BASE: 0.65, ROUND_FLOOR_SLOPE: 1.6 } },
  { name: 'E .75 + floor 1.6  ', o: { PRESSURE_BASE: 0.75, ROUND_FLOOR_SLOPE: 1.6 } },
];

const SEEDS = [11, 22, 33, 44, 55, 66, 77, 88];
console.log('config                 rounds (8 seeds)                  median  avg turn  est.session');
for (const c of configs) {
  const rs = SEEDS.map(s => runOnce(c.o, s));
  const rounds = rs.map(r => r.round).sort((a, b) => a - b);
  const med = rounds[Math.floor(rounds.length / 2)];
  const avgTurn = rs.reduce((a, r) => a + r.avgTurn, 0) / rs.length;
  const sess = (med * (avgTurn + 2.5)) / 60; // + ~2.5s aiming per turn
  console.log(`${c.name} ${rounds.join(',').padEnd(33)} ${String(med).padStart(4)}   ${avgTurn.toFixed(1)}s     ${sess.toFixed(1)}min`);
}
