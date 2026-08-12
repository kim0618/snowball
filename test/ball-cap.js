const assert = require('assert');
const { load } = require('./harness');

const X = load(`S, CONFIG, startFreshGame, startFiring, handleFireQueue,
                applyOperator, finishTurn, ballPower`);
const { S, CONFIG, startFreshGame, startFiring, handleFireQueue,
  applyOperator, finishTurn, ballPower } = X;

const CAP = CONFIG.MAX_BALLS;

startFreshGame();
S.ballCount = Math.floor(CAP / 2);
startFiring({ x: 0, y: -1 });
handleFireQueue(3);
const clones = [];
applyOperator({ op: 'x2' }, 0, new Set(), clones);
assert.strictEqual(S.activeBalls.length, Math.floor(CAP / 2), 'half a cap of balls should launch individually');
assert.strictEqual(clones.length, Math.floor(CAP / 2), 'x2 below the cap should create that many more physical balls');

startFreshGame();
S.collectedForNextTurn = CAP + 5;
finishTurn();
assert.strictEqual(S.ballCount, CAP, `owned balls should cap at ${CAP}`);
assert.strictEqual(S.bonusPower, 5, 'five overflow balls should become five bonus attack');
startFiring({ x: 0, y: -1 });
handleFireQueue(3);
assert.strictEqual(S.activeBalls.length, CAP, `all ${CAP} balls should launch individually`);
assert.strictEqual(S.fireQueueRemaining, 0, 'a full-cap volley should not leave another launch queued');
assert.strictEqual(S.activeBalls.filter(b => ballPower(b) === 2).length, 5,
  'exactly five balls should have attack power 2');
assert.strictEqual(S.activeBalls.filter(b => ballPower(b) === 1).length, CAP - 5,
  'the other balls should keep attack power 1');

const overflowClones = [];
applyOperator({ op: 'x2' }, 0, new Set(), overflowClones);
assert.strictEqual(overflowClones.length, 0, `x2 at the cap should not create ball ${CAP + 1}`);
assert.strictEqual(S.activeBalls.reduce((sum, b) => sum + ballPower(b), 0), (CAP + 5) * 2,
  'x2 at the cap should double total attack power');

console.log('ball cap checks passed');
