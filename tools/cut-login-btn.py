# 로그인 화면 시안(login.png)에서 버튼 그림을 알파까지 살려 오려낸다.
#
#   python3 cut-login-btn.py [시안파일]
#
# 왜 다시 오리나: 기존 btn-primary.webp 는 가로세로비 4.09 인데 로그인 버튼 자리는 5.27 이라
# 9분할로 늘리면 가운데 조각만 더 눌려 광택 그라데이션이 끊기고 이음매가 보였다.
# 시안에서 그대로 오려내면 비율이 처음부터 맞아 이음매가 생기지 않는다.
#
# 알파 뽑는 법: 버튼 양옆의 카드 배경을 줄 단위로 재서 그 색과 얼마나 다른지로 알파를 만든다.
# 버튼 파랑(25,115,252)·눈(240,254,255) 둘 다 카드 배경(126,187,251)과 충분히 멀어서 잘 갈린다.
# 가장자리 픽셀은 배경과 섞여 있으므로 C=(C_obs-(1-a)*bg)/a 로 원색을 되돌린다(파란 테두리 방지).
import sys, os
import numpy as np
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else '/mnt/c/Users/jinsung/Downloads/login.png'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'img') + '/'

LOGIN = '/mnt/c/Users/jinsung/Downloads/login.png'
JOIN = '/mnt/c/Users/jinsung/Downloads/회원가입.png'

# (이름, 시안파일, x0, x1, y0, y1, 본체가 시작하는 y) - 시안 941px 폭 기준 실측값
BUTTONS = [
    ('btn-login.webp',  LOGIN, 190, 754, 1031, 1145, 1040),  # 로그인(위에 눈 쌓임)
    ('btn-join.webp',   LOGIN, 190, 754, 1159, 1260, 1163),  # 회원가입
    ('field.webp',      LOGIN, 191, 752,  684,  788,  684),  # 입력칸(아이디칸에서 뜸)
    ('btn-gender.webp', JOIN,  167, 463, 1131, 1230, 1131),  # 성별 토글(남자칸에서 뜸)
]
# 배경을 재는 양옆 띠 (버튼 바깥, 카드 안쪽)
BG_L, BG_R = (172, 188), (760, 776)
# 오려낸 그림 안에서 가로로 메워 지울 범위.
# 버튼은 박혀 있는 글자만, 입력칸은 아이콘+글자를 한 번에 지운다(아이콘은 CSS 가 SVG 로 그린다).
# 입력칸 오른쪽 눈꽃(칸 좌측 기준 495~528)은 그림에 그대로 남겨 둔다.
TEXT_X = {'btn-login.webp': (221, 332), 'btn-join.webp': (218, 336),
          'field.webp': (31, 489), 'btn-gender.webp': (25, 270)}
# 색으로 알파를 뽑으면 칸 바로 위 카드 배경의 반짝이(밝기 230대)까지 불투명으로 딸려와
# 오른쪽 위에 흰 얼룩이 생긴다. 입력칸은 그냥 둥근 사각형이라 알파를 기하로 만드는 게 깨끗하다.
# (이름: 오려낸 그림 안에서의 left, top, right, bottom, 모서리반지름)
RECT_MASK = {'field.webp': (1, 1, 560, 102, 27), 'btn-gender.webp': (2, 2, 293, 96, 24)}


def rounded_mask(w, h, box, r, ss=4):
    """계단 없이 부드러운 둥근 사각형 알파. ss 배로 잘게 재서 평균낸다."""
    x0, y0, x1, y1 = box
    ys = (np.arange(h * ss) + .5) / ss
    xs = (np.arange(w * ss) + .5) / ss
    X, Y = np.meshgrid(xs, ys)
    # 모서리 원의 중심까지 거리로 안팎을 가른다
    cx = np.clip(X, x0 + r, x1 - r)
    cy = np.clip(Y, y0 + r, y1 - r)
    inside = ((X >= x0) & (X <= x1) & (Y >= y0) & (Y <= y1) &
              (np.hypot(X - cx, Y - cy) <= r))
    return inside.reshape(h, ss, w, ss).mean(axis=(1, 3))


def cut(img, name, x0, x1, y0, y1, body_top):
    a = np.asarray(img).astype(float)
    sub = a[y0:y1, x0:x1]
    h, w, _ = sub.shape

    # 줄마다 배경색 추정 (카드 그라데이션이라 위아래로 조금씩 달라진다)
    bg = np.concatenate([a[y0:y1, BG_L[0]:BG_L[1]], a[y0:y1, BG_R[0]:BG_R[1]]], axis=1).mean(axis=1)
    bgf = bg[:, None, :]                       # (h,1,3)

    if name in RECT_MASK:
        *box, rad = RECT_MASK[name]
        alpha = rounded_mask(w, h, box, rad)
    else:
        dist = np.abs(sub - bgf).sum(axis=2)   # 배경과의 거리
        alpha = np.clip((dist - 25.0) / 45.0, 0, 1)

        # 본체(파란 알약) 구간은 속을 꽉 채운다. 위쪽 눈은 생김새를 살려야 하니 건드리지 않는다.
        bt = body_top - y0
        for r in range(bt, h):
            on = np.where(alpha[r] > .5)[0]
            if len(on) > 2:
                alpha[r, on[0]:on[-1] + 1] = 1.0

    # 가장자리에서 배경색 되돌리기
    aa = alpha[:, :, None]
    rgb = np.where(aa > 0.02, (sub - (1 - aa) * bgf) / np.maximum(aa, 0.02), sub)
    rgb = np.clip(rgb, 0, 255)

    # 시안에는 버튼 글자가 그림에 박혀 있다. CSS 가 자기 글자를 얹으므로 지워야 한다.
    # 그 구간의 좌우 성한 열을 가로로 선형 보간해 메운다(버튼의 가로 변화가 완만해서 티가 안 난다).
    t0, t1 = TEXT_X[name]
    left, right = rgb[:, t0 - 1], rgb[:, t1 + 1]
    for i, x in enumerate(range(t0, t1 + 1)):
        f = (i + 1) / (t1 - t0 + 2)
        rgb[:, x] = left * (1 - f) + right * f

    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    im = Image.fromarray(out, 'RGBA')
    # lossless 로 두면 둘이 합쳐 80KB 라 기존 버튼 그림(6KB)에 비해 너무 무겁다.
    # q=86 이면 완만한 그라데이션뿐이라 눈에 띄는 손상 없이 1/6 로 줄어든다.
    im.save(OUT + name, quality=86, method=6, exact=True)
    kb = os.path.getsize(OUT + name) / 1024
    print(f'{name}  {im.size}  가로세로비 {w/h:.2f}  투명픽셀 {round((alpha < .99).mean()*100,1)}%  {kb:.1f}KB')


def main():
    cache = {}
    for name, src, *rest in BUTTONS:
        if src not in cache:
            im = Image.open(src).convert('RGB')
            if im.size[0] != 941:
                sys.exit(f'{src} 폭이 941 이 아니다({im.size}). 좌표가 이 폭 기준이라 그대로 못 쓴다.')
            cache[src] = im
        cut(cache[src], name, *rest)


main()
