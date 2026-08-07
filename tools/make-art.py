# 도감·게임 방법 화면 그림 굽기: 시안(4.png/5.png)에서 제목 글씨와 얼음 블록 뱃지를 오려 img/ 에 넣는다.
#
#   python3 make-art.py [시안폴더]
#
#  - 제목: 짙은 남색 배경을 상수로 보고 빼내면 글자는 불투명, 파란 네온은 반투명으로 남는다
#  - 뱃지: 채도 높은 덩어리 중 '정사각형에 가깝고 속이 찬' 것만 골라 오린다
#  - 시안에 없는 블록(분열·점수 2배)은 뱃지에서 글자를 지워 빈 큐브를 만들고 색상만 돌린다
import sys, os
from PIL import Image, ImageFilter, ImageDraw
import numpy as np
SRC = sys.argv[1] if len(sys.argv) > 1 else '/mnt/c/Users/jinsung/Downloads'
D = SRC.rstrip('/') + '/'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'img') + '/'


def cut(src, region, out, W, thr=0.55):
    im = Image.open(src).convert('RGB')
    a = np.asarray(im).astype(float)
    x0r, y0r, x1r, y1r = region
    sub = a[y0r:y1r, x0r:x1r]
    lum = sub @ [.299,.587,.114]
    # 글자가 있는 자리만 남긴다
    ys, xs = np.where(lum > 185)
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    py, px = int((y1-y0)*.55), int((x1-x0)*.10)
    Y0, Y1 = max(0, y0-py), min(sub.shape[0], y1+py)
    X0, X1 = max(0, x0-px), min(sub.shape[1], x1+px)
    c = sub[Y0:Y1, X0:X1]
    h, w, _ = c.shape

    # 배경(짙은 남색)을 테두리에서 재고 빼낸다
    k = max(6, min(h, w)//14)
    edge = np.concatenate([c[:k].reshape(-1,3), c[-k:].reshape(-1,3),
                           c[:, :k].reshape(-1,3), c[:, -k:].reshape(-1,3)])
    bg = np.median(edge, 0)
    d = c - bg
    ex = np.clip((d/np.clip(255-bg,1,None)).max(2), 0, 1)

    solid = ex > thr
    si = Image.fromarray((solid*255).astype(np.uint8)) \
            .filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.MinFilter(9))
    a_solid = np.clip((np.asarray(si.filter(ImageFilter.GaussianBlur(1.4))).astype(float)/255-0.4)/0.35, 0, 1)

    blue = np.clip((c[:,:,2]-c[:,:,0]-30)/70, 0, 1)
    lim = np.asarray(Image.fromarray((solid*255).astype(np.uint8))
            .filter(ImageFilter.GaussianBlur(38))).astype(float)/255
    a_glow = np.clip((ex-0.07)/0.93, 0, 1) * blue * np.clip(lim*4.0, 0, 1)

    al = np.maximum(a_solid, a_glow)
    yy, xx = np.mgrid[0:h, 0:w]
    r = np.sqrt(((xx-w/2)/(w/2))**2 + ((yy-h/2)/(h/2))**2)
    al = al * np.maximum(np.clip((1-r)/0.40, 0, 1)**1.3, a_solid)
    al[al < 0.02] = 0

    safe = np.where(al > .004, al, 1)
    f = np.clip(bg + d/safe[...,None], 0, 255)
    t = np.clip((0.5-al)/0.5, 0, 1)[...,None]
    f = f*(1-t) + np.array([80.,170.,255.])*t          # 옅은 후광은 네온 파랑으로
    f = np.where(a_solid[...,None] > 0.5, c, f)
    o = Image.fromarray(np.dstack([f, al*255]).astype(np.uint8), 'RGBA')
    o = o.crop(o.getbbox()); o.thumbnail((W, W*4), Image.LANCZOS)
    o.save(out, 'WEBP', quality=90, method=6)
    print(out, o.size)

