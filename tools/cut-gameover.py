# 게임오버 시안(게임오버.png)에서 얼음 재질을 통째로 오려낸다.
#
#   python3 cut-gameover.py [시안파일]
#
# 일시정지(cut-pause.py)와 같은 방침이다. 얼음 액자·칸·버튼의 광택은 CSS 그라데이션으로
# 흉내 내면 늘 밋밋해지므로, 부품을 시안에서 그대로 오려 배경으로 깔고 값만 글자로 얹는다.
#
# 일시정지와 다른 점: 게임오버 판은 높이가 고정이 아니다(순위 명단이 비면 접히고,
# 도전장 판이면 한 줄이 늘어난다). 그래서 액자는 한 장으로 늘리지 않고 border-image 로
# 쓴다 - 위·아래·양옆 조각은 원래 크기 그대로 찍히고 가운데 면만 늘어난다.
#
# 그 대신 부품은 알파 없이 오릴 수 없다. 가운데 면이 늘어나면 부품이 품고 있던 배경과
# 그 자리 배경의 밝기가 어긋나 네모 자국이 남기 때문이다. 그래서 부품마다 가장자리
# 몇 px 을 알파로 부드럽게 풀어(feather) 경계를 없앤다. 밝기가 조금 어긋나도
# 부드러운 경사면에서는 눈에 잡히지 않는다.
#
# 좌표는 전부 폭 941px 시안 기준 실측값이다(측정: tools/grid.py 눈금 크롭 + 밝기 프로파일).
import sys, os
import numpy as np
from PIL import Image

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE, '..', 'ref', 'gameover-design.png')
OUT = os.path.join(BASE, '..', 'public', 'img') + '/'

# ---- 액자 ----
FRAME_CUT = (34, 292, 914, 1642)      # 오려낼 범위(바깥 발광·눈덩이까지 물린다)
# 액자 안쪽(내용이 놓이는) 상자. CSS 의 border-image 조각 두께가 여기서 나온다.
FRAME_IN = (104, 354, 839, 1609)
# border-image 위 조각의 끝. 모서리 눈덩이(고드름 포함)가 여기서 끝난다.
TOP_SLICE_TO = 525

# 액자 안 내용물을 지울 범위. 모서리 눈덩이가 어디까지 흘러들어왔는지에 따라 3단이다.
#   y < 440       눈덩이 몸통이 안쪽 깊숙이 들어와 있어 가운데만
#   440 ~ 525     고드름 끝이 안쪽 띠(x 106~124)에 남아 있어 그만큼 비켜서
#   525 이후      안쪽 테두리까지 전부
# 처음엔 y 516 까지 통째로 좁게 지웠는데, 점수 뒤 발광까지 좁은 띠로 지우는 바람에
# 안 지운 양옆과 밝기가 어긋나 네모 자국이 그대로 보였다.
# (지운 구간 끝 blend=True 는 원본으로 완만히 넘긴다. 안쪽 테두리에 닿는 3단은
#  섞을 게 없고, 섞으면 오히려 부품 테두리 잔상이 살아나서 끄고 딱 자른다)
WIPE_BANDS = [(356, 440, 200, 742, True),
              (440, 525, 118, 836, True),
              (525, 1608, 106, 837, False)]
WIPE_MAIN_X = (106, 837)
# 내용이 하나도 없는 가로줄. 이 줄들을 본으로 떠서 사이를 세로로 보간해 메운다.
# (좌우 선형보간은 안 된다 - 안쪽 테두리 발광 때문에 여백이 가운데보다 밝아 단차가 생긴다)
#
# 고른 방법: 각 줄을 가로로 크게 뭉갠 것과 비교해 남는 값(=그 줄에 박힌 내용물)이
# 작은 구간만 추렸다. 눈대중으로 고른 첫 판은 눈덩이·버튼 테두리를 물어 액자에 가로 띠가 남았다.
# 맨 위(y<431)와 맨 아래는 본이 없어 양 끝 본을 그대로 이어 쓴다(그 구간은 거의 평평하다).
CLEAN = [(427, 436), (581, 590), (619, 623), (816, 828), (861, 877),
         (905, 917), (1344, 1350), (1468, 1480), (1580, 1592)]
