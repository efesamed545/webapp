#!/usr/bin/env python3
"""One-off generator for Flow PWA icons (warm cream/orange, rounded, checkmark)."""
from __future__ import annotations

import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, "icons")


def linear_gradient_rgb(size: int) -> Image.Image:
    """Soft warm cream → peach (top-left to bottom-right feel via diagonal blend)."""
    img = Image.new("RGB", (size, size))
    px = img.load()
    for y in range(size):
        for x in range(size):
            t = (x + y) / max(2 * (size - 1), 1)
            # Warm cream base
            r = int(255 - t * 28)
            g = int(248 - t * 38)
            b = int(238 - t * 48)
            px[x, y] = (r, g, b)
    return img


def rounded_mask(size: int, radius_ratio: float = 0.2237) -> Image.Image:
    """L-shaped alpha mask for squircle-like rounded square (iOS-style radius ~22.37%)."""
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    r = max(4, int(size * radius_ratio))
    d.rounded_rectangle((0, 0, size, size), radius=r, fill=255)
    return m


def draw_checkmark(
    draw: ImageDraw.ImageDraw,
    size: int,
    color: tuple[int, int, int, int],
    *,
    glyph_scale: float = 1.0,
) -> None:
    """Minimal bold checkmark; centered. Lower glyph_scale for maskable safe zone."""
    wstroke = max(5, int(size * 0.072 * glyph_scale))
    cx, cy = size / 2, size / 2
    s = size * 0.34 * glyph_scale
    # Left arm down to bend, then up-right (matches Flow auth mark proportions)
    x1, y1 = cx - s * 0.85, cy + s * 0.05
    x2, y2 = cx - s * 0.15, cy + s * 0.78
    x3, y3 = cx + s * 0.92, cy - s * 0.72
    # Pillow draws rounded joints when connecting segments in one chain on newer versions
    try:
        draw.line([(x1, y1), (x2, y2), (x3, y3)], fill=color, width=wstroke, joint="curve")
    except TypeError:
        draw.line([(x1, y1), (x2, y2)], fill=color, width=wstroke)
        draw.line([(x2, y2), (x3, y3)], fill=color, width=wstroke)


def render_icon(size: int, *, glyph_scale: float = 1.0) -> Image.Image:
    bg = linear_gradient_rgb(size).convert("RGBA")
    mask = rounded_mask(size)
    bg.putalpha(mask)

    draw = ImageDraw.Draw(bg)
    check_rgb = (214, 106, 36, 255)
    draw_checkmark(draw, size, check_rgb, glyph_scale=glyph_scale)

    return bg


def main() -> None:
    os.makedirs(ICONS, exist_ok=True)
    master = 512
    img512 = render_icon(master)
    img512.save(os.path.join(ICONS, "icon-512.png"), "PNG", optimize=True)

    # Maskable: smaller glyph inside safe zone (~80% diameter)
    img_mask = render_icon(master, glyph_scale=0.72)
    img_mask.save(os.path.join(ICONS, "icon-maskable-512.png"), "PNG", optimize=True)

    img192 = img512.resize((192, 192), Image.Resampling.LANCZOS)
    img192.save(os.path.join(ICONS, "icon-192.png"), "PNG", optimize=True)

    # Apple convention: 180×180 touch icon
    img180 = img512.resize((180, 180), Image.Resampling.LANCZOS)
    img180.save(os.path.join(ICONS, "apple-touch-icon.png"), "PNG", optimize=True)

    print("Wrote:", os.path.join(ICONS, "icon-512.png"))
    print("Wrote:", os.path.join(ICONS, "icon-maskable-512.png"))
    print("Wrote:", os.path.join(ICONS, "icon-192.png"))
    print("Wrote:", os.path.join(ICONS, "apple-touch-icon.png"))


if __name__ == "__main__":
    main()
