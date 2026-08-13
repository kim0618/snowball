// 2026-08-13 사용자 지적 4건에 대한 회귀 테스트.
//  1) 판 위 보관형 아이템은 종류가 안 보여야 한다(전부 ❔), 종류는 주울 때 정해진다
//  3) 눈길 읽기를 두 개 쓰면 턴이 더해져야 한다
//  4) 눈보라는 같은 발사를 한 번 더 한다(한 번에 두 배가 아니라 두 번)
//  5) 최고기록은 계정별로 갈려 있어야 한다(로그아웃해도 남아 다음 계정에 얹히면 안 된다)
const { load } = require('./harness');

let fail = 0;
const ok = (cond, msg, extra='') => {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}${extra ? '  ' + extra : ''}`);
  if (!cond) fail++;
};

// ---- 1. 판 위에서는 전부 ❔ 한 종류 ----
{
  const X = load(`S, CONFIG, generateRow, createRng, STORED_ITEMS, MYSTERY,
                  isStoredItem, isSlotBrick, applyItem, itemVisual`);
  const { S, CONFIG, generateRow, createRng, STORED_ITEMS, MYSTERY, isStoredItem, isSlotBrick } = X;

  const rng = createRng(1234);
  const seen = new Set();
  let items = 0, mystery = 0;
  for (let n = 0; n < 4000; n++) {
    for (const b of generateRow(rng, 1 + (n % 30), 20)) {
      if (b && b.type === 'item') { items++; seen.add(b.kind); if (b.kind === MYSTERY) mystery++; }
    }
  }
  const leaked = [...seen].filter(isStoredItem);
  ok(items > 200, '아이템 블록이 충분히 나왔다(표본)', `${items}개`);
  ok(leaked.length === 0, '판에 보관형 종류가 그대로 노출되지 않는다', `노출=${leaked.join(',') || '없음'}`);
  ok(mystery > 0, '❔ 블록이 나온다', `${mystery}개 / 아이템 ${items}개`);
  ok(seen.has('bomb') && seen.has('flame'), '즉발형은 지금처럼 종류가 그대로 보인다',
     [...seen].sort().join(','));

  // 주울 때 종류가 정해진다. 여러 번 주우면 여러 종류가 나와야 한다(무작위).
  S.rng = createRng(77);
  const got = new Set();
  for (let n = 0; n < 300; n++) {
    S.slots = [];
    X.applyItem(MYSTERY, 0, 0, []);
    if (S.slots.length !== 1 || !isStoredItem(S.slots[0])) { fail++; console.log('FAIL  ❔를 주웠는데 슬롯이 이상함', JSON.stringify(S.slots)); break; }
    got.add(S.slots[0]);
  }
  ok(got.size === STORED_ITEMS.length, '주울 때마다 보관형 6종이 골고루 나온다',
     `${got.size}종 = ${[...got].join(',')}`);
  ok(isSlotBrick(MYSTERY) && !isSlotBrick('bomb'),
     '슬롯이 꽉 찼을 때 막는 판정이 ❔에도 걸린다');
  ok(itemVisualDiffers(X), '❔ 색이 다른 아이템 색과 겹치지 않는다');
  S.slots = [];
}
function itemVisualDiffers(X){
  const m = X.itemVisual(X.MYSTERY).color;
  return ['bomb','frenzy','gold','flame'].every(k => X.itemVisual(k).color !== m);
}

// ---- 1b. 실제로 공에 맞았을 때(판 -> 슬롯) ----
{
  const X = load(`S, CONFIG, startFreshGame, startFiring, stepPhysics, FIXED_DT,
                  MYSTERY, isStoredItem, layoutBoard`);
  const { S, CONFIG, startFreshGame, startFiring, stepPhysics, FIXED_DT, MYSTERY, isStoredItem } = X;
  X.layoutBoard(390, 700);
  startFreshGame(42);
  // 판을 비우고 발사대 바로 위에 ❔ 하나만 둔다
  S.grid = Array.from({length: CONFIG.GRID_ROWS}, () => new Array(CONFIG.COLS).fill(null));
  const col = Math.floor(CONFIG.COLS/2);
  S.grid[CONFIG.GRID_ROWS-3][col] = { type:'item', kind: MYSTERY };
  S.launcherX = col*CONFIG.CELL + CONFIG.CELL/2;
  startFiring({x:0, y:-1});
  for (let t=0; t<4000 && S.state === 'firing'; t++) stepPhysics(FIXED_DT);
  ok(S.grid[CONFIG.GRID_ROWS-3][col] === null, '❔ 블록이 깨졌다');
  ok(S.slots.length === 1 && isStoredItem(S.slots[0]), '슬롯에 진짜 아이템이 담겼다', S.slots.join(','));
}

// ---- 3. 눈길 읽기 중첩 ----
{
  const X = load(`S, CONFIG, useSlotItem, startFreshGame, layoutBoard, traceTrajectory`);
  const { S, CONFIG, useSlotItem, startFreshGame } = X;
  X.layoutBoard(390, 700);
  startFreshGame(7);
  S.state = 'aiming'; S.paused = false;   // 로드 직후엔 타이틀 화면이라 멈춰 있다
  S.slots = ['foresight', 'foresight'];
  useSlotItem(0);
  const afterOne = S.foresightTurns;
  useSlotItem(0);
  const afterTwo = S.foresightTurns;
  ok(afterOne === CONFIG.FORESIGHT_TURNS, '한 개 쓰면 기본 턴 수', `${afterOne}턴`);
  ok(afterTwo === CONFIG.FORESIGHT_TURNS * 2, '두 개를 쓰면 턴이 더해진다(중첩)',
     `${afterOne} -> ${afterTwo}턴`);

  // 상한 밖으로는 안 넘어간다
  S.foresightTurns = CONFIG.FORESIGHT_MAX_TURNS;
  S.slots = ['foresight'];
  useSlotItem(0);
  ok(S.foresightTurns === CONFIG.FORESIGHT_MAX_TURNS, '상한을 넘지 않는다',
     `${S.foresightTurns}/${CONFIG.FORESIGHT_MAX_TURNS}턴`);
}

// ---- 4. 눈보라는 같은 발사를 두 번 ----
function runOneTurn(useBlizzard){
  const X = load(`S, CONFIG, startFreshGame, startFiring, stepPhysics, updateShift,
                  FIXED_DT, useSlotItem, layoutBoard`);
  const { S, CONFIG, startFreshGame, startFiring, stepPhysics, updateShift, FIXED_DT, useSlotItem } = X;
  X.layoutBoard(390, 700);
  startFreshGame(5);
  S.grid = Array.from({length: CONFIG.GRID_ROWS}, () => new Array(CONFIG.COLS).fill(null));
  S.ballCount = 10; S.bonusPower = 0;
  S.state = 'aiming'; S.paused = false;
  if (useBlizzard) { S.slots = ['blizzard']; useSlotItem(0); }
  const roundBefore = S.round;
  startFiring({x:0, y:-1});
  // 발사가 몇 번 일어났는지 = 대기열이 0에서 다시 차오른 횟수
  let volleys = 1, prevQueued = S.fireQueueRemaining, fired = S.fireQueueRemaining;
  for (let t=0; t<12000 && S.state === 'firing'; t++) {
    stepPhysics(FIXED_DT);
    if (S.fireQueueRemaining > prevQueued) { volleys++; fired += S.fireQueueRemaining; }
    prevQueued = S.fireQueueRemaining;
  }
  for (let t=0; t<600 && S.state === 'shifting'; t++) updateShift(FIXED_DT);
  return { volleys, fired, roundBefore, round: S.round, ballCount: S.ballCount, S, CONFIG };
}
{
  const plain = runOneTurn(false);
  const bliz = runOneTurn(true);
  ok(plain.volleys === 1, '평소에는 한 턴에 한 번 쏜다', `${plain.volleys}번 · 공 ${plain.fired}개`);
  ok(bliz.volleys === bliz.CONFIG.BLIZZARD_VOLLEYS,
     `눈보라는 ${bliz.CONFIG.BLIZZARD_VOLLEYS}번 연달아 쏜다`, `${bliz.volleys}번`);
  ok(bliz.fired === plain.fired * bliz.CONFIG.BLIZZARD_VOLLEYS,
     '두 번째 발사는 첫 발사와 같은 양', `${plain.fired} -> 총 ${bliz.fired}개`);
  ok(bliz.round === bliz.roundBefore + 1,
     '두 번 쏘고 나서야 턴이 끝난다(줄은 한 번만 내려온다)', `${bliz.roundBefore} -> ${bliz.round}라운드`);
  ok(bliz.ballCount === plain.ballCount * 2,
     '회수량은 예전 2배 그대로', `평소 ${plain.ballCount} · 눈보라 ${bliz.ballCount}`);
  ok(bliz.S.blizzardEncore === 0 && bliz.S.blizzardArmed === false,
     '턴이 끝나면 눈보라는 남지 않는다');
}

// ---- 5. 최고기록은 계정별 ----
{
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  const X = load(`LB, lbLoad, lbSaveLocal, lbLoadPersonal, EMPTY_STATS`, { localStorage });
  const { LB, lbLoad, lbSaveLocal, lbLoadPersonal } = X;

  // 계정 A가 5만점을 기록
  LB.id = 'alice'; LB.nick = 'alice'; LB.best = 50000; LB.pending = 0;
  lbSaveLocal();

  // 로그아웃(계정을 놓는다) -> 계정 B 로그인
  LB.id = ''; lbLoadPersonal();
  ok(LB.best === 0, '로그아웃하면 앞 사람 기록이 안 남는다', `best=${LB.best}`);
  LB.id = 'bob'; lbLoadPersonal();
  ok(LB.best === 0, '다른 계정으로 로그인하면 최고기록이 0에서 시작', `best=${LB.best}`);

  // B가 1000점을 냈을 때 서버로 올라가는 값(submitScore 의 toSend 계산과 같은 식)
  const toSend = Math.max(1000, LB.pending, LB.best);
  ok(toSend === 1000, 'B의 제출값에 A의 기록이 섞이지 않는다', `${toSend}점`);
  LB.best = 1000; lbSaveLocal();

  // A로 돌아오면 A의 기록은 그대로
  LB.id = 'alice'; lbLoadPersonal();
  ok(LB.best === 50000, 'A로 돌아오면 A 기록이 그대로 있다', `best=${LB.best}`);

  // 옛 저장(계정 구분 없던 시절)은 그때 로그인해 있던 계정 몫으로 한 번 옮겨진다
  store.clear();
  store.set('snowball.id', 'carol');
  store.set('snowball.best', '12345');
  store.set('snowball.pending', '0');
  lbLoad();
  ok(LB.best === 12345, '옛 기록이 사라지지 않고 이어진다', `best=${LB.best}`);
  ok(store.get('snowball.best.carol') === '12345' && !store.has('snowball.best'),
     '옛 키는 계정 키로 옮겨지고 지워진다');
  LB.id = 'dave'; lbLoadPersonal();
  ok(LB.best === 0, '옮긴 뒤에도 다른 계정에는 안 얹힌다', `best=${LB.best}`);
}

console.log(fail ? `\nFAIL: ${fail}건` : '\nPASS');
process.exit(fail ? 1 : 0);