# 액자 맨 위(배지 위)는 양옆이 눈덩이라 폭 전체를 뜰 수 없다. 가운데만 떠서
# 바로 아래 본의 '가로 모양'에 밝기만 맞춰 쓴다. 이게 없으면 위쪽을 아래 본으로
# 그냥 늘리게 되고, 안 지운 양옆과 밝기가 어긋나 세로 이음매가 그대로 보인다.
CLEAN_NARROW = (356, 370, 200, 742)
BLUR = 41   # 본을 뜰 때 가로로 뭉갤 폭. 반짝이가 세로 줄무늬로 늘어나는 걸 막는다

FEATHER = 9  # 부품 가장자리를 알파로 푸는 두께(px)

# (파일명, x0, y0, x1, y1, 글자 지울 상자들, 가장자리 알파 두께)
PARTS = [
    # 게임 오버 배지. 글자가 '최고 기록 갱신!'으로 길어지므로 border-image 로 늘려 쓴다.
    ('go-tag.webp', 366, 358, 584, 439, [(396, 554, 376, 422)], 7),
    # '내 최고' 앞뒤 선 + 마름모. 가운데 글자 길이가 변해서 좌우를 따로 오린다.
    ('go-div-l.webp', 146, 586, 336, 620, [], 7),
    ('go-div-r.webp', 610, 586, 820, 620, [], 7),
    # 통계 세 칸. 왕관·공·보스 그림과 눈꽃 위치가 칸마다 달라 따로 오린다(그림은 남긴다).
    # 위를 620 에서 끊는 이유: 바로 위 '내 최고' 글자 밑동(~617)이 딸려 오기 때문이다.
    # 왕관 꼭대기가 628 이라 620 이면 그림은 온전히 들어온다.
    ('go-stat1.webp', 100, 620, 352, 814, [(126, 330, 674, 776)], FEATHER),
    ('go-stat2.webp', 350, 620, 598, 814, [(374, 578, 674, 776)], FEATHER),
    ('go-stat3.webp', 596, 620, 846, 814, [(620, 824, 674, 776)], FEATHER),
    # 순위판. 줄 수가 변하므로 border-image 로 쓴다(내용은 아래에서 따로 지운다).
    ('go-rank.webp', 96, 912, 847, 1350, [], FEATHER),
    # 내 줄 강조 띠. 줄 높이(83.5)에 맞춰 위아래를 반씩 물려 오린다.
    ('go-rank-me.webp', 100, 1023, 842, 1107, [(134, 812, 1030, 1101)], 7),
    # 다시 도전. 모서리 눈덩이와 눈꽃이 그림이라 통째로 오린다.
    ('go-retry.webp', 98, 1348, 844, 1478, [(300, 640, 1380, 1450)], FEATHER),
    # 보조 버튼 둘. 눈꽃 위치가 좌우가 달라 따로 오린다. 아이콘과 글자는 지우고 DOM 으로 얹는다.
    ('go-sub-l.webp', 100, 1480, 470, 1586, [(160, 420, 1500, 1566)], FEATHER),
    ('go-sub-r.webp', 476, 1480, 846, 1586, [(536, 796, 1500, 1566)], FEATHER),
]

# 알파를 떠서 오려낼 그림들 (배경 위에 얹혀야 하는 것들).
# (파일명, x0, y0, x1, y1)
CUTOUTS = [
    ('go-medal-1.webp', 136, 934, 206, 1002),
    ('go-medal-2.webp', 136, 1029, 206, 1097),
    ('go-medal-3.webp', 136, 1114, 206, 1186),
    ('go-flake-s.webp', 338, 386, 364, 414),    # 배지 옆 작은 눈꽃
    ('go-flake-b.webp', 110, 392, 166, 450),    # 액자 안 큰 눈꽃
]

# 문구와 아이콘이 고정인 부품은 다시 타이핑하거나 SVG로 재현하지 않는다.
# 시안의 픽셀을 글자까지 포함해 통째로 사용한다.
FIXED_PARTS = [
    ('go-tag-fixed.webp', 366, 358, 584, 439, 7),
    ('go-retry-fixed.webp', 98, 1348, 844, 1478, FEATHER),
    ('go-sub-l-fixed.webp', 100, 1480, 470, 1586, FEATHER),
    ('go-sub-r-fixed.webp', 476, 1480, 846, 1586, FEATHER),
]


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