cut(D+'5.png', (250, 105, 700, 268), OUT + 't-howto.webp', 560)
cut(D+'4.png', (245, 62, 700, 200), OUT + 't-guide.webp', 560)
cut(D+'2.png', (170, 430, 780, 600), OUT + 't-register.webp', 560)


def spanfill(m):
    r_=np.zeros_like(m); c_=np.zeros_like(m)
    for r in np.where(m.any(1))[0]:
        c=np.where(m[r])[0]; r_[r,c[0]:c[-1]+1]=True
    for c in np.where(m.any(0))[0]:
        r=np.where(m[:,c])[0]; c_[r[0]:r[-1]+1,c]=True
    return r_&c_

def find_cubes(src):
    """채도 높은 덩어리 중 '정사각형에 가깝고 속이 꽉 찬' 것만 뱃지로 본다"""
    a=np.asarray(Image.open(src).convert('RGB')).astype(float)
    sat=a.max(2)-a.min(2); lum=a@[.299,.587,.114]
    m=((sat>90)&(lum>50)).astype(np.uint8)*255
    img=Image.fromarray(m).copy()               # 255=후보(PIL 이 직접 고칠 수 있게 복사)
    boxes=[]
    while True:
        arr=np.array(img)
        ys,xs=np.where(arr==255)
        if len(ys)==0: break
        before=arr==255
        ImageDraw.floodfill(img,(int(xs[0]),int(ys[0])),0)   # 한 덩어리를 지우면서 세어 나간다
        sel=before & (np.array(img)!=255)
        ys,xs=np.where(sel)
        y0,y1,x0,x1=ys.min(),ys.max(),xs.min(),xs.max()
        w,h=x1-x0+1,y1-y0+1
        if 95<w<190 and 95<h<190 and .72<w/h<1.38 and sel.sum()/(w*h)>.6:
            boxes.append((y0,y1,x0,x1))
    boxes.sort()
    return a, boxes

def cut(src, names):
    a,boxes=find_cubes(src)
    print(src, '정사각 덩어리', len(boxes))
    for i,(y0,y1,x0,x1) in enumerate(boxes):
        if i>=len(names): break
        p=8
        c=a[max(0,y0-p):y1+p, max(0,x0-p):x1+p]
        m=spanfill((c.max(2)-c.min(2))>90)
        mi=Image.fromarray((m*255).astype(np.uint8)) \
             .filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
        al=np.clip((np.asarray(mi.filter(ImageFilter.GaussianBlur(1.3))).astype(float)/255-0.4)/0.35,0,1)
        o=Image.fromarray(np.dstack([c,al*255]).astype(np.uint8),'RGBA')
        o=o.crop(o.getbbox()); o.thumbnail((132,132),Image.LANCZOS)
        o.save(OUT+'badge-%s.webp'%names[i],'WEBP',quality=92,method=6)
        print(' ', names[i], o.size, 'src', (x0,y0,x1-x0,y1-y0))

cut(D+'4.png', ['num','boss','grow','x2','plus','minus','bomb'])
cut(D+'5.png', ['n1','n2','n3','ball','hp','order'])


# 시안 큐브에서 글자만 지워 '빈 큐브'를 만든다.
# 몸통이 세로 그라데이션이라, 글자 자리를 같은 줄의 좌우 여백 색으로 메우면 티가 안 난다.
src = Image.open(OUT + 'badge-x2.webp').convert('RGBA')
a = np.asarray(src).astype(float)
h, w, _ = a.shape
rgb, al = a[:, :, :3], a[:, :, 3]/255
sat = rgb.max(2)-rgb.min(2); lum = rgb@[.299, .587, .114]

inner = np.zeros((h, w), bool)
inner[int(h*.18):int(h*.86), int(w*.14):int(w*.86)] = True
glyph = inner & (sat < 60) & (lum > 175)                 # 가운데의 흰 글자
gi = Image.fromarray((glyph*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))
glyph = np.asarray(gi) > 127

