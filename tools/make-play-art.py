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
    pad = 12
    box = (OUTER[0] - pad, SNOW_TOP - 4, OUTER[2] + pad, OUTER[3] + pad)
    out = out.crop(box)
    out.save(os.path.join(OUT, 'frame-ice.webp'), 'WEBP', quality=94, method=6, lossless=False)
    print('frame-ice.webp', out.size, '| 슬라이스 계산용 여백', pad)
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


def bake_bg():
    from PIL import ImageEnhance
    src = Image.open(os.path.join(OUT, 'bg-auth.webp')).convert('RGB')
    out = ImageEnhance.Brightness(src).enhance(BRIGHTEN)
    out = ImageEnhance.Color(out).enhance(SATURATE)
    out.save(os.path.join(OUT, 'bg-play.webp'), 'WEBP', quality=88, method=6)
    print('bg-play.webp', out.size, f'(bg-auth 밝기 x{BRIGHTEN})')


if __name__ == '__main__':
    bake_frame()
    bake_button()
    bake_bg()
