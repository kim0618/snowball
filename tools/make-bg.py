# 배경 넓은판 굽기: img/bg-*.webp(9:19.5 한 장) → img/bg-*-wide.webp(가로 5칸)
#
#   python3 make-bg.py [블러세기]      기본 14 (숫자가 클수록 양옆이 흐려짐)
#
# 가운데 1칸이 게임 틀과 정확히 겹치고, 좌우는 거울상을 이어붙여 이음매를 없앤다.
# 틀 밖은 시선을 안 뺏게 살짝 흐리고 어둡게 하되, 무슨 그림인지는 보이게 둔다.
# (블러를 칸마다 다르게 주면 칸 경계에 단차가 생기므로, 흐린 판을 통째로 만들어
#  가운데 0 → 바깥 1 로 이어지는 마스크로 섞는다.)
import sys, os
from PIL import Image, ImageFilter, ImageEnhance

BLUR = float(sys.argv[1]) if len(sys.argv) > 1 else 14.0
DIM  = 0.86                      # 바깥칸 밝기
TILES = 5                        # index.html 의 AMBIENT_TILES 와 같아야 한다
IMG = os.path.join(os.path.dirname(__file__), '..', 'public', 'img')

for name in ('bg-auth', 'bg-lobby', 'bg-game', 'bg-play'):
    src = Image.open(os.path.join(IMG, name + '.webp')).convert('RGB')
    w, h = src.size
    flip = src.transpose(Image.FLIP_LEFT_RIGHT)

    strip = Image.new('RGB', (w * TILES, h))
    for i in range(TILES):                       # 가운데 기준 좌우 번갈아 뒤집기
        strip.paste(src if (i - TILES // 2) % 2 == 0 else flip, (i * w, 0))

    soft = strip.filter(ImageFilter.GaussianBlur(BLUR))
    soft = ImageEnhance.Brightness(soft).enhance(DIM)

    # 가운데 칸은 원본 그대로, 바깥으로 갈수록 흐린 판이 드러난다
    mask = Image.new('L', (w * TILES, 1))
    half = w * TILES / 2
    px = mask.load()
    for x in range(w * TILES):
        d = abs(x - half) / (w / 2)              # 가운데 칸 가장자리에서 1.0
        t = min(max((d - 0.9) / 0.8, 0.0), 1.0)  # 칸 경계 조금 앞에서부터 서서히
        px[x, 0] = int(round(255 * t * t * (3 - 2 * t)))
    mask = mask.resize((w * TILES, h))

    out = Image.composite(soft, strip, mask)
    dst = os.path.join(IMG, name + '-wide.webp')
    out.save(dst, 'WEBP', quality=82, method=6)
    print(dst, out.size, os.path.getsize(dst) // 1024, 'KB')
