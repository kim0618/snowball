# 게임 본편 화면 자산 굽기: 시안(게임화면.png)에서 얼음 액자와 버튼을 오려 public/img/ 에 넣는다.
#   python3 tools/make-play-art.py [시안경로]
#
# 액자는 CSS border-image(9-슬라이스)로 쓰므로 안쪽을 투명하게 뚫는다.
# 판 위에 얹힌 눈은 액자 바깥으로 삐져나와 있어서, 둥근 사각형 하나로 자르면 눈이 잘린다.
# 그래서 바깥쪽은 '둥근 사각형 ∪ (윗변 위쪽의 밝고 채도 낮은 눈)' 으로 남긴다.
import os, sys, math
from PIL import Image, ImageDraw, ImageFilter

SRC = sys.argv[1] if len(sys.argv) > 1 else '/mnt/c/Users/jinsung/Downloads/게임화면.png'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'img')

# 시안에서 잰 값 (941x1672 기준)
OUTER = (46, 194, 893, 1470)   # 얼음 액자 바깥 모서리
INNER = (70, 216, 872, 1450)   # 판이 시작되는 안쪽 모서리
R_OUT, R_IN = 46, 34           # 각 모서리 둥글기
SNOW_TOP = 158                 # 눈이 쌓여 올라간 꼭대기

im = Image.open(SRC).convert('RGBA')


def rrect_mask(size, box, radius, fill=255):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).rounded_rectangle(box, radius=radius, fill=fill)
    return m


def bake_frame():
    W, H = im.size
    keep = rrect_mask((W, H), OUTER, R_OUT)

    # 액자 윗변 위로 삐져나온 눈을 살린다: 밝고(값 큰) 채도 낮은 픽셀만
    snow = Image.new('L', (W, H), 0)
    px, sp = im.load(), snow.load()
    # 액자 폭 안쪽만 본다. 바깥까지 훑으면 배경의 별·눈송이가 티끌로 남는다.
    for y in range(SNOW_TOP, OUTER[1] + 8):
        for x in range(OUTER[0] + 6, OUTER[2] - 6):
            r, g, b, _ = px[x, y]
            if (r + g + b) / 3 > 168 and max(r, g, b) - min(r, g, b) < 60:
                sp[x, y] = 255
    # 열림(침식→팽창): 배경 반짝이처럼 홀로 뜬 작은 점을 지우고 눈 덩어리만 남긴다
    snow = snow.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(7))
    snow = snow.filter(ImageFilter.GaussianBlur(1.2))

    alpha = Image.new('L', (W, H), 0)
    alpha.paste(keep, (0, 0))
    alpha.paste(snow, (0, 0), snow)
    # 안쪽은 완전히 뚫어 캔버스가 그대로 보이게 한다
    hole = rrect_mask((W, H), INNER, R_IN)
    alpha.paste(0, (0, 0), hole)

    out = im.copy()
    out.putalpha(alpha)

    # 자르는 범위는 '실제로 뭔가 그려진 곳'에서 뽑는다. 예전엔 SNOW_TOP 을 박아 뒀는데
    # 지금 시안엔 액자 위에 눈이 거의 없어서, 위쪽에만 40px 짜리 빈 여백이 남았다.
    # CSS 는 이 그림을 테두리 칸에 늘려 깔기 때문에 그 여백만큼 판 위가 두꺼워 보인다.
    pad = 10
    bb = alpha.getbbox()
    box = (max(0, bb[0] - pad), max(0, bb[1] - pad),
           min(W, bb[2] + pad), min(H, bb[3] + pad))
    out = out.crop(box)
    out.save(os.path.join(OUT, 'frame-ice.webp'), 'WEBP', quality=94, method=6, lossless=False)

    # 캔버스 테두리 폭은 이 비율을 그대로 써야 액자와 판이 맞물린다 (index.html 의 FRAME)
    w, h = out.size
    print('frame-ice.webp', out.size, '| 여백', pad)
    print('  FRAME = { side: %.4f, top: %.4f, bottom: %.4f, radius: %.4f, innerRadius: %.4f }' % (
        (INNER[0] - box[0]) / w, (INNER[1] - box[1]) / h,
        (box[3] - INNER[3]) / h, R_OUT / w, R_IN / w))
    return box


# 아래 버튼(1배속·일괄 회수). 시안엔 글자가 박혀 있는데 라벨은 바뀌므로,
# 가운데를 글자 없는 세로 기둥 하나로 다시 채워 9-슬라이스의 '늘어나는 중앙'으로 만든다.
BTN = (114, 1490, 452, 1626)   # 버튼 바깥(눈 모자 포함)
BTN_R = 30                     # 모서리 둥글기
BTN_CLEAN_X = 237              # 글자·눈꽃이 없는 깨끗한 세로줄
BTN_SLICE = 96                 # 좌우로 원본 그대로 남길 폭


