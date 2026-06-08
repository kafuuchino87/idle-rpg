"""Erase specific rectangular regions from a PNG (set alpha=0).

Usage:
    python erase-regions.py input.png output.png x1,y1,x2,y2 [more...]

Coordinates are pixel-space (0-indexed top-left). Each region is
"x1,y1,x2,y2" with the half-open convention (x2/y2 exclusive).
"""
import sys
import numpy as np
from PIL import Image


def main():
    inp = sys.argv[1]
    out = sys.argv[2]
    regions = []
    for spec in sys.argv[3:]:
        x1, y1, x2, y2 = (int(v) for v in spec.split(','))
        regions.append((x1, y1, x2, y2))

    img = Image.open(inp).convert('RGBA')
    rgba = np.array(img)
    H, W = rgba.shape[:2]

    total_cleared = 0
    for x1, y1, x2, y2 in regions:
        x1 = max(0, x1); y1 = max(0, y1)
        x2 = min(W, x2); y2 = min(H, y2)
        region = rgba[y1:y2, x1:x2, 3]
        before = int((region > 0).sum())
        rgba[y1:y2, x1:x2, 3] = 0
        total_cleared += before
        print(f'  Erased ({x1},{y1})-({x2},{y2}): {before:,} px')

    Image.fromarray(rgba, 'RGBA').save(out, 'PNG')
    print(f'Total cleared: {total_cleared:,} px')


if __name__ == '__main__':
    main()
