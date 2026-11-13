"""Derive the APG logo for white paper from the company's horizontal logo.

    python3 scripts/brand/derive-paper-logo.py [shared/brand/apg-logo-horizontal.png]

Needs Python 3 with Pillow. Run it only when the logo changes; `npm run sync` then copies the result into
@keystone/ui as `logo-paper.png`, the logo on every printed document's letterhead.

    shared/brand/logo-paper.png   the phoenix and "ALPHA PREMIER GROUP", cropped to the art, at 360 px tall: the
                                  wordmark black instead of white, and the phoenix one solid gold

The source (the website's `public/assets/images/logo-horizontal-transparent.png`, 3520 px wide) is drawn for APG's
black: the wordmark is white, and the phoenix is gold lit with near-white highlights. On white paper both vanish. So
the wordmark, everything right of the widest gap, takes the paper's ink; the phoenix keeps its gold, every pixel on
the gold's own hue (the metal's grey and pink reflections turn gold too) and none lighter than a mid tone, so its
lines print whole.
"""

import colorsys
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'shared' / 'brand' / 'apg-logo-horizontal.png'
TARGET = ROOT / 'shared' / 'brand' / 'logo-paper.png'

HEIGHT = 360                          # px: sharp at its 60 px on screen at 2x, and in print at 600 dpi
INK = (0x11, 0x11, 0x11)              # tokens.json › paperInk
GOLD = (0xc6, 0xa2, 0x54)             # tokens.json › gold
HUE = colorsys.rgb_to_hls(*(c / 255 for c in GOLD))[0]
LIGHTEST = 0.52                       # a highlight goes no lighter than the gold itself...
DEEPEN = 0.88                         # ...and a shade under it, to hold on white


def phoenix(r: int, g: int, b: int) -> tuple[int, int, int]:
    _, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    rr, gg, bb = colorsys.hls_to_rgb(HUE, min(l, LIGHTEST) * DEEPEN, max(0.45, min(s, 0.75)))

    return round(rr * 255), round(gg * 255), round(bb * 255)


def wordmark_starts(art: Image.Image) -> int:
    """The column where the wordmark starts: the end of the widest empty run of columns between the two."""
    alpha = art.getchannel('A').point(lambda v: 255 if v > 20 else 0)
    filled = [alpha.crop((x, 0, x + 1, art.height)).getbbox() is not None for x in range(art.width)]
    best, start = (0, 0), None

    for x, f in enumerate(filled + [True]):
        if not f and start is None:
            start = x
        elif f and start is not None:
            best = max(best, (x - start, x))
            start = None

    if best[0] == 0:
        raise SystemExit(f'{SOURCE} has no gap between the phoenix and the wordmark.')

    return best[1]


def main() -> None:
    logo = Image.open(SOURCE).convert('RGBA')
    bbox = logo.getchannel('A').getbbox()
    if bbox is None:
        raise SystemExit(f'{SOURCE} has no logo on it.')

    art = logo.crop(bbox)
    split = wordmark_starts(art)
    pixel_data = getattr(Image.Image, 'get_flattened_data', Image.Image.getdata)  # Pillow 12 renamed getdata
    pixels = []

    for i, (r, g, b, a) in enumerate(pixel_data(art)):
        if a == 0:
            pixels.append((0, 0, 0, 0))
        else:
            pixels.append((INK if i % art.width >= split else phoenix(r, g, b)) + (a,))

    paper = Image.new('RGBA', art.size)
    paper.putdata(pixels)
    paper = paper.resize((round(art.width * HEIGHT / art.height), HEIGHT), Image.LANCZOS)
    paper.save(TARGET, optimize=True)
    print('wrote', TARGET.relative_to(ROOT), paper.size)


if __name__ == '__main__':
    main()
