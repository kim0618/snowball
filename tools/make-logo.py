# 눈덩이 로고 굽기: 회색 배경에 박힌 원본 그림에서 알파를 뽑아 img/*.webp 를 만든다.
#
#   python3 make-logo.py [원본폴더]
#
# 원본(ChatGPT 로 뽑은 그림)은 회색 스튜디오 배경 위에 있다. 배경을 상수로 보고
# 빼내면(additive) 글자·아이콘은 알파 1, 파란 네온은 자연스러운 반투명으로 남는다.
# 흰 눈과 회색 배경 헤이즈는 밝기가 겹쳐서 안 갈리므로, 눈은 "결(고주파)"로 찾는다.
import sys, glob, os
SRC = sys.argv[1] if len(sys.argv) > 1 else '/mnt/c/Users/jinsung/Downloads'
def pick(tag):
    hits = sorted(glob.glob(os.path.join(SRC, '*10_13_15*%s*.png' % tag)))
    if not hits: raise SystemExit('원본을 못 찾음: %s' % tag)
    return hits[-1]

from PIL import Image, ImageFilter
import numpy as np
src=pick('(1)')      # 앱 아이콘
a=np.asarray(Image.open(src).convert('RGB')).astype(float)
h,w,_=a.shape; sat=a.max(2)-a.min(2)
def spanfill(m):
    r_=np.zeros_like(m); c_=np.zeros_like(m)
    for r in np.where(m.any(1))[0]:
        c=np.where(m[r])[0]; r_[r,c[0]:c[-1]+1]=True
    for c in np.where(m.any(0))[0]:
        r=np.where(m[:,c])[0]; c_[r[0]:r[-1]+1,c]=True
    return r_&c_
body=spanfill(sat>200)
ys,xs=np.where(body); y0,y1,x0,x1=ys.min(),ys.max(),xs.min(),xs.max()

# 본체 위로 삐져나온 눈: 회색 헤이즈는 매끈하고 눈은 결이 있다 → 고주파 성분으로 가른다
lum=Image.fromarray((a@[.299,.587,.114]).astype(np.uint8))
hf=np.asarray(lum).astype(float)-np.asarray(lum.filter(ImageFilter.GaussianBlur(45))).astype(float)
seed=np.zeros_like(body)
top=max(0,y0-110)
seed[top:y0+6, x0:x1+1]=hf[top:y0+6, x0:x1+1]>8
si=Image.fromarray((seed*255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(5))
seed=np.asarray(si)>127
cap=np.zeros_like(body)
tops={}
for c in range(x0,x1+1):
    r=np.where(seed[:,c])[0]
    if len(r): tops[c]=r.min()
if tops:
    cols=sorted(tops)
    sm={c:int(np.median([tops[k] for k in cols if abs(k-c)<=7])) for c in cols}
    for c in cols:
        r=np.where(body[:,c])[0]
        bt=int(r.min()) if len(r) else y0        # 그 칸의 본체 윗선까지 이어 붙여야 틈이 안 생긴다
        cap[sm[c]:bt+2, c]=True
solid=body|cap

si=Image.fromarray((solid*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
a_solid=np.clip((np.asarray(si.filter(ImageFilter.GaussianBlur(1.4))).astype(float)/255-0.4)/0.35,0,1)

k=max(h,w)//25
cor=np.concatenate([a[:k,:k].reshape(-1,3),a[:k,-k:].reshape(-1,3),a[-k:,:k].reshape(-1,3),a[-k:,-k:].reshape(-1,3)])
bg=np.median(cor,0); d=a-bg
ex=np.clip((d/np.clip(255-bg,1,None)).max(2),0,1)
blue=np.clip((a[:,:,2]-a[:,:,0]-45)/70,0,1)          # 파란 네온만 글로우로 남긴다
a_glow=np.clip((ex-0.04)/0.96,0,1)*blue
lim=np.asarray(Image.fromarray((solid*255).astype(np.uint8))
      .filter(ImageFilter.GaussianBlur(55))).astype(float)/255
a_glow*=np.clip(lim*3.0,0,1)                          # 본체에서 먼 회색 헤이즈 잔상 제거
al=np.maximum(a_solid,a_glow); al[al<0.02]=0
safe=np.where(al>.004,al,1)
f=np.clip(bg+d/safe[...,None],0,255)
f=np.where(a_solid[...,None]>0.5,a,f)
out=Image.fromarray(np.dstack([f,al*255]).astype(np.uint8),'RGBA')
out=out.crop(out.getbbox()); out.save('logo-icon.png'); print('icon',out.size)


# ---------- 글자 로고 ----------
# ⚠ 아이콘과 같이 뽑은 원본(10_13_15 (2).png)은 글자가 '눈떵이'로 잘못 그려져 있다(ㄷ 이 두 개).
# 철자가 맞는 로그인 시안 1.png 에서 오려 쓴다. 배경이 파란 그라데이션이라 밝기 빼기로는
# 글자 아래 3D 그림자가 날아가므로, 흰 글자 면을 잡아 살짝 부풀리는 방식을 쓴다.
from PIL import ImageDraw
MOCK = os.path.join(SRC, '1.png')
if not os.path.exists(MOCK): raise SystemExit('로그인 시안 1.png 를 못 찾음')
c = np.asarray(Image.open(MOCK).convert('RGB').crop((180, 335, 700, 595))).astype(float)
lum = c @ [.299, .587, .114]; sat2 = c.max(2) - c.min(2)
core = (lum > 198) & (sat2 < 75)
ci = Image.fromarray((core*255).astype(np.uint8)) \
        .filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
body = ci.filter(ImageFilter.MaxFilter(11))
img = body.copy()
keep = np.zeros(np.array(img).shape, bool)
while True:                                    # 배경 눈송이 장식은 버리고 글자 덩어리만 남긴다
    a2 = np.array(img)
    ys, xs = np.where(a2 == 255)
    if len(ys) == 0: break
    before = a2 == 255
    ImageDraw.floodfill(img, (int(xs[0]), int(ys[0])), 0)
    sel = before & (np.array(img) != 255)
    yy, xx = np.where(sel)
    if sel.sum() > 1200 and (yy.max()-yy.min()) > 60: keep |= sel
alw = np.clip((np.asarray(Image.fromarray((keep*255).astype(np.uint8))
        .filter(ImageFilter.GaussianBlur(2.0))).astype(float)/255 - 0.4)/0.35, 0, 1)
ow = Image.fromarray(np.dstack([c, alw*255]).astype(np.uint8), 'RGBA')
ow = ow.crop(ow.getbbox()); ow.thumbnail((760, 760*4), Image.LANCZOS)
ow.save('/home/tjd618/snowball/opbricks/img/logo-word.webp', 'WEBP', quality=92, method=6)
print('word', ow.size)
