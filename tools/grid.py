# 시안 좌표를 눈대중이 아니라 눈금으로 읽기 위한 확대 크롭 도구.
#
#   python3 grid.py <x0> <y0> <x1> <y1> [배율] [출력파일]
#
# 시안의 해당 구간을 배율만큼 키우고 10px(원본 기준)마다 눈금선을,
# 50px 마다 굵은 선과 좌표 숫자를 얹는다. 부품 테두리가 어느 x·y 에 있는지
# 그림을 보고 바로 읽을 수 있다.
import sys, os
from PIL import Image, ImageDraw

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, '..', 'ref', 'gameover-design.png')

x0, y0, x1, y1 = (int(v) for v in sys.argv[1:5])
scale = int(sys.argv[5]) if len(sys.argv) > 5 else 3
out = sys.argv[6] if len(sys.argv) > 6 else '/tmp/grid.png'

im = Image.open(SRC).convert('RGB').crop((x0, y0, x1, y1))
im = im.resize((im.width * scale, im.height * scale), Image.LANCZOS)
d = ImageDraw.Draw(im)

for x in range(x0 - x0 % 10 + 10, x1, 10):
    px = (x - x0) * scale
    major = x % 50 == 0
    d.line([(px, 0), (px, im.height)], fill=(255, 0, 0) if major else (255, 140, 140), width=1)
    if major:
        d.text((px + 2, 2), str(x), fill=(255, 255, 0))

for y in range(y0 - y0 % 10 + 10, y1, 10):
    py = (y - y0) * scale
    major = y % 50 == 0
    d.line([(0, py), (im.width, py)], fill=(0, 200, 0) if major else (170, 235, 170), width=1)
    if major:
        d.text((2, py + 2), str(y), fill=(255, 255, 0))

im.save(out)
print(out, im.size, f'원본 {x0},{y0} ~ {x1},{y1}')