def bake_button():
    x0, y0, x1, y1 = BTN
    c = im.crop(BTN).convert('RGBA')
    w, h = c.size
    px = c.load()
    src = BTN_CLEAN_X - x0
    for x in range(BTN_SLICE, w - BTN_SLICE):
        for y in range(h):
            px[x, y] = px[src, y]

    # 버튼 모양 밖(눈 덮인 바닥 배경)은 잘라낸다. 위쪽 눈 모자는 살린다.
    mask = rrect_mask((w, h), (2, 14, w - 3, h - 3), BTN_R)
    snow = Image.new('L', (w, h), 0)
    sp = snow.load()
    for y in range(0, 26):
        for x in range(6, w - 6):
            r, g, b, _ = px[x, y]
            if (r + g + b) / 3 > 182 and max(r, g, b) - min(r, g, b) < 55:
                sp[x, y] = 255
    snow = snow.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(1.0))
    alpha = Image.new('L', (w, h), 0)
    alpha.paste(mask, (0, 0))
    alpha.paste(snow, (0, 0), snow)
    c.putalpha(alpha)
    c.save(os.path.join(OUT, 'btn-ice-wide.webp'), 'WEBP', quality=94, method=6)
    print('btn-ice-wide.webp', c.size, '| 슬라이스', BTN_SLICE)


# 게임 본편 배경.
# 시안 자체를 배경으로 쓸 수는 없다 - 가운데가 판에 가려 있어서 메우면 줄무늬가 생기고,
# HUD 글자와 아래 버튼까지 그림에 박혀 버린다. 시안의 배경은 이미 있는 밤 그림(bg-auth)과
# 같은 계열이라, 그걸 시안 밝기에 맞춰 살짝 올린 판을 따로 굽는다.
BRIGHTEN = 1.16
SATURATE = 1.06

# 시안의 HUD 하늘은 새까맣지 않다 - #01095B 에서 아래로 갈수록 #002BA0 쪽으로 밝아진다.
# bg-auth 의 윗부분은 거의 검정이라 그대로 쓰면 라운드·점수 글자가 검은 판에 뜬 것처럼
# 보인다. 그래서 시안 하늘색을 행 단위로 재서 위쪽만 끌어올린다.
HUD_RATIO = 194 / 1672    # 시안에서 HUD 가 차지하는 세로 비율
# HUD 아래는 판에 가려 좌우 여백만 보인다. 거기서 갑자기 원래 검정으로 돌아오면
# 가로 띠가 생기므로, 오로라가 자연히 밝아지는 40% 지점까지 길게 풀어준다.
FADE_TO = 0.40


def sky_column():
    """시안에서 글자·장식을 피한 x 구간만 골라 행마다 하늘색을 잰다."""
    cols = list(range(196, 268)) + list(range(556, 640))
    rows = []
    for y in range(0, 194):
        vals = [im.getpixel((x, y))[:3] for x in cols]
        vals.sort(key=lambda c: sum(c))
        mid = vals[len(vals) // 2]          # 중앙값 - 별·눈송이에 안 흔들린다
        rows.append(mid)
    return rows


def bake_bg():
    from PIL import ImageEnhance
    src = Image.open(os.path.join(OUT, 'bg-auth.webp')).convert('RGB')
    out = ImageEnhance.Brightness(src).enhance(BRIGHTEN)
    out = ImageEnhance.Color(out).enhance(SATURATE)

    sky = sky_column()
    W, H = out.size
    px = out.load()
    hud_h = H * HUD_RATIO
    lift_to = int(H * FADE_TO)
    # 시안 하늘은 아래로 갈수록 밝아지고(오로라가 판 뒤에 있다) 이 그림은 40% 지점까지
    # 어두워진다. 두 기울기를 다 맞추려 들면 판 옆 여백에 밝은 가로 띠가 한 줄 남는다.
    # 그래서 기울기 대신 '톤'만 가져온다 - 시안 HUD 하늘의 대표색까지 맨 위를 끌어올리고,
    # 아래로는 단조롭게 풀어 원래 그림에 녹인다.
    top = sorted(px[x, 0] for x in range(W))[W // 2]
    # 대표색은 HUD 위쪽 1/3 지점. 한가운데 색을 쓰면 화면 맨 위가 시안보다 밝아진다.
    tone = sky[int(len(sky) * 0.33)]
    d0 = [tone[i] - top[i] for i in range(3)]
    for y in range(lift_to):
        t = y / lift_to
        w = 1 - t * t * (3 - 2 * t)                   # smoothstep 로 0 까지
        d = [c * w for c in d0]
        for x in range(W):
            r, g, b = px[x, y]
            px[x, y] = (min(255, max(0, int(r + d[0]))),
                        min(255, max(0, int(g + d[1]))),
                        min(255, max(0, int(b + d[2]))))
    out.save(os.path.join(OUT, 'bg-play.webp'), 'WEBP', quality=88, method=6)
    print('bg-play.webp', out.size, f'(bg-auth 밝기 x{BRIGHTEN} + 상단 하늘 시안 보정 {lift_to}행)')


if __name__ == '__main__':
    # 두 번째 인자로 굽고 싶은 것만 고를 수 있다: frame | button | bg
    only = sys.argv[2] if len(sys.argv) > 2 else None
    if only in (None, 'frame'):  bake_frame()
    if only in (None, 'button'): bake_button()
    if only in (None, 'bg'):     bake_bg()
