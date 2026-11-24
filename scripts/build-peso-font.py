#!/usr/bin/env python3
"""Makes Keystone Peso: the peso sign (₱, U+20B1) for each weight of Poppins, which has none.

Poppins (shared/fonts, SIL Open Font License 1.1, no Reserved Font Name) has no peso sign, so a browser drew every ₱
from whatever font the computer had (Segoe UI on Windows), and a PDF could not embed one. Keystone Peso is a modified
version of Poppins, under the same licence (shared/fonts/OFL-Poppins.txt): each weight's own capital P with two bars
across its bowl, and nothing else. It sits right after Poppins in the body's font stack, so it is used for the ₱ alone.

    python scripts/build-peso-font.py      (needs fontTools: pip install fonttools)

Writes shared/fonts/KeystonePeso-<Weight>.ttf; then `npm run sync` copies them into the design system.
"""

from pathlib import Path

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

FONTS = Path(__file__).resolve().parent.parent / "shared" / "fonts"
PESO = 0x20B1
WEIGHTS = ["Regular", "Medium", "SemiBold", "Bold"]


def bounds(font, name):
    glyph = font["glyf"][name]
    glyph.recalcBounds(font["glyf"])
    return glyph.xMin, glyph.yMin, glyph.xMax, glyph.yMax


def build(weight):
    font = TTFont(FONTS / f"Poppins-{weight}.ttf")
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    p = cmap[ord("P")]
    x_min, _, x_max, cap = bounds(font, p)
    stem = bounds(font, cmap[ord("I")])
    # Two thin bars, under half the weight's stem, reaching past the stem on the left, as a peso sign's do.
    thick = round((stem[2] - stem[0]) * 0.42)
    reach = round((stem[2] - stem[0]) * 0.9)
    shift = max(0, reach - x_min)

    pen = TTGlyphPen(glyphs)
    recording = DecomposingRecordingPen(glyphs)
    glyphs[p].draw(recording)

    for op, args in recording.value:
        moved = [(x + shift, y) for x, y in args]
        getattr(pen, op)(*moved)

    # Two bars across the bowl, clockwise like an outer contour, so they join the P.
    for middle in (cap * 0.8, cap * 0.62):
        top, bottom = round(middle + thick / 2), round(middle - thick / 2)
        left, right = x_min - reach + shift, x_max + shift
        pen.moveTo((left, bottom))
        pen.lineTo((left, top))
        pen.lineTo((right, top))
        pen.lineTo((right, bottom))
        pen.closePath()

    peso = pen.glyph()
    advance, lsb = font["hmtx"][p]
    order = font.getGlyphOrder() + ["peso"]
    font.setGlyphOrder(order)
    font["glyf"].glyphOrder = order
    font["glyf"]["peso"] = peso
    font["hmtx"]["peso"] = (advance + shift, lsb)

    for table in font["cmap"].tables:
        if table.isUnicode():
            table.cmap[PESO] = "peso"

    options = Options()
    options.name_IDs = ["*"]
    options.notdef_outline = True
    options.layout_features = []
    subsetter = Subsetter(options)
    subsetter.populate(unicodes=[PESO, 0x20])
    subsetter.subset(font)

    names = font["name"]
    family = "Keystone Peso"

    for record in names.names:
        if record.nameID in (1, 16):
            record.string = family
        elif record.nameID in (4,):
            record.string = f"{family} {weight}"
        elif record.nameID == 6:
            record.string = f"KeystonePeso-{weight}"
        elif record.nameID == 3:
            record.string = f"Keystone Peso {weight}; derived from Poppins"

    out = FONTS / f"KeystonePeso-{weight}.ttf"
    font.save(out)
    print(out.name, out.stat().st_size, "bytes")


for w in WEIGHTS:
    build(w)
