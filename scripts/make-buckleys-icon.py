#!/usr/bin/env python3
"""Generate the Buckleys brand icon: a bold sage (#5b8c7a) "B" on transparency.

Outputs 16/32/48/128 px PNGs into src/. Rendered at 4x then downsampled for
crisp edges at small sizes (toolbar icons are read at 16-19px). Uses the
bold sans-serif that ships on macOS (Arial Black) for a heavy, legible glyph.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SAGE = (0x5B, 0x8C, 0x7A, 0xFF)  # var(--color-primary) from shared-ui.css
LETTER = "B"

SIZES = [16, 32, 48, 128]
SS = 4  # supersample factor for anti-aliasing

# Prefer the heaviest available system sans for clarity at 16px.
FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Black.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/System/Library/Fonts/HelveticaNeue.ttc",
]


def load_font(size_px):
    for path in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size_px)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def draw_icon(size):
    """Render the B centred in a transparent `size`x`size` canvas."""
    canvas = size * SS
    img = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Vertical stems of a B look optically top-heavy when geometrically
    # centred; nudge the baseline down a touch so the glyph reads centred.
    font = load_font(int(round(canvas * 0.74)))
    try:
        (l, t, r, b) = draw.textbbox((0, 0), LETTER, font=font)
    except AttributeError:
        # Pillow <8. fallback (we're on 12, so this is defensive only)
        l, t, r, b = font.getbbox(LETTER)
    w = r - l
    h = b - t
    x = (canvas - w) / 2 - l
    y = (canvas - h) / 2 - t + int(canvas * 0.04)

    draw.text((x, y), LETTER, font=font, fill=SAGE)

    return img.resize((size, size), Image.LANCZOS)


def main():
    out_dir = Path(__file__).resolve().parent.parent / "src"
    if not out_dir.is_dir():
        print(f"src/ not found at {out_dir}", file=sys.stderr)
        return 1
    for size in SIZES:
        target = out_dir / f"icon-{size}.png"
        draw_icon(size).save(target, "PNG")
        print(f"wrote {target.relative_to(out_dir.parent)} ({size}x{size})")
    # src/icon.png is the canonical 48 referenced by the manifest + favicons.
    draw_icon(48).save(out_dir / "icon.png", "PNG")
    print("wrote src/icon.png (48x48)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
