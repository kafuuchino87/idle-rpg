"""Debug: visualize the strict body mask as a white-on-black PNG."""
import sys
import numpy as np
from PIL import Image
from scipy.ndimage import label as cc_label, generate_binary_structure

inp = sys.argv[1]
out = sys.argv[2]
solid_thr = int(sys.argv[3]) if len(sys.argv) > 3 else 200

img = Image.open(inp).convert('RGBA')
rgba = np.array(img)
alpha = rgba[:, :, 3]
solid = alpha > solid_thr

struct = generate_binary_structure(2, 2)
labeled, n_labels = cc_label(solid, structure=struct)
sizes = np.bincount(labeled.flatten()); sizes[0] = 0
largest = int(np.argmax(sizes))
body = (labeled == largest)

H, W = body.shape
ys, xs = np.where(body)
print(f'Body bbox: x={xs.min()}-{xs.max()} (width {xs.max()-xs.min()}), y={ys.min()}-{ys.max()} (height {ys.max()-ys.min()})')
print(f'Image dimensions: {W}x{H}')

vis = np.zeros((H, W, 3), dtype=np.uint8)
vis[body] = [255, 255, 255]
Image.fromarray(vis, 'RGB').save(out)
print(f'Body mask saved to {out}')
