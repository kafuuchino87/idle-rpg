"""Remove only small disconnected blobs, keep all large content.

Unlike isolate-figure.py (which keeps only the largest) or
soft-vignette.py (which fades by distance), this script:
  - Finds connected components on a permissive alpha threshold.
  - Drops components smaller than min_size pixels.
  - Keeps everything else with original alpha intact.

Use when the figure + meaningful decorations (HUDs, weapons) should
all be preserved, and only noise/sparkles should go.

Usage:
    python drop-small-blobs.py input.png output.png [min_size] [alpha_thr]
        min_size    drop components smaller than this many pixels (default 500)
        alpha_thr   pixel counts as part of blob if alpha > this (default 20)
"""
import sys
import numpy as np
from PIL import Image
from scipy.ndimage import label as cc_label, generate_binary_structure


def main():
    inp = sys.argv[1]
    out = sys.argv[2]
    min_size = int(sys.argv[3]) if len(sys.argv) > 3 else 500
    alpha_thr = int(sys.argv[4]) if len(sys.argv) > 4 else 20

    img = Image.open(inp).convert('RGBA')
    rgba = np.array(img)
    H, W = rgba.shape[:2]
    alpha = rgba[:, :, 3]

    visible = alpha > alpha_thr
    struct = generate_binary_structure(2, 2)
    labeled, n_labels = cc_label(visible, structure=struct)
    sizes = np.bincount(labeled.flatten())
    sizes[0] = 0

    keep = np.zeros(n_labels + 1, dtype=bool)
    for i in range(1, n_labels + 1):
        if sizes[i] >= min_size:
            keep[i] = True

    print(f'{n_labels} components, {keep.sum()} kept (>= {min_size}px)')
    kept_total = int(sizes[keep].sum())
    dropped_total = int(sizes[~keep].sum()) - 0  # exclude index 0
    print(f'Top kept sizes: {sorted([int(s) for i, s in enumerate(sizes) if keep[i]], reverse=True)[:10]}')
    print(f'Kept {kept_total:,} px / dropped {dropped_total:,} px')

    keep_mask = keep[labeled]
    rgba[~keep_mask, 3] = 0

    Image.fromarray(rgba, 'RGBA').save(out, 'PNG')


if __name__ == '__main__':
    main()
