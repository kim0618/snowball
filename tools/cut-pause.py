# 일시정지 시안(일시정지.png)에서 얼음 재질을 통째로 오려낸다.
#
#   python3 cut-pause.py [시안파일]
#
# 왜 오리나: 얼음 액자·통계칸·버튼의 광택은 CSS 그라데이션으로 흉내 내면 늘 밋밋해진다.
# 예전엔 눈 캡·크리스털 같은 조각만 오리고 나머지를 CSS 로 그려서 시안과 재질이 어긋났다.
# 이제는 각 부품을 시안에서 사각형으로 그대로 오려 배경으로 깐다.
#
# 알파를 안 만드는 이유: 부품마다 바깥에 파란 발광이 번져 있어 알파로 도려내면 그 발광이 잘린다.
# 대신 부품을 배경 여백까지 물려서 오리고, 액자 그림 쪽은 그 자리의 내용물을 지워 둔다.
# 둘 다 같은 시안의 같은 y 라 배경 그라데이션이 이어져 이음매가 보이지 않는다.
#
# 좌표는 전부 폭 941px 시안 기준 실측값이다(측정: 밝기 프로파일로 테두리 봉우리를 찾음).
import sys, os
import numpy as np
from PIL import Image

# 시안 원본은 ref/pause-design.png 에 둔다(다운로드 폴더는 지워질 수 있어 이 스크립트가 못 돌아간다)
SRC = sys.argv[1] if len(sys.argv) > 1 else \
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'ref', 'pause-design.png')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'img') + '/'

# ---- 액자 ----
# 시안 액자 바깥선 x 65..873, y 243..1476. 여기에 바깥 발광 몫으로 22px 씩 더 물린다.
PANEL = (43, 895, 221, 1498)
# 액자 안에서 내용물(통계·빠른메뉴·버튼·안내문)을 지울 구간.
# 좌우 여백(82~91, 847~856)은 어떤 부품도 안 닿는 순수 배경이라 여기서 밝기를 떠 온다.
WIPE_X0, WIPE_X1 = 92, 846
WIPE_Y0, WIPE_Y1 = 496, 1461
SAMP_L, SAMP_R = (82, 92), (847, 857)
# 좌우를 그냥 선형 보간하면 안 된다: 액자 안쪽 테두리 발광 때문에 여백이 가운데보다 훨씬 밝아
# 가운데까지 밝게 메워져 지우기 시작하는 줄(y 496)에 가로 단차가 생긴다.
# 그래서 부품 사이사이 '아무것도 없는 줄'을 본으로 뜨고 그 사이를 세로로 보간한다.
# 발광 모양(가로)과 파랑→연파랑 그라데이션(세로)이 둘 다 시안 그대로 남는다.
CLEAN = [(478, 500), (752, 786), (822, 833), (1068, 1080), (1244, 1256), (1364, 1386), (1438, 1456)]
BLUR = 41   # 본을 뜰 때 가로로 뭉갤 폭. 반짝이(2~6px)가 세로 줄무늬로 늘어나는 걸 막는다.

# 통계 네 칸은 홈(트로프)까지 통째로 한 장으로 뜬다. 칸을 따로 뜨면 CSS 격자와 시안의
# 칸 간격이 미세하게 어긋나 홈 바닥이 비쳐 보인다. 한 장이면 그 어긋남 자체가 없다.
# 칸 안의 아이콘(트로피·깃발·별·해골)은 그림이라 남기고, 라벨과 숫자만 지워 글꼴로 얹는다.
STAT_X0, STAT_PITCH = 115, 180          # 첫 칸 왼쪽 x, 칸 간격
STAT_WIPE = (18, 152, 600, 702)         # 칸 왼쪽 기준 지울 상자 (dx0, dx1, y0, y1)

# (이름, x0, x1, y0, y1, 글자 지울 상자들)
# 글자 지우기: 그 구간의 좌우 성한 열을 가로로 선형 보간해 메운다.
# 부품 안쪽은 가로 방향 변화가 완만해서(세로 그라데이션) 메운 자리가 티 나지 않는다.
PARTS = [
    # 통계 홈 + 네 칸. 칸 아래 양쪽 모서리의 얼음 조각(y 703~720)은 남겨야 해서 y 702 에서 끊는다.
    ('pause-stats.webp',   95,  843,  502,  749,
     [(STAT_X0 + STAT_PITCH * i + STAT_WIPE[0], STAT_X0 + STAT_PITCH * i + STAT_WIPE[1],
       STAT_WIPE[2], STAT_WIPE[3]) for i in range(4)]),
    # 빠른 메뉴 두 칸. 눈 캡·크리스털·눈꽃 위치가 좌우가 서로 달라 따로 오린다(그림은 그대로 둔다).
    ('pause-quick-l.webp', 109, 469,  828, 1070, [(214, 368, 1002, 1054)]),
    ('pause-quick-r.webp', 469, 829,  828, 1070, [(560, 717, 1002, 1054)]),
    # 이어하기. 위 양쪽 모서리 눈 캡이 버튼 윗선(y 1099)보다 높아 y 1080 부터 물린다.
    ('pause-resume.webp',  109, 829, 1080, 1242, [(369, 569, 1100, 1240)]),
    ('pause-sub-l.webp',   109, 469, 1255, 1366, [(235, 340, 1280, 1340)]),
    ('pause-sub-r.webp',   469, 829, 1255, 1366, [(574, 708, 1280, 1340)]),
]

