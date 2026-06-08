"""Isolate the main figure by masking out floating decorations.

Strategy:
  1. Build a strict solid mask (alpha > solid_thr) — this kills the
     thin sparkle/HUD connections that link the figure to decorations.
  2. Find the largest connected component on that strict mask — this
     is the character body core.
  3. Dilate that mask by `radius` pixels to recover wings/halos/
     translucent edges that surround the body.
  4. Apply the dilated mask to the original: keep original alpha
     inside the mask, set alpha=0 outside.

Usage:
    python isolate-figure.py input.png output.png [solid_thr] [radius]
        solid_thr   alpha threshold for the strict mask (default 200)
        radius      dilation radius in pixels (default 80)
"""
import sys
import numpy as np
from PIL import Image
from scipy.ndimage import label as cc_label, binary_dilation, generate_binary_structure


def main():
    inp = sys.argv[1]
    out = sys.argv[2]
    solid_thr = int(sys.argv[3]) if len(sys.argv) > 3 else 200
    radius = int(sys.argv[4]) if len(sys.argv) > 4 else 80

    img = Image.open(inp).convert('RGBA')
    rgba = np.array(img)
    H, W = rgba.shape[:2]
    alpha = rgba[:, :, 3]

    # 1) strict solid mask
    solid = alpha > solid_thr
    print(f'Strict solid pixels (alpha>{solid_thr}): {solid.sum():,} / {H*W:,}')

    # 2) connected components, keep largest
    struct = generate_binary_structure(2, 2)  # 8-connectivity
    labeled, n_labels = cc_label(solid, structure=struct)
    if n_labels == 0:
        print('No solid components found — output = input')
        img.save(out, 'PNG')
        return

    sizes = np.bincount(labeled.flatten())
    sizes[0] = 0  # ignore background
    largest = int(np.argmax(sizes))
    print(f'Found {n_labels} solid components, largest = label {largest} with {sizes[largest]:,} px')
    print(f'  Top 5 sizes: {sorted(sizes.tolist(), reverse=True)[:5]}')

    body_mask = (labeled == largest)

    # 3) dilate to recover wings/halos/edges
    # Use a disk-shaped structuring element via iterated dilation
    print(f'Dilating by {radius} px...')
    dilated = binary_dilation(body_mask, structure=struct, iterations=radius)
    print(f'Dilated mask: {dilated.sum():,} px ({100.0*dilated.sum()/(H*W):.1f}% of image)')

    # 4) apply mask
    keep = dilated
    cleared = (~keep & (alpha > 0)).sum()
    rgba[~keep, 3] = 0

    Image.fromarray(rgba, 'RGBA').save(out, 'PNG')
    print(f'Cleared {cleared:,} px outside dilated body mask')


if __name__ == '__main__':
    main()
