"""Derive the Alpha Premier Group of Companies logo for white paper from the APG paper logo.

    python3 scripts/brand/derive-companies-logo.py <Montserrat.ttf> [shared/brand/logo-paper.png]

Needs Python 3 with Pillow, and Montserrat (OFL; Google Fonts' `ofl/montserrat/Montserrat[wght].ttf` or a static
Montserrat-Medium.ttf), the face the company's Group of Companies logo sets its second line in. The font is only read
here, never kept in the repo. Run it only when the logo changes; `npm run sync` then copies the result into
@keystone/ui as `logo-paper-companies.png`, the logo on the check voucher's letterhead.

    shared/brand/logo-paper-companies.png   the paper logo (scripts/brand/derive-paper-logo.py) with "GROUP" under
                                            "ALPHA PREMIER" set again as "GROUP OF COMPANIES", in the same ink, at
                                            the same 360 px tall, so it prints the same size as the paper logo

The phoenix and "ALPHA PREMIER" are the paper logo's own pixels. The second line is drawn fresh, tracked out to run
the width of "ALPHA PREMIER" above it, large enough to read at the letterhead's 60 px.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / 'shared' / 'brand'

if len(sys.argv) < 2:
    raise SystemExit(__doc__)

FONT = Path(sys.argv[1])
SOURCE = Path(sys.argv[2]) if len(sys.argv) > 2 else BRAND / 'logo-paper.png'
TARGET = BRAND / 'logo-paper-companies.png'

LINE = 'GROUP OF COMPANIES'
INK = (0x11, 0x11, 0x11)              # tokens.json › paperInk, as on the paper logo
WEIGHT = 500                          # Montserrat Medium: holds at the letterhead's size in print
CAP = 0.62                            # the line's capital height, as a share of "ALPHA PREMIER"'s
GAP = 0.40                            # the space between the two lines, as a share of "ALPHA PREMIER"'s height
SUPERSAMPLE = 4


def runs(filled: list[bool]) -> list[tuple[int, int]]:
    """Each run of True as (first, last)."""
    out, start = [], None

    for i, f in enumerate(filled + [False]):
        if f and start is None:
            start = i
        elif not f and start is not None:
            out.append((start, i - 1))
            start = None

    return out


def main() -> None:
    logo = Image.open(SOURCE).convert('RGBA')
    alpha = logo.getchannel('A').point(lambda v: 255 if v > 20 else 0)
    columns = runs([alpha.crop((x, 0, x + 1, logo.height)).getbbox() is not None for x in range(logo.width)])
    # The wordmark starts after the widest gap: everything left of it is the phoenix.
    gaps = [(b[0] - a[1], b[0]) for a, b in zip(columns, columns[1:])]

    if not gaps:
        raise SystemExit(f'{SOURCE} has no gap between the phoenix and the wordmark.')

    split = max(gaps)[1]
    words = alpha.crop((split, 0, logo.width, logo.height))
    lines = runs([words.crop((0, y, words.width, y + 1)).getbbox() is not None for y in range(words.height)])

    if len(lines) != 2:
        raise SystemExit(f'{SOURCE} should have two lines of wordmark, "ALPHA PREMIER" over "GROUP"; found {len(lines)}.')

    (top, bottom), _ = lines
    left, _, right, _ = words.crop((0, top, words.width, bottom + 1)).getbbox()
    left, right, height = split + left, split + right, bottom - top + 1

    # "GROUP" goes; the phoenix and "ALPHA PREMIER" stay as they are.
    out = logo.copy()
    out.paste((0, 0, 0, 0), (split, bottom + 1, logo.width, logo.height))

    font = ImageFont.truetype(str(FONT), 100 * SUPERSAMPLE)

    try:
        font.set_variation_by_axes([WEIGHT])
    except OSError:
        pass  # a static face: its own weight

    cap_top, cap_bottom = font.getbbox('H')[1], font.getbbox('H')[3]
    size = round(100 * SUPERSAMPLE * CAP * height * SUPERSAMPLE / (cap_bottom - cap_top))
    font = ImageFont.truetype(str(FONT), size)

    try:
        font.set_variation_by_axes([WEIGHT])
    except OSError:
        pass

    # Tracked out letter by letter so the line runs from the first letter of "ALPHA" to the last of "PREMIER".
    width = (right - left) * SUPERSAMPLE
    letters = [font.getlength(c) for c in LINE]
    ink_width = sum(letters[:-1]) + font.getbbox(LINE[-1])[2]
    track = (width - ink_width) / (len(LINE) - 1)
    cap_top, cap_bottom = font.getbbox('H')[1], font.getbbox('H')[3]
    line = Image.new('L', (width + 8 * SUPERSAMPLE, cap_bottom + 8 * SUPERSAMPLE), 0)
    draw = ImageDraw.Draw(line)
    x = -font.getbbox(LINE[0])[0]

    for c, advance in zip(LINE, letters):
        draw.text((x, 0), c, font=font, fill=255)
        x += advance + track

    line = line.crop((0, cap_top, line.width, cap_bottom))
    line = line.resize((round(line.width / SUPERSAMPLE), round(line.height / SUPERSAMPLE)), Image.LANCZOS)
    y = bottom + 1 + round(GAP * height)

    if y + line.height > logo.height:
        raise SystemExit(f'"{LINE}" does not fit under "ALPHA PREMIER" in {logo.height} px.')

    out.paste(Image.new('RGBA', line.size, INK + (255,)), (left, y), line)
    out.save(TARGET, optimize=True)
    print('wrote', TARGET.relative_to(ROOT), out.size)


if __name__ == '__main__':
    main()
