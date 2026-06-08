"""Apply a feathered keep-mask defined by a union of regions.

Each region is a rectangle or an ellipse. The output alpha = original
alpha * smoothstep(distance_to_region, 0, feather_px).

Region spec: "rect:x1,y1,x2,y2" or "ell:cx,cy,rx,ry"

Usage:
    python multi-region-mask.py input.png output.png feather_px region [region...]

Example:
    python multi-region-mask.py in.png out.png 60 \\
        ell:594,662,350,640 \\
        rect:40,75,260,220 \\
        rect:830,75,1090,220
"""
import sys
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt


def parse_region(spec):
    kind, vals = spec.split(':', 1)
    nums = [int(v) for v in vals.split(',')]
    return kind, nums


def main():
    inp = sys.argv[1]
    out = sys.argv[2]
    feather = int(sys.argv[3])
    regions = [parse_region(s) for s in sys.argv[4:]]

    img = Image.open(inp).convert('RGBA')
    rgba = np.array(img)
    H, W = rgba.shape[:2]
    alpha = rgba[:, :, 3].astype(np.float32)

    # Build binary keep mask: True for any pixel inside any region
    keep = np.zeros((H, W), dtype=bool)
    ys, xs = np.indices((H, W))
    for kind, vals in regions:
        if kind == 'rect':
            x1, y1, x2, y2 = vals
            keep |= (xs >= x1) & (xs < x2) & (ys >= y1) & (ys < y2)
        elif kind == 'ell':
            cx, cy, rx, ry = vals
            keep |= ((xs - cx) ** 2 / (rx * rx) + (ys - cy) ** 2 / (ry * ry)) <= 1.0
        else:
            print(f'Unknown region type: {kind}', file=sys.stderr)
            sys.exit(1)

    print(f'Keep mask: {int(keep.sum()):,} px ({100.0*keep.sum()/(H*W):.1f}% of image)')

    # Distance from nearest keep pixel; 0 inside keep regions
    dist = distance_transform_edt(~keep)

    # Smoothstep falloff: 1 inside, 0 at distance >= feather, smooth between
    t = np.clip(1.0 - dist / feather, 0.0, 1.0)
    smooth = t * t * (3.0 - 2.0 * t)

    new_alpha = alpha * smooth
    rgba[:, :, 3] = new_alpha.astype(np.uint8)

    cleared = int(((alpha > 0) & (rgba[:, :, 3] == 0)).sum())
    softened = int(((rgba[:, :, 3] > 0) & (rgba[:, :, 3] < alpha)).sum())
    print(f'Cleared {cleared:,} px / softened {softened:,} px')

    Image.fromarray(rgba, 'RGBA').save(out, 'PNG')


if __name__ == '__main__':
    main()
