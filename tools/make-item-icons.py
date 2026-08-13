# 아이템 타일 4종(폭탄·분열·점수 2배·화염) 굽기.
#
#   python3 make-item-icons.py
#
# 왜 다시 굽나: 예전 컷은 카드 배경째 오려서 타일 아래에 회색 그림자 띠가 같이 박혀
# 있었고 크기도 106x100 으로 제각각이었다. 특히 화염은 오른쪽이 잘려(그림이 x1~90)
# 정사각 칸에 넣으면 혼자 왼쪽으로 쏠려 보였다. 슬롯 아이템 타일(item-*.webp)은
# make-slot-icons.py 로 152x152 정사각 + 둥근 모서리 마스크로 구웠으므로 같게 맞춘다.
#
# 좌표: 카드 세로 가운데는 시안에서 카드 흰 배경 구간을 재서 넣었고(아래 CARDS),
# 타일 좌우 끝은 그 줄에서 '카드 배경이 아닌 색 덩어리'를 찾아 매번 다시 잰다.
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

DL = '/mnt/c/Users/jinsung/Downloads/'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'img') + '/'
SIZE = 152          # 슬롯 아이템 타일과 같은 크기
MARGIN = 3          # 타일 바깥 테두리가 잘리지 않게 두는 여유

# (이름, 시안파일, 카드 세로 가운데)
# 폭탄·분열·점수 2배는 블록.png, 화염은 화염이 그려진 블록2.png 에서 딴다.
JOBS = [
    ('bomb',   '블록.png',  1223),
    ('frenzy', '블록.png',  1328),
    ('gold',   '블록.png',  1430),
    ('flame',  '블록2.png', 1574),
]
ICON_COL = (100, 240)   # 아이콘이 들어 있는 열(글자 영역은 피한다)


def tile_span(im, cy):
    """카드 가운데 줄에서 타일의 좌우 끝을 잰다."""
    a = np.asarray(im).astype(float) / 255
    mx, mn = a.max(2), a.min(2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    m = ((sat > 0.25) | (mx < 0.80))[cy - 12:cy + 12, ICON_COL[0]:ICON_COL[1]]
    col = m.mean(0)
    xs = [i for i, v in enumerate(col) if v > 0.6]
    if not xs:
        sys.exit(f'타일을 못 찾음: y{cy}')
    return ICON_COL[0] + xs[0], ICON_COL[0] + xs[-1] + 1


def rounded_mask(size, radius_ratio=0.22, feather=1.5):
    r = int(size * radius_ratio)
    m = Image.new('L', (size * 4, size * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size * 4 - 1, size * 4 - 1], radius=r * 4, fill=255)
    m = m.resize((size, size), Image.LANCZOS)
    return m.filter(ImageFilter.GaussianBlur(feather))


def main():
    mask = rounded_mask(SIZE)
    for name, src, cy in JOBS:
        im = Image.open(DL + src).convert('RGB')
        x0, x1 = tile_span(im, cy)
        s = (x1 - x0) + MARGIN * 2
        cx = (x0 + x1) / 2
        box = (round(cx - s / 2), round(cy - s / 2), round(cx + s / 2), round(cy + s / 2))
        tile = im.crop(box).resize((SIZE, SIZE), Image.LANCZOS).convert('RGBA')
        tile.putalpha(mask)
        tile.save(OUT + f'badge-item-{name}.webp', quality=95, method=6)
        print(f'{name:<7} {src} 타일 x{x0}~{x1}(w{x1-x0}) 세로중심 {cy} -> {box} -> {SIZE}x{SIZE}')


if __name__ == '__main__':
    main()