EDGE_BLEND = 26   # 지운 구간의 좌우 끝에서 원본으로 넘어가는 폭(px)


def edge_ramp(n, m=EDGE_BLEND):
    """양 끝에서 0 으로 떨어지는 S 자 가중치. 1 이면 메운 값, 0 이면 원본."""
    r = np.clip((np.arange(n) + .5) / m, 0, 1)
    r = np.minimum(r, r[::-1])
    return r * r * (3 - 2 * r)


def feather_alpha(h, w, m):
    """가장자리 m px 을 0 으로 떨어뜨리는 알파판. 부품 경계의 네모 자국을 없앤다."""
    if m <= 0:
        return np.full((h, w), 255.0)
    ramp_x = np.clip((np.arange(w) + .5) / m, 0, 1)
    ramp_x = np.minimum(ramp_x, ramp_x[::-1])
    ramp_y = np.clip((np.arange(h) + .5) / m, 0, 1)
    ramp_y = np.minimum(ramp_y, ramp_y[::-1])
    # 부드러운 S 자 경사가 선형보다 이음매가 덜 보인다
    e = np.minimum(ramp_y[:, None], ramp_x[None, :])
    return (e * e * (3 - 2 * e)) * 255.0


def save(rgb, alpha, name, note=''):
    arr = np.dstack([np.clip(rgb, 0, 255), np.clip(alpha, 0, 255)]).astype(np.uint8)
    im = Image.fromarray(arr, 'RGBA')
    im.save(OUT + name, quality=90, method=6)
    kb = os.path.getsize(OUT + name) / 1024
    print(f'{name:20s} {im.size[0]:4d}x{im.size[1]:<4d} {kb:6.1f}KB {note}')


