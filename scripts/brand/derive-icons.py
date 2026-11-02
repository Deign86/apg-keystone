"""Derive Keystone's icon sources from the logo artwork.

    python3 scripts/brand/derive-icons.py [shared/brand/keystone-logo.png]

Needs Python 3 with Pillow. Run it only when the logo changes; it writes the sources `npm run icons` turns into
every platform's icons:

    shared/brand/keystone-mark.png     the gold mark alone on transparency (light or dark backgrounds, documents)
    shared/brand/keystone-mark-ui.png  the same, 160 px tall: the app's own UI (npm run sync copies it into @keystone/ui)
    shared/brand/icon-app.png          the mark on APG's black tile, rounded: Windows, Linux, the web
    shared/brand/icon-macos.png        the same tile on Apple's 1024 grid (824 px squircle, 100 px margin): macOS
    shared/brand/icon-ios.png          the mark on a full-bleed black square, no hairline: iOS rounds its own corners
    shared/brand/icon-android-fg.png   the mark alone in the adaptive-icon safe zone: Android, on the tile colour
"""

import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
BRAND = ROOT / 'shared' / 'brand'
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else BRAND / 'keystone-logo.png'

TILE = (11, 10, 8)            # tokens.json › bg  (#0b0a08)
HAIRLINE = (141, 117, 62)     # tokens.json › goldSoft (#8d753e)
SIZE = 1024
SUPERSAMPLE = 4


def mark_from(artwork: Image.Image) -> Image.Image:
    """The gold mark on transparency. The artwork is gold light on black, so each pixel's brightest channel is how
    much gold covers it: that becomes alpha, and the colour is un-premultiplied so edges keep their gold."""
    rgb = artwork.convert('RGB')
    peak = ImageChops.lighter(ImageChops.lighter(rgb.getchannel('R'), rgb.getchannel('G')), rgb.getchannel('B'))
    floor = 18  # the artwork's black is not pure; anything this dark is background
    alpha = peak.point(lambda v: 0 if v <= floor else min(255, round((v - floor) * 255 / (200 - floor))))
    # Gold always has far more red than blue; grey specks (compression noise on the tile's corners) do not.
    gold = ImageChops.subtract(rgb.getchannel('R'), rgb.getchannel('B')).point(lambda v: 255 if v >= 16 else 0)
    alpha = ImageChops.multiply(alpha, gold)
    bbox = alpha.point(lambda v: 255 if v > 40 else 0).getbbox()
    if bbox is None:
        raise SystemExit(f'{SOURCE} has no mark on it.')

    rgb, alpha = rgb.crop(bbox), alpha.crop(bbox)
    pixels = []

    pixel_data = getattr(Image.Image, 'get_flattened_data', Image.Image.getdata)  # Pillow 12 renamed getdata

    for (r, g, b), a in zip(pixel_data(rgb), pixel_data(alpha)):
        if a == 0:
            pixels.append((0, 0, 0, 0))
        else:
            scale = 255 / a
            pixels.append((min(255, round(r * scale)), min(255, round(g * scale)), min(255, round(b * scale)), a))

    mark = Image.new('RGBA', rgb.size)
    mark.putdata(pixels)

    return mark


def fit(mark: Image.Image, height: int) -> Image.Image:
    width = round(mark.width * height / mark.height)

    return mark.resize((width, height), Image.LANCZOS)


def tile(inset: int, radius: int, mark: Image.Image, mark_height: int) -> Image.Image:
    """A black rounded tile with a gold hairline, the mark centred on it, on a transparent 1024 canvas."""
    big = SIZE * SUPERSAMPLE
    shape = Image.new('L', (big, big), 0)
    box = (inset * SUPERSAMPLE, inset * SUPERSAMPLE, big - inset * SUPERSAMPLE - 1, big - inset * SUPERSAMPLE - 1)
    ImageDraw.Draw(shape).rounded_rectangle(box, radius=radius * SUPERSAMPLE, fill=255)
    shape = shape.resize((SIZE, SIZE), Image.LANCZOS)

    canvas = Image.new('RGBA', (SIZE, SIZE), TILE + (0,))
    canvas.putalpha(shape)

    # The hairline: the tile's edge, 3 px in, in goldSoft at half strength.
    edge = ImageChops.subtract(shape, shape.filter(ImageFilter.MinFilter(7)))
    hairline = Image.new('RGBA', (SIZE, SIZE), HAIRLINE + (0,))
    hairline.putalpha(edge.point(lambda v: v // 2))
    canvas.alpha_composite(hairline)

    placed = fit(mark, mark_height)
    canvas.alpha_composite(placed, ((SIZE - placed.width) // 2, (SIZE - placed.height) // 2))

    return canvas


def full_bleed(mark: Image.Image) -> Image.Image:
    """The mark on a square of the tile colour, edge to edge and opaque, as iOS wants: it masks the corners itself."""
    canvas = Image.new('RGBA', (SIZE, SIZE), TILE + (255,))
    placed = fit(mark, 600)
    canvas.alpha_composite(placed, ((SIZE - placed.width) // 2, (SIZE - placed.height) // 2))

    return canvas


def safe_zone(mark: Image.Image) -> Image.Image:
    """The mark alone, sized for Android's adaptive-icon safe zone (the centre 66%); the launcher supplies the tile."""
    canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    placed = fit(mark, round(SIZE * 0.5))
    canvas.alpha_composite(placed, ((SIZE - placed.width) // 2, (SIZE - placed.height) // 2))

    return canvas


def main() -> None:
    artwork = Image.open(SOURCE)
    mark = mark_from(artwork)
    BRAND.mkdir(parents=True, exist_ok=True)

    mark.save(BRAND / 'keystone-mark.png', optimize=True)
    fit(mark, 160).save(BRAND / 'keystone-mark-ui.png', optimize=True)
    tile(inset=40, radius=200, mark=mark, mark_height=660).save(BRAND / 'icon-app.png', optimize=True)
    tile(inset=100, radius=185, mark=mark, mark_height=560).save(BRAND / 'icon-macos.png', optimize=True)
    full_bleed(mark).convert('RGB').save(BRAND / 'icon-ios.png', optimize=True)
    safe_zone(mark).save(BRAND / 'icon-android-fg.png', optimize=True)

    print(f'From {SOURCE.relative_to(ROOT) if SOURCE.is_relative_to(ROOT) else SOURCE} ({artwork.width}×{artwork.height}):')
    for name in ('keystone-mark.png', 'keystone-mark-ui.png', 'icon-app.png', 'icon-macos.png', 'icon-ios.png', 'icon-android-fg.png'):
        print(f'  shared/brand/{name}')


if __name__ == '__main__':
    main()
