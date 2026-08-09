const assert = require('assert');
const { load } = require('./harness');

const X = load(`S, CONFIG, startFreshGame, startFiring, handleFireQueue,
                applyOperator, finishTurn, ballPower`);
const { S, CONFIG, startFreshGame, startFiring, handleFireQueue,
  applyOperator, finishTurn, ballPower } = X;

startFreshGame();
S.ballCount = 75;
startFiring({ x: 0, y: -1 });
handleFireQueue(3);
const clones = [];
applyOperator({ op: 'x2' }, 0, new Set(), clones);
assert.strictEqual(S.activeBalls.length, 75, '75 balls should launch individually');
assert.strictEqual(clones.length, 75, 'x2 should create 75 more physical balls');

startFreshGame();
S.collectedForNextTurn = 155;
finishTurn();
assert.strictEqual(S.ballCount, CONFIG.MAX_BALLS, 'owned balls should cap at 150');
assert.strictEqual(S.bonusPower, 5, 'five overflow balls should become five bonus attack');
startFiring({ x: 0, y: -1 });
handleFireQueue(3);
assert.strictEqual(S.activeBalls.length, 150, 'all 150 balls should launch individually');
assert.strictEqual(S.fireQueueRemaining, 0, '150-ball volley should not leave another launch queued');
assert.strictEqual(S.activeBalls.filter(b => ballPower(b) === 2).length, 5,
  'exactly five balls should have attack power 2');
assert.strictEqual(S.activeBalls.filter(b => ballPower(b) === 1).length, 145,
  'the other 145 balls should keep attack power 1');

const overflowClones = [];
applyOperator({ op: 'x2' }, 0, new Set(), overflowClones);
assert.strictEqual(overflowClones.length, 0, 'x2 at the cap should not create ball 151');
assert.strictEqual(S.activeBalls.reduce((sum, b) => sum + ballPower(b), 0), 310,
  'x2 at the cap should double total attack power');

console.log('ball cap checks passed');