def cut_out(a, box, name):
    """배경을 추정해 그림만 남긴다. 배경과 다른 자리를 형태로 잡고 구멍은 메운다."""
    x0, y0, x1, y1 = box
    pad = 10
    reg = a[y0 - pad:y1 + pad, x0 - pad:x1 + pad].copy()
    h, w = reg.shape[:2]
    # 배경 추정: 좌우 바깥 여백(그림이 닿지 않는 곳)을 가로로 보간
    left = reg[:, :6].mean(axis=1)
    right = reg[:, -6:].mean(axis=1)
    f = np.linspace(0, 1, w)[None, :, None]
    bg = left[:, None, :] * (1 - f) + right[:, None, :] * f

    diff = np.abs(reg - bg).max(axis=2)
    # 문턱 하나로는 안 된다. 낮게 잡으면 그림 둘레의 발광을 타고 옆 글자·구분선까지
    # 한 덩어리로 이어지고(메달 2 에 'kjs' 의 k 가 붙어 나왔다), 높게 잡으면
    # 배경과 색이 비슷한 은메달이 통째로 사라진다.
    # 그래서 확실한 부분(strong)으로 몸통을 잡고, 그 둘레 몇 px 안에서만 흐린 부분(weak)을
    # 받아들인다. 멀리 떨어진 얼룩은 흐리든 진하든 들어올 수 없다.
    strong, weak = diff > 55, diff > 18

    def spread(seed, allow):
        """seed 에서 allow 안으로만 번져 나가 닿는 곳 전부."""
        while True:
            g = seed.copy()
            g[1:, :] |= seed[:-1, :]; g[:-1, :] |= seed[1:, :]
            g[:, 1:] |= seed[:, :-1]; g[:, :-1] |= seed[:, 1:]
            g &= allow
            if g.sum() == seed.sum():
                return seed
            seed = g

    def dilate(m, n):
        for _ in range(n):
            g = m.copy()
            g[1:, :] |= m[:-1, :]; g[:-1, :] |= m[1:, :]
            g[:, 1:] |= m[:, :-1]; g[:, :-1] |= m[:, 1:]
            m = g
        return m

    # 씨앗은 한가운데 절반 안의 확실한 점들. 한 점만 쓰면 그 자리가 하필 배경색일 때
    # (은메달 가운데) 통째로 사라진다.
    seed = np.zeros((h, w), bool)
    seed[h // 4:h - h // 4, w // 4:w - w // 4] = True
    body = spread(seed & strong, strong)
    shape = dilate(body, 4) & weak

    # 덩어리 안의 구멍(배경과 색이 우연히 같은 자리)은 메운다
    edge = np.zeros((h, w), bool)
    edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = True
    outside = spread(edge & ~shape, ~shape)

    alpha = np.where(outside, 0.0, 255.0)
    # 경계 한 겹을 부드럽게 (3x3 평균 두 번)
    for _ in range(2):
        p = np.pad(alpha, 1, mode='edge')
        alpha = sum(p[i:i + h, j:j + w] for i in range(3) for j in range(3)) / 9.0
    # 배경이 비쳐 든 반투명 가장자리에서 배경색을 덜어내 흰 테를 막는다
    k = np.clip(alpha / 255.0, .25, 1)[:, :, None]
    rgb = bg + (reg - bg) / k
    save(rgb, alpha, name)


def cut_rank_div(a):
    """순위판의 밝은 구분선만 남기고 그 주변 파란 바탕은 완전히 투명하게 만든다."""
    x0, y0, x1, y1 = 130, 1186, 812, 1204
    rgb = a[y0:y1, x0:x1].copy()
    h, w = rgb.shape[:2]
    top = rgb[:3].mean(axis=0)
    bot = rgb[-3:].mean(axis=0)
    f = np.linspace(0, 1, h)[:, None, None]
    bg = top[None, :, :] * (1 - f) + bot[None, :, :] * f
    # 구분선은 배경보다 모든 채널이 밝다. 양의 밝기 차만 쓰면 파란 바탕 띠가 남지 않는다.
    lift = (rgb - bg).mean(axis=2)
    alpha = np.clip((lift - 2.0) * 28.0, 0, 255)
    alpha[:, :8] *= np.linspace(0, 1, 8)[None, :]
    alpha[:, -8:] *= np.linspace(1, 0, 8)[None, :]
    save(rgb, alpha, 'go-rank-div.webp', '(밝은 선만)')


def main():
    src = Image.open(SRC).convert('RGB')
    if src.size[0] != 941:
        sys.exit(f'{SRC} 폭이 941 이 아니다({src.size}). 좌표가 이 폭 기준이라 그대로 못 쓴다.')
    a = np.asarray(src).astype(float)

    # --- 부품 먼저 (액자를 지우기 전 원본에서 떠 온다) ---
    for name, x0, y0, x1, y1, tboxes, m in PARTS:
        rgb = a[y0:y1, x0:x1].copy()
        for box in tboxes:
            wipe_text(rgb, box, x0, y0)
        if name == 'go-rank.webp':
            wipe_rows(rgb, x0, y0)
        if name == 'go-rank-me.webp':
            # 글자를 지운 자리에 남은 가는 가로 줄만 세로 방향으로 부드럽게 푼다.
            # 테두리와 양끝 눈꽃은 원본 그대로 보존한다.
            src = rgb.copy()
            for _ in range(3):
                p = np.pad(src, ((4, 4), (0, 0), (0, 0)), mode='edge')
                src = sum(p[i:i + rgb.shape[0]] for i in range(9)) / 9.0
            yy, xx = np.ogrid[:rgb.shape[0], :rgb.shape[1]]
            edge_x = np.minimum(xx / 58, (rgb.shape[1] - 1 - xx) / 58)
            edge_y = np.minimum(yy / 14, (rgb.shape[0] - 1 - yy) / 14)
            edge = np.minimum(edge_x, edge_y)
            blend = np.clip(edge, 0, 1)[:, :, None]
            rgb = rgb * (1 - blend) + src * blend
            # 푸른 띠만 원본처럼 진하게 되돌린다. 흰 테두리·눈꽃은 B-R 차가 작아 보존된다.
            blue = np.clip((rgb[:, :, 2] - rgb[:, :, 0] - 8) / 90, 0, 1)[:, :, None] * .48
            target = np.zeros_like(rgb)
            target[:, :, 0], target[:, :, 1], target[:, :, 2] = 10, 78, 220
            rgb = rgb * (1 - blue) + target * blue
        save(rgb, feather_alpha(rgb.shape[0], rgb.shape[1], m), name)

    for name, x0, y0, x1, y1 in CUTOUTS:
        cut_out(a, (x0, y0, x1, y1), name)
    cut_rank_div(a)

    for name, x0, y0, x1, y1, m in FIXED_PARTS:
        rgb = a[y0:y1, x0:x1].copy()
        save(rgb, feather_alpha(rgb.shape[0], rgb.shape[1], m), name, '(글자·아이콘 포함 원본)')

    # --- 액자: 내용물 구간을 '빈 줄 본' 사이 세로 보간으로 다시 그려 지운다 ---
    fx0, fy0, fx1, fy1 = FRAME_CUT
    frame = a[fy0:fy1, fx0:fx1].copy()
    wx0, wx1 = WIPE_MAIN_X
    W = wx1 - wx0 + 1
    k = np.ones(BLUR) / BLUR
    def sample(y0, y1, sx0, sx1):
        # 중앙값으로 떠서 반짝이·부품 그림자 같은 튀는 값을 걸러낸다
        p = np.median(a[y0:y1, sx0:sx1 + 1], axis=0)
        n = sx1 - sx0 + 1
        pad = np.vstack([np.repeat(p[:1], BLUR, 0), p, np.repeat(p[-1:], BLUR, 0)])
        return np.stack([np.convolve(pad[:, c], k, 'same')[BLUR:BLUR + n] for c in range(3)], axis=1)

    anchors = [((y0 + y1) / 2, sample(y0, y1, wx0, wx1)) for y0, y1 in CLEAN]

    ny0, ny1, nx0, nx1 = CLEAN_NARROW
    ref = anchors[0][1]                                    # 바로 아래 본의 가로 모양
    scale = sample(ny0, ny1, nx0, nx1).mean(axis=0) / ref[nx0 - wx0:nx1 - wx0 + 1].mean(axis=0)
    anchors.insert(0, ((ny0 + ny1) / 2, ref * scale))

    for by0, by1, a0, a1, blend in WIPE_BANDS:
        for y in range(by0, by1):
            i = next((j for j in range(len(anchors) - 1) if y < anchors[j + 1][0]), len(anchors) - 2)
            (ya, pa), (yb, pb) = anchors[i], anchors[i + 1]
            f = np.clip((y - ya) / (yb - ya), 0, 1)
            line = pa * (1 - f) + pb * f
            new = line[a0 - wx0:a1 - wx0 + 1]
            sl = frame[y - fy0, a0 - fx0:a1 - fx0 + 1]
            # 지운 구간의 좌우 끝은 원본과 섞어 넘긴다. 메운 밝기가 조금만 어긋나도
            # 딱 끊기면 세로 이음매로 보이는데, 완만히 넘기면 눈에 잡히지 않는다.
            frame[y - fy0, a0 - fx0:a1 - fx0 + 1] = \
                sl + (new - sl) * edge_ramp(a1 - a0 + 1)[:, None] if blend else new
    frame_alpha = np.full(frame.shape[:2], 255.0)
    # 시안 크롭 맨 위에는 로고 밑동과 밤하늘도 함께 들어 있다. 현재 화면의 로고 위치와
    # 겹치면 직사각형 이음매가 되므로, 액자보다 위인 중앙은 투명하게 하고 양끝 눈더미만 남긴다.
    top_h = 38
    frame_alpha[:top_h, 145:735] = 0
    white = frame[:top_h].min(axis=2)
    side_alpha = np.clip((white - 62) * 5.0, 0, 255)
    frame_alpha[:top_h, :145] = side_alpha[:, :145]
    frame_alpha[:top_h, 735:] = side_alpha[:, 735:]
    save(frame, frame_alpha, 'go-frame.webp', '(내용물 지움·윗배경 투명)')


def wipe_rows(rgb, x_off, y_off):
    """순위판 안의 줄(메달·이름·점수·구분선·내 줄 강조)을 위아래 성한 줄 사이 보간으로 지운다."""
    # 판 안쪽에서 내용이 없는 가로줄 두 개를 본으로 뜬다
    top = rgb[924 - y_off:936 - y_off].mean(axis=0)
    bot = rgb[1330 - y_off:1342 - y_off].mean(axis=0)
    y0, y1 = 936 - y_off, 1330 - y_off
    for y in range(y0, y1):
        f = (y - y0) / (y1 - y0)
        rgb[y] = top * (1 - f) + bot * f


main()
