# 슬롯 아이템 아이콘 굽기: 도감 시안에서 아이콘 타일 6개를 오려 public/img/item-*.webp 로 넣는다.
#
#   python3 make-slot-icons.py [시안파일]
#
# 시안(ChatGPT 생성 도감 이미지)은 카드가 세로로 6장 쌓인 구조고, 각 카드 왼쪽에
# 둥근 사각형 아이콘 타일이 있다. 좌표를 눈대중으로 박아두면 시안을 다시 받을 때마다
# 어긋나므로, 카드 위치부터 이미지에서 재서 찾는다.
#  - 카드 세로 구간: 아이콘 왼쪽 글로우 띠(x 95~108)가 밝아지는 구간으로 찾는다
#  - 아이콘 경계: 그 구간 안에서 '카드 배경(밝고 무채색)이 아닌' 픽셀 덩어리
#  - 타일 바깥은 카드 배경이 묻어 나오므로 둥근 사각형 마스크로 잘라낸다
import sys, os
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

SRC = sys.argv[1] if len(sys.argv) > 1 else \
    '/mnt/c/Users/jinsung/Downloads/ChatGPT Image 2026년 8월 12일 오후 01_00_25 (2).png'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'img') + '/'

# 도감에 실린 순서 그대로. 파일명은 코드의 아이템 kind 와 같게 둔다.
NAMES = ['thunder', 'blizzard', 'foresight', 'bigball', 'stopline', 'sweep']


def find_cards(lum, H):
    """아이콘 왼쪽 글로우 띠가 밝아지는 구간 = 카드(아이콘) 세로 위치."""
    band = lum[:, 95:108].mean(1)
    runs, inb, s = [], False, 0
    for y in range(430, H):
        b = band[y] > 190
        if b and not inb:
            s, inb = y, True
        elif not b and inb:
            if y - s > 80:
                runs.append((s, y))
            inb = False
    if inb and H - s > 80:
        runs.append((s, H))
    return runs


def icon_box(lum, sat, s, e):
    """카드 배경이 아닌 덩어리의 경계. x 는 아이콘 열(110~300)로 좁혀 텍스트를 피한다."""
    m = (lum[s:e] < 218) | (sat[s:e] > 0.22)
    col = m[:, 110:300].mean(0)
    xs = [110 + i for i, v in enumerate(col) if v > 0.5]
    x0, x1 = xs[0], xs[-1] + 1
    row = m[:, x0:x1].mean(1)
    ys = [y for y, v in enumerate(row) if v > 0.5]
    return x0, s + ys[0], x1, s + ys[-1] + 1


def rounded_mask(size, radius_ratio=0.22, feather=1.5):
    r = int(size * radius_ratio)
    m = Image.new('L', (size * 4, size * 4), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size * 4 - 1, size * 4 - 1], radius=r * 4, fill=255)
    m = m.resize((size, size), Image.LANCZOS)
    return m.filter(ImageFilter.GaussianBlur(feather))


def main():
    im = Image.open(SRC).convert('RGB')
    a = np.asarray(im).astype(float)
    H = a.shape[0]
    lum = a @ [.299, .587, .114]
    mx, mn = a.max(2), a.min(2)
    sat = (mx - mn) / np.clip(mx, 1, None)

    cards = find_cards(lum, H)
    if len(cards) != len(NAMES):
        raise SystemExit(f'카드를 {len(cards)}장 찾았다 - {len(NAMES)}장이어야 한다. 시안이 바뀌었는지 확인할 것')

    boxes = [icon_box(lum, sat, s, e) for s, e in cards]
    # 아이콘은 정사각 타일이다. 글로우 때문에 세로만 들쭉날쭉하게 잡히므로,
    # 가로 폭(가장 안정적으로 잡힌다)을 한 변으로 삼고 중심을 맞춰 정사각형으로 자른다.
    side = int(round(np.median([x1 - x0 for x0, _, x1, _ in boxes])))
    mask = rounded_mask(side)

    for name, (x0, y0, x1, y1) in zip(NAMES, boxes):
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        left, top = cx - side // 2, cy - side // 2
        tile = im.crop((left, top, left + side, top + side)).convert('RGBA')
        tile.putalpha(mask)
        tile.save(OUT + 'item-%s.webp' % name, 'WEBP', quality=94, method=6)
        print(f'  item-{name}.webp  {side}x{side}  (원본 {left},{top})')

    # 눈으로 확인하는 용도의 시트 한 장
    sheet = Image.new('RGBA', (side * len(NAMES), side), (10, 30, 80, 255))
    for i, name in enumerate(NAMES):
        sheet.alpha_composite(Image.open(OUT + 'item-%s.webp' % name).convert('RGBA'), (i * side, 0))
    sheet.save(OUT + '..' + '/../tools/slot-icons-sheet.png')
    print('확인용 시트: tools/slot-icons-sheet.png')


main()
