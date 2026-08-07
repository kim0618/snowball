// 화면 비율에 따라 줄 수가 달라져도 게임이 정상 동작하고
// 한 판 길이가 기기별로 크게 갈리지 않아야 한다.
const { load } = require('./harness');

function run(viewW, viewH, seed){
  const X = load(`S, CONFIG, startFiring, stepPhysics, updateShift, FIXED_DT,
                  traceTrajectory, startFreshGame, layoutBoard`);
  const { S, CONFIG, startFiring, stepPhysics, updateShift, FIXED_DT, traceTrajectory, startFreshGame } = X;
  X.layoutBoard(viewW, viewH);
  startFreshGame(seed);

  const maxA = CONFIG.MAX_ANGLE_FROM_VERTICAL;
  let rnd = seed;
  const rand = () => { rnd = (rnd*1103515245 + 12345) & 0x7fffffff; return rnd/0x7fffffff; };
  const pick = () => {
    let best=null, bs=-1;
    for (let i=0;i<=40;i++){
      const a=-maxA+2*maxA*i/40, d={x:Math.sin(a),y:-Math.cos(a)};
      const {hitBrick}=traceTrajectory(d);
      let sc=rand()*0.5;
      if (hitBrick){ const b=S.grid[hitBrick.r]&&S.grid[hitBrick.r][hitBrick.c];
        if (b) sc += (b.type==='op'||b.type==='item')?6:3+hitBrick.r*0.4; }
      if (sc>bs){bs=sc;best=d;}
    }
    return best;
  };

  let g=0;
  while (S.state!=='gameover' && g++<2500){
    if (S.state==='aiming'){
      startFiring(pick());
      let t=0; while (S.state==='firing' && t++<4000) stepPhysics(FIXED_DT);
    } else if (S.state==='shifting'){
      let t=0; while (S.state==='shifting' && t++<600) updateShift(FIXED_DT);
    } else break;
  }
  return { rows: CONFIG.GRID_ROWS, round: S.round, pressure: CONFIG.PRESSURE_BASE };
}

const SCREENS = [
  ['아이폰',   390, 650], ['갤럭시', 360, 630],
  ['프로맥스', 430, 720], ['XR',     414, 766],
  ['아이패드', 768, 894], ['데스크톱', 1440, 770],
];
const SEEDS = [11,22,33,44,55];
let fail = 0;
const meds = [];
console.log('화면       줄수  압력   라운드(5판)            중앙값');
for (const [name,w,h] of SCREENS){
  const rs = SEEDS.map(s => run(w,h,s));
  const rounds = rs.map(r=>r.round).sort((a,b)=>a-b);
  const med = rounds[2];
  meds.push(med);
  console.log(`${name.padEnd(9)} ${String(rs[0].rows).padStart(3)}  ${rs[0].pressure.toFixed(2)}   ${rounds.join(',').padEnd(22)} ${String(med).padStart(4)}`);
  if (rounds.some(r => r < 3)) { fail++; console.log('   FAIL: 즉시 사망'); }
}
const lo = Math.min(...meds), hi = Math.max(...meds);
console.log(`\n중앙값 범위 ${lo} ~ ${hi} (배수 ${(hi/lo).toFixed(2)})`);
const consistent = hi/lo <= 2.0;
if (!consistent) fail++;
console.log(consistent ? 'ok    기기별 한 판 길이가 2배 이내' : 'FAIL  기기별 편차가 너무 큼');
console.log(fail===0 ? '\nPASS' : `\nFAIL: ${fail}건`);
process.exit(fail===0?0:1);
