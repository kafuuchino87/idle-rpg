"""Apply a soft elliptical vignette to an RGBA image.

Fades alpha smoothly from full opacity at center to zero past an
outer ellipse. Avoids the harsh rectangular cutouts of erase-regions.py.

Strategy:
  - Compute normalized elliptical distance d from image center.
    d=0 at center, d=1 at the inner ellipse, d=outer_ratio at the
    outer ellipse where alpha hits 0.
  - alpha_multiplier = smoothstep(d, 1.0, outer_ratio):
      d ≤ 1.0          → 1.0 (no change)
      1.0 < d < outer  → smooth falloff
      d ≥ outer        → 0

Usage:
    python soft-vignette.py input.png output.png [rx_frac] [ry_frac] [outer_ratio]
        rx_frac       inner ellipse horizontal radius as fraction of W/2 (default 0.75)
        ry_frac       inner ellipse vertical radius as fraction of H/2 (default 0.95)
        outer_ratio   outer ellipse is this * inner (default 1.15)
"""
import sys
import numpy as np
from PIL import Image


def main():
    inp = sys.argv[1]
    out = sys.argv[2]
    rx_frac = float(sys.argv[3]) if len(sys.argv) > 3 else 0.75
    ry_frac = float(sys.argv[4]) if len(sys.argv) > 4 else 0.95
    outer_ratio = float(sys.argv[5]) if len(sys.argv) > 5 else 1.15

    img = Image.open(inp).convert('RGBA')
    rgba = np.array(img)
    H, W = rgba.shape[:2]
    alpha = rgba[:, :, 3].astype(np.float32)

    cx, cy = W / 2.0, H / 2.0
    rx = (W / 2.0) * rx_frac
    ry = (H / 2.0) * ry_frac

    ys, xs = np.indices((H, W))
    nx = (xs - cx) / rx
    ny = (ys - cy) / ry
    d = np.sqrt(nx * nx + ny * ny)

    # smoothstep from d=1 to d=outer_ratio
    falloff = outer_ratio - 1.0
    t = np.clip((outer_ratio - d) / falloff, 0.0, 1.0)
    # cubic smoothstep for smoother curve
    smooth = t * t * (3.0 - 2.0 * t)

    new_alpha = alpha * smooth
    rgba[:, :, 3] = new_alpha.astype(np.uint8)

    cleared = int(((alpha > 0) & (rgba[:, :, 3] == 0)).sum())
    softened = int(((rgba[:, :, 3] > 0) & (rgba[:, :, 3] < alpha)).sum())
    print(f'Center ({cx:.0f},{cy:.0f}) inner rx={rx:.0f} ry={ry:.0f} outer×{outer_ratio}')
    print(f'Cleared {cleared:,} px / softened {softened:,} px / W={W} H={H}')

    Image.fromarray(rgba, 'RGBA').save(out, 'PNG')


if __name__ == '__main__':
    main()
