"""Fade out pixels by distance from the main figure body.

Unlike isolate-figure.py (hard dilation cutoff), this script smoothly
attenuates alpha based on distance from the figure body — close pixels
keep full alpha, far pixels become invisible. This is ideal when the
figure's translucent edges physically touch decorations.

Strategy:
  1. Build a strict solid mask (alpha > solid_thr) — figure body core.
  2. Find the largest connected component (the body).
  3. Compute Euclidean distance from each pixel to the nearest body pixel.
  4. Attenuate alpha by max(0, 1 - distance / falloff).

Usage:
    python fade-from-figure.py input.png output.png [solid_thr] [falloff]
        solid_thr   alpha threshold for body mask (default 200)
        falloff     pixels at this distance → alpha 0 (default 60)
"""
import sys
import numpy as np
from PIL import Image
from scipy.ndimage import label as cc_label, generate_binary_structure, distance_transform_edt


def main():
    inp = sys.argv[1]
    out = sys.argv[2]
    solid_thr = int(sys.argv[3]) if len(sys.argv) > 3 else 200
    falloff = float(sys.argv[4]) if len(sys.argv) > 4 else 60.0

    img = Image.open(inp).convert('RGBA')
    rgba = np.array(img)
    H, W = rgba.shape[:2]
    alpha = rgba[:, :, 3].astype(np.float32)

    # 1) strict body mask
    solid = alpha > solid_thr
    print(f'Strict solid pixels (alpha>{solid_thr}): {int(solid.sum()):,} / {H*W:,}')

    # 2) largest connected component
    struct = generate_binary_structure(2, 2)
    labeled, n_labels = cc_label(solid, structure=struct)
    if n_labels == 0:
        print('No solid components — output = input')
        img.save(out, 'PNG')
        return
    sizes = np.bincount(labeled.flatten())
    sizes[0] = 0
    largest = int(np.argmax(sizes))
    body_mask = (labeled == largest)
    print(f'{n_labels} components, body = {int(sizes[largest]):,} px ({100.0*sizes[largest]/(H*W):.1f}% of image)')

    # 3) distance from body (Euclidean, in pixels)
    print('Computing distance transform...')
    dist = distance_transform_edt(~body_mask)

    # 4) attenuate alpha by distance
    attenuation = np.clip(1.0 - dist / falloff, 0.0, 1.0)
    new_alpha = alpha * attenuation
    rgba[:, :, 3] = new_alpha.astype(np.uint8)

    cleared = int(((alpha > 0) & (rgba[:, :, 3] == 0)).sum())
    softened = int(((rgba[:, :, 3] > 0) & (rgba[:, :, 3] < alpha)).sum())
    print(f'Cleared {cleared:,} px / softened {softened:,} px (falloff={falloff})')

    Image.fromarray(rgba, 'RGBA').save(out, 'PNG')


if __name__ == '__main__':
    main()
