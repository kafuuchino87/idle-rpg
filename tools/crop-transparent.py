"""Auto-crop transparent borders from PNG images.

Find the bounding box of non-transparent pixels (alpha > threshold)
and crop the image to that box, with optional padding.

Usage: python crop-transparent.py img1.png img2.png ...
Output: overwrites input files
"""
import sys
from PIL import Image

THRESHOLD = 8   # alpha values <= this count as fully transparent
PADDING = 16    # pixels of margin to keep around the content

def auto_crop(path):
    img = Image.open(path).convert('RGBA')
    w, h = img.size
    alpha = img.split()[-1]
    # PIL's getbbox uses bilevel masking — convert alpha through threshold first
    mask = alpha.point(lambda a: 255 if a > THRESHOLD else 0)
    bbox = mask.getbbox()
    if bbox is None:
        print(f'{path}: fully transparent, skipped')
        return
    L, T, R, B = bbox
    # Add padding (clamp to image bounds)
    L = max(0, L - PADDING)
    T = max(0, T - PADDING)
    R = min(w, R + PADDING)
    B = min(h, B + PADDING)
    cropped = img.crop((L, T, R, B))
    cropped.save(path)
    print(f'{path}: {w}x{h} -> {cropped.size[0]}x{cropped.size[1]}')

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python crop-transparent.py img1.png img2.png ...')
        sys.exit(1)
    for p in sys.argv[1:]:
        auto_crop(p)