# 제목 '일시정지'는 얼음을 깎아 만든 그림이라 글꼴로는 못 낸다. 액자에 박힌 채로 둔다.
# (액자 지우기 구간이 y 496 부터라 제목과 부제는 손대지 않는다)


def wipe_text(rgb, box, x_off, y_off):
    """박힌 글자를 그 상자의 좌우 성한 열로 가로 보간해 메운다."""
    tx0, tx1, ty0, ty1 = box
    tx0 -= x_off; tx1 -= x_off; ty0 -= y_off; ty1 -= y_off
    ty0 = max(ty0, 0); ty1 = min(ty1, rgb.shape[0] - 1)
    # 양옆 한 열만 쓰면 그 열에 박힌 반짝이가 가로줄로 늘어난다. 세 열 평균으로 뜬다.
    left = rgb[ty0:ty1 + 1, tx0 - 3:tx0].mean(axis=1)
    right = rgb[ty0:ty1 + 1, tx1 + 1:tx1 + 4].mean(axis=1)
    n = tx1 - tx0 + 2
    for i, x in enumerate(range(tx0, tx1 + 1)):
        f = (i + 1) / n
        rgb[ty0:ty1 + 1, x] = left * (1 - f) + right * f


def save(arr, name, note=''):
    im = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGB')
    im.save(OUT + name, quality=88, method=6)
    kb = os.path.getsize(OUT + name) / 1024
    print(f'{name:22s} {im.size[0]}x{im.size[1]}  가로세로비 {im.size[0]/im.size[1]:.4f}  {kb:.1f}KB {note}')


def main():
    src = Image.open(SRC).convert('RGB')
    if src.size[0] != 941:
        sys.exit(f'{SRC} 폭이 941 이 아니다({src.size}). 좌표가 이 폭 기준이라 그대로 못 쓴다.')
    a = np.asarray(src).astype(float)

    # --- 부품 먼저 (액자를 지우기 전 원본에서 떠 온다) ---
    for name, x0, x1, y0, y1, tboxes in PARTS:
        rgb = a[y0:y1, x0:x1].copy()
        for box in tboxes:
            wipe_text(rgb, box, x0, y0)
        save(rgb, name)

    # --- 액자: 내용물 구간을 '빈 줄 본' 사이 세로 보간으로 다시 그려 지운다 ---
    px0, px1, py0, py1 = PANEL
    panel = a[py0:py1, px0:px1].copy()
    W = WIPE_X1 - WIPE_X0 + 1
    k = np.ones(BLUR) / BLUR
    anchors = []                                   # (기준 y, 가로 본(폭,3))
    for y0, y1 in CLEAN:
        # 중앙값으로 떠서 반짝이·부품 그림자 같은 튀는 값을 걸러낸다
        p = np.median(a[y0:y1, WIPE_X0:WIPE_X1 + 1], axis=0)
        # 가장자리가 말리지 않게 양끝을 늘려 두고 가로로 뭉갠다
        pad = np.vstack([np.repeat(p[:1], BLUR, 0), p, np.repeat(p[-1:], BLUR, 0)])
        p = np.stack([np.convolve(pad[:, c], k, 'same')[BLUR:BLUR + W] for c in range(3)], axis=1)
        anchors.append(((y0 + y1) / 2, p))

    for y in range(WIPE_Y0, WIPE_Y1 + 1):
        i = next((j for j in range(len(anchors) - 1) if y < anchors[j + 1][0]), len(anchors) - 2)
        (ya, pa), (yb, pb) = anchors[i], anchors[i + 1]
        f = np.clip((y - ya) / (yb - ya), 0, 1)
        panel[y - py0, WIPE_X0 - px0:WIPE_X1 - px0 + 1] = pa * (1 - f) + pb * f
    save(panel, 'pause-panel.webp', '(내용물 지움)')


main()
