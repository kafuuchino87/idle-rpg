"""Keep only the largest N connected components in alpha channel.

After rembg removes background, the result often contains floating
decorations (HUD panels, drones, sparkles). This script keeps only
the main character blob and removes everything else.

Usage:
    python keep-main-blob.py input.png output.png [top_n] [alpha_threshold] [min_ratio]
        top_n             keep this many largest components (default 1)
        alpha_threshold   pixel counts as solid if alpha > this (default 30)
        min_ratio         drop any component smaller than this fraction of largest (default 0)
"""
import sys
from collections import deque
from PIL import Image


def main():
    inp = sys.argv[1]
    out = sys.argv[2]
    top_n = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    threshold = int(sys.argv[4]) if len(sys.argv) > 4 else 30
    min_ratio = float(sys.argv[5]) if len(sys.argv) > 5 else 0.0

    img = Image.open(inp).convert('RGBA')
    W, H = img.size
    px = img.load()

    # Build solid mask
    mask = bytearray(W * H)
    solid_total = 0
    for y in range(H):
        for x in range(W):
            if px[x, y][3] > threshold:
                mask[y * W + x] = 1
                solid_total += 1

    # BFS connected components (4-connected)
    visited = bytearray(W * H)
    component_sizes = []
    component_pixels = {}

    label = 0
    for sy in range(H):
        for sx in range(W):
            i = sy * W + sx
            if mask[i] and not visited[i]:
                label += 1
                queue = deque([(sx, sy)])
                pixels = []
                visited[i] = 1
                while queue:
                    x, y = queue.popleft()
                    pixels.append((x, y))
                    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                        nx, ny = x + dx, y + dy
                        if 0 <= nx < W and 0 <= ny < H:
                            ni = ny * W + nx
                            if mask[ni] and not visited[ni]:
                                visited[ni] = 1
                                queue.append((nx, ny))
                component_pixels[label] = pixels
                component_sizes.append((len(pixels), label))

    if not component_sizes:
        img.save(out, 'PNG')
        return

    component_sizes.sort(reverse=True)
    largest_size = component_sizes[0][0]
    min_size = largest_size * min_ratio

    # Pick top-N AND ≥ min_ratio
    keep_labels = set()
    for i, (size, lab) in enumerate(component_sizes[:top_n]):
        if size >= min_size:
            keep_labels.add(lab)

    print(f'Total components: {label} (solid pixels: {solid_total})')
    for i, (size, lab) in enumerate(component_sizes[:15]):
        pct = 100.0 * size / max(1, largest_size)
        marker = ' <- KEPT' if lab in keep_labels else ''
        print(f'  #{i+1:2}  label={lab:4}  size={size:7}  ({pct:5.1f}% of largest){marker}')

    # Build keep mask
    keep = bytearray(W * H)
    for lab in keep_labels:
        for x, y in component_pixels[lab]:
            keep[y * W + x] = 1

    # Erase non-kept pixels
    cleared = 0
    for y in range(H):
        for x in range(W):
            if not keep[y * W + x]:
                r, g, b, a = px[x, y]
                if a > 0:
                    px[x, y] = (r, g, b, 0)
                    cleared += 1

    img.save(out, 'PNG')
    print(f'Cleared {cleared} px outside kept components')


if __name__ == '__main__':
    main()
