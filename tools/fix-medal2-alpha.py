# medal-2.webp 의 알파를 다시 따낸다 (1회용 수리)
#
#   python3 fix-medal2-alpha.py            미리보기(파랑 위에 합성해 저장)
#   python3 fix-medal2-alpha.py --go       실제로 덮어쓰기
#
# 증상: 은메달만 x>=16 부터 전 행이 불투명이었다. 알파 컷이 왼쪽 일부에만 적용돼
# 오른쪽 2/3 이 원본 배경(연한 청백색) 사각형째 남아 있었다.
# 흰 판 위에서는 안 보이다가, 로비 '내 줄'을 파랗게 깐 뒤 흰 사각형으로 드러났다.
#
# 방법: 배경이 순백이 아니라 옅은 글로우라서 색 거리만으로 자르면 메달 밝은 면까지 먹는다.
# 테두리에서 flood fill 로 '배경에 연결된' 픽셀만 지운다(메달 안쪽 하이라이트는 테두리와
# 끊겨 있으므로 살아남는다). 임계 26 에서 투명 비율 27.8% 로 금메달(26.6%)과 거의 같다.
import sys, os
import numpy as np
from PIL import Image
from collections import deque

GO = '--go' in sys.argv
IMG = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'img', 'medal-2.webp')
T = 26          # 배경으로 볼 색 거리
FEATHER = (10, 30)   # 이 구간에서 알파를 0→1 로 부드럽게 올린다

im = Image.open(IMG).convert('RGB')
a = np.asarray(im).astype(float)
h, w, _ = a.shape

border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
bg = np.median(border, axis=0)
dist = np.abs(a - bg).sum(axis=2)

seen = np.zeros((h, w), bool)
q = deque()
for x in range(w):
    for y in (0, h - 1):
        if dist[y, x] < T and not seen[y, x]:
            seen[y, x] = True; q.append((y, x))
for y in range(h):
    for x in (0, w - 1):
        if dist[y, x] < T and not seen[y, x]:
            seen[y, x] = True; q.append((y, x))
while q:
    y, x = q.popleft()
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < h and 0 <= nx < w and not seen[ny, nx] and dist[ny, nx] < T:
            seen[ny, nx] = True; q.append((ny, nx))

lo, hi = FEATHER
alpha = np.clip((dist - lo) / (hi - lo), 0, 1)
alpha[seen] = 0.0

# 가장자리 픽셀은 배경과 섞여 있으므로 원색을 되돌린다(흰 테두리 방지)
aa = alpha[:, :, None]
rgb = np.where(aa > 0.02, (a - (1 - aa) * bg) / np.maximum(aa, 0.02), a)
out = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8), 'RGBA')

print(f'배경색 {tuple(bg.astype(int))}  투명픽셀 {(alpha < .5).mean()*100:.1f}%')
if GO:
    out.save(IMG, lossless=True)
    print(f'덮어씀: {IMG}  ({os.path.getsize(IMG)}바이트)')
else:
    prev = Image.new('RGBA', (w * 8, h * 8), (143, 199, 252, 255))
    prev.alpha_composite(out.resize((w * 8, h * 8), Image.NEAREST))
    p = '/tmp/medal2-preview.png'
    prev.convert('RGB').save(p)
    print(f'미리보기 저장: {p}   실제 반영은 --go')