out = rgb.copy()
for y in range(h):
    row = glyph[y]
    if not row.any(): continue
    body = (~glyph[y]) & (al[y] > .7)
    xs = np.where(body)[0]
    if len(xs) < 8: continue
    left = rgb[y, xs[xs < w/2][-6:]] if (xs < w/2).any() else None
    right = rgb[y, xs[xs > w/2][:6]] if (xs > w/2).any() else None
    for x in np.where(row)[0]:
        if left is not None and right is not None:
            t = (x - xs[0]) / max(1, xs[-1]-xs[0])
            out[y, x] = np.median(left, 0)*(1-t) + np.median(right, 0)*t
        else:
            out[y, x] = np.median(left if left is not None else right, 0)

# 메운 자리 경계를 부드럽게
m = Image.fromarray((glyph*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.5))
soft = np.asarray(Image.fromarray(out.astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.2))).astype(float)
k = (np.asarray(m).astype(float)/255)[..., None]
out = out*(1-k) + soft*k

o = Image.fromarray(np.dstack([out, al*255]).astype(np.uint8), 'RGBA')
BLANK = o


o = BLANK
a = np.asarray(o).astype(float)
rgb, al = a[:, :, :3]/255, a[:, :, 3]

def rotate_hue(rgb, deg):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    mx, mn = rgb.max(2), rgb.min(2)
    v = mx; d = mx-mn
    s = np.where(mx > 0, d/np.maximum(mx, 1e-6), 0)
    h = np.zeros_like(v)
    m = d > 1e-6
    rm = m & (mx == r); gm = m & (mx == g) & ~rm; bm = m & (mx == b) & ~rm & ~gm
    h[rm] = ((g-b)[rm]/d[rm]) % 6
    h[gm] = ((b-r)[gm]/d[gm]) + 2
    h[bm] = ((r-g)[bm]/d[bm]) + 4
    h = (h/6 + deg/360.0) % 1.0
    i = np.floor(h*6); f = h*6 - i
    p = v*(1-s); q = v*(1-f*s); t = v*(1-(1-f)*s)
    i = i.astype(int) % 6
    out = np.zeros_like(rgb)
    for k, (R, G, B) in enumerate([(v,t,p),(q,v,p),(p,v,t),(p,q,v),(t,p,v),(v,p,q)]):
        sel = i == k
        out[sel] = np.stack([R, G, B], -1)[sel]
    return out

for name, deg in [('blank-purple', 218), ('blank-gold', -12)]:
    out = np.clip(rotate_hue(rgb, deg)*255, 0, 255)
    im = Image.fromarray(np.dstack([out, al]).astype(np.uint8), 'RGBA')
    im.save(OUT + 'badge-%s.webp' % name, 'WEBP', quality=92, method=6)
    print(name, im.size)

# ---- 닫기 버튼(얼음 큐브) ----
a=np.asarray(Image.open(D+'4.png').convert('RGB')).astype(float)
c=a[50:200, 780:920]                       # 오른쪽 위 닫기 버튼
h,w,_=c.shape
k=8
cor=np.concatenate([c[:k,:k].reshape(-1,3),c[:k,-k:].reshape(-1,3),
                    c[-k:,:k].reshape(-1,3),c[-k:,-k:].reshape(-1,3)])
bg=np.median(cor,0); print('배경', bg)
d=c-bg
ex=np.clip((d/np.clip(255-bg,1,None)).max(2),0,1)
solid=spanfill(ex>0.42)
si=Image.fromarray((solid*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
al=np.clip((np.asarray(si.filter(ImageFilter.GaussianBlur(1.3))).astype(float)/255-0.4)/0.35,0,1)
o=Image.fromarray(np.dstack([c,al*255]).astype(np.uint8),'RGBA')
o=o.crop(o.getbbox()); o.thumbnail((128,128),Image.LANCZOS)
o.save(OUT + 'btn-close.webp','WEBP',quality=92,method=6)
print('btn-close', o.size)
