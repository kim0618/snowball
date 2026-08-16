#!/usr/bin/env python3
"""Build lobby stat cards without the dark game-over background."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
IMG = ROOT / "public" / "img"

for idx in range(1, 4):
    src = Image.open(IMG / f"go-stat{idx}.webp").convert("RGBA")
    w, h = src.size

    # The useful ice card begins below the baked game-over background.
    card_box = (7, 38, w - 7, h - 10)
    card = src.crop(card_box)
    cw, ch = card.size
    rounded = Image.new("L", card.size, 0)
    ImageDraw.Draw(rounded).rounded_rectangle((0, 0, cw - 1, ch - 1), radius=20, fill=255)
    card.putalpha(rounded)

    # Rebuild on the original canvas so the card and icon retain their exact alignment.
    out = Image.new("RGBA", src.size, (0, 0, 0, 0))
    out.alpha_composite(card, (card_box[0], card_box[1]))

    icon_box = (w // 2 - 46, 0, w // 2 + 46, 60)
    icon = src.crop(icon_box)
    px = icon.load()
    for y in range(icon.height):
        for x in range(icon.width):
            r, g, b, _ = px[x, y]
            # The icon is much brighter than the baked dark-blue backdrop.
            # The overlap with the card remains aligned at the original coordinates.
            alpha = max(0, min(255, (min(r, g, b) - 82) * 6))
            px[x, y] = (r, g, b, alpha)
    out.alpha_composite(icon, (icon_box[0], icon_box[1]))
    out.save(IMG / f"lobby-stat{idx}.webp", "WEBP", lossless=True)
