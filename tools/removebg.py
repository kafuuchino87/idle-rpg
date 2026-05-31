"""
無損去背：四角採樣 + flood fill from edges
- 從邊緣只清除「連通到邊緣的背景色像素」
- 中央就算同色也保留，不會誤判髮絲/服飾
- 輸出 PNG 用 alpha 通道，主體像素完全無損
"""
import sys
from PIL import Image

def remove_bg(input_path, output_path, threshold=40):
    img = Image.open(input_path).convert('RGBA')
    W, H = img.size
    px = img.load()

    # 採樣四角 + 四邊中點
    coords = [(0,0), (W-1,0), (0,H-1), (W-1,H-1),
              (W//2,0), (W//2,H-1), (0,H//2), (W-1,H//2)]
    samples = []
    for x, y in coords:
        r, g, b, a = px[x, y]
        if a > 240:
            samples.append((r, g, b))

    if not samples:
        img.save(output_path, 'PNG', optimize=False)
        print(f'[skip transparent] {output_path}')
        return

    # 去除重複
    bg_colors = []
    for s in samples:
        dup = any(abs(s[0]-b[0]) + abs(s[1]-b[1]) + abs(s[2]-b[2]) < 30 for b in bg_colors)
        if not dup:
            bg_colors.append(s)
    print(f'  bg colors: {bg_colors}')

    def is_bg(r, g, b):
        for br, bg_, bb in bg_colors:
            if abs(r-br) + abs(g-bg_) + abs(b-bb) < threshold:
                return True
        return False

    visited = bytearray(W * H)
    stack = []

    def try_q(x, y):
        if x < 0 or x >= W or y < 0 or y >= H:
            return
        i = y * W + x
        if visited[i]:
            return
        r, g, b, a = px[x, y]
        if not is_bg(r, g, b):
            return
        visited[i] = 1
        stack.append((x, y))

    for x in range(W):
        try_q(x, 0); try_q(x, H-1)
    for y in range(H):
        try_q(0, y); try_q(W-1, y)

    cleared = 0
    while stack:
        x, y = stack.pop()
        r, g, b, _ = px[x, y]
        px[x, y] = (r, g, b, 0)
        cleared += 1
        try_q(x-1, y); try_q(x+1, y); try_q(x, y-1); try_q(x, y+1)

    img.save(output_path, 'PNG', optimize=False)
    print(f'[done] {output_path}  cleared={cleared} px / {W*H} total')

def remove_bg_aggressive(input_path, output_path, threshold=80):
    """全圖掃描去背：適合純色 chroma key 背景（純綠/純洋紅），會清掉所有近似背景色的像素（包括島嶼）"""
    img = Image.open(input_path).convert('RGBA')
    W, H = img.size
    px = img.load()
    coords = [(0,0), (W-1,0), (0,H-1), (W-1,H-1),
              (W//2,0), (W//2,H-1), (0,H//2), (W-1,H//2)]
    samples = [px[x,y][:3] for x,y in coords if px[x,y][3] > 240]
    if not samples:
        img.save(output_path, 'PNG', optimize=False)
        return
    bg_colors = []
    for s in samples:
        if not any(abs(s[0]-b[0]) + abs(s[1]-b[1]) + abs(s[2]-b[2]) < 30 for b in bg_colors):
            bg_colors.append(s)
    print(f'  bg colors: {bg_colors}')
    cleared = 0
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            for br, bgc, bb in bg_colors:
                if abs(r-br) + abs(g-bgc) + abs(b-bb) < threshold:
                    px[x, y] = (r, g, b, 0)
                    cleared += 1
                    break
    img.save(output_path, 'PNG', optimize=False)
    print(f'[aggressive] {output_path}  cleared={cleared} px / {W*H} total')

def remove_bg_chroma(input_path, output_path, threshold=100, despill_strength=0.95):
    """Chroma key 完整流程：
    1) 採樣四角背景色
    2) 全圖閾值範圍內 → 完全透明
    3) Despill：剩餘像素若還偏綠（半透明衣物混色）→ 把綠色頻道壓下來
    4) 邊緣半透明：判斷 alpha 軟化
    """
    img = Image.open(input_path).convert('RGBA')
    W, H = img.size
    px = img.load()

    coords = [(0,0), (W-1,0), (0,H-1), (W-1,H-1),
              (W//2,0), (W//2,H-1), (0,H//2), (W-1,H//2)]
    samples = [px[x,y][:3] for x,y in coords if px[x,y][3] > 240]
    if not samples:
        img.save(output_path, 'PNG', optimize=False)
        return

    bg_colors = []
    for s in samples:
        if not any(abs(s[0]-b[0]) + abs(s[1]-b[1]) + abs(s[2]-b[2]) < 30 for b in bg_colors):
            bg_colors.append(s)

    is_green_key = all(c[1] > c[0] + 30 and c[1] > c[2] + 30 for c in bg_colors)
    is_magenta_key = all(c[0] > c[1] + 30 and c[2] > c[1] + 30 for c in bg_colors)
    print(f'  bg colors: {bg_colors}  green_key={is_green_key}  magenta_key={is_magenta_key}')

    cleared = 0
    despilled = 0
    softened = 0

    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a == 0:
                continue

            # 1) 純背景 → 完全透明
            matched = False
            min_dist = 999
            for br, bgc, bb in bg_colors:
                d = abs(r-br) + abs(g-bgc) + abs(b-bb)
                if d < min_dist:
                    min_dist = d
                if d < threshold:
                    px[x, y] = (r, g, b, 0)
                    cleared += 1
                    matched = True
                    break

            if matched:
                continue

            # 2) Despill：剩餘像素若偏綠/偏洋紅 → 壓抑該頻道（敏感版）
            if is_green_key and g > r + 3 and g > b + 3:
                neutral_g = min(r, b)
                new_g = int(neutral_g + (g - neutral_g) * (1 - despill_strength))
                new_a = a
                # 半透明邊緣：綠色越多，alpha 越低
                excess = (g - max(r, b)) / 100
                if excess > 0.15:
                    new_a = max(0, int(a * (1 - min(1, excess) * 0.75)))
                    softened += 1
                px[x, y] = (r, new_g, b, new_a)
                despilled += 1
            elif is_magenta_key and r > g + 3 and b > g + 3:
                neutral_rb = g
                new_r = int(neutral_rb + (r - neutral_rb) * (1 - despill_strength))
                new_b = int(neutral_rb + (b - neutral_rb) * (1 - despill_strength))
                px[x, y] = (new_r, g, new_b, a)
                despilled += 1

    img.save(output_path, 'PNG', optimize=False)
    print(f'[chroma] cleared={cleared} despilled={despilled} softened={softened} / {W*H}')

if __name__ == '__main__':
    threshold = int(sys.argv[3]) if len(sys.argv) > 3 else 40
    mode = sys.argv[4] if len(sys.argv) > 4 else 'edge'
    if mode == 'aggressive':
        remove_bg_aggressive(sys.argv[1], sys.argv[2], threshold)
    elif mode == 'chroma':
        remove_bg_chroma(sys.argv[1], sys.argv[2], threshold)
    else:
        remove_bg(sys.argv[1], sys.argv[2], threshold)
