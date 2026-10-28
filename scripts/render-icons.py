"""
Renders every install and favicon asset from `assets/brand/lorevolve-icon.png`, which is the
only source of the mark.

    python scripts/render-icons.py

The mark is the owner's artwork and is never redrawn here. All this does is trim it to its
own edges, place it on a square canvas with the padding each use needs, resample it down,
and write a PNG. Nothing recolours it and nothing traces it.

Standard library only, still. Downscaling a 1254x1254 master by four to eighty times is an
area average - each output pixel is the mean of the source rectangle it covers - which is
the correct filter for a reduction this large and is about thirty lines. Alpha is
premultiplied before averaging and divided out afterwards, so the transparent margin cannot
bleed dark fringes into the mark's edges.

Every icon is transparent: just the mark - an open book, a crimson world of spires and roads
rising from its cream pages - which carries its shape on a light or a dark surface alike, so the
icon sits in whatever tab strip or launcher is behind it. The owner's choice (2026-10-28), over
the black ground the maskable and Apple icons used to carry. What a platform does with the clear
region is the platform's: an Android launcher may lay a maskable icon on its own plate, and iOS
paints a touch icon's clear pixels black. At 16 px the mark is a book-shaped blob, not a picture -
the tab strip asks no more.

The launch logo is not made here: it is a photograph-like raster. Its art comes transparent, so
`assets/brand/lorevolve-logo.png` is that art flattened onto #000000 - the launch layer's ground
(ffmpeg -f lavfi -i color=black:s=1774x887 -i art.png -filter_complex
"[1]scale=1400:-1[l];[0][l]overlay=(W-w)/2:(H-h)/2,format=rgb24") - and
it is resampled and encoded once with libwebp from `assets/brand/lorevolve-logo.png`:

    ffmpeg -i assets/brand/lorevolve-logo.png -vf scale=1200:-1:flags=area         -c:v libwebp -quality 82 -compression_level 6 src/LorEvolve.Web/public/launch-logo.webp
"""

import struct
import zlib
from pathlib import Path

SOURCE = Path(__file__).resolve().parent.parent / "assets" / "brand" / "lorevolve-icon.png"
PUBLIC = Path(__file__).resolve().parent.parent / "src" / "LorEvolve.Web" / "public"

#: Alpha at or below this is margin rather than mark, when measuring the artwork's own edges.
EDGE = 8

# name, pixels, padding as a fraction of the canvas on every side, ground.
#
# The paddings are not taste. A maskable icon must survive the platform cropping it to a
# circle of 80% of the canvas. The mark's diagonal spikes reach the corners of its own box, so
# the box is kept inside the middle 56%, whose corners sit at 39.6% from the centre. Apple redraws the
# corners itself and looks wrong when art runs to the edge, so 12%. The favicons are the
# opposite problem - at 16px every pixel of margin is a pixel not spent on the rings - so
# they are cropped tight.
TARGETS = [
    ("icon-192.png", 192, 0.08, None),
    ("icon-512.png", 512, 0.08, None),
    ("icon-maskable-512.png", 512, 0.22, None),
    ("apple-touch-icon.png", 180, 0.12, None),
    ("favicon-48.png", 48, 0.04, None),
    ("favicon-32.png", 32, 0.03, None),
    ("favicon-16.png", 16, 0.02, None),
    # The in-app symbol. Untrimmed of padding, because here the surface underneath is
    # LorEvolve's own and the stylesheet decides the spacing.
    ("brand-mark.png", 384, 0.0, None),
]


# ---------- reading the master ----------


def read_png(path):
    """The master as (width, height, rows of RGBA bytes). Narrow on purpose: it reads the
    one shape the master is, and says so rather than guessing if that ever changes."""
    data = path.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit(f"{path.name} is not a PNG")

    header = None
    body = bytearray()
    at = 8
    while at < len(data):
        length = struct.unpack(">I", data[at : at + 4])[0]
        kind = data[at + 4 : at + 8]
        payload = data[at + 8 : at + 8 + length]
        if kind == b"IHDR":
            header = struct.unpack(">IIBBBBB", payload)
        elif kind == b"IDAT":
            body += payload
        at += 12 + length

    if header is None:
        raise SystemExit(f"{path.name} has no header")

    width, height, depth, colour, compression, filtering, interlace = header
    if (depth, colour, compression, filtering, interlace) != (8, 6, 0, 0, 0):
        raise SystemExit(
            f"{path.name} must be 8-bit RGBA, uncompressed-filter, non-interlaced "
            f"(got depth {depth}, colour type {colour}, interlace {interlace})"
        )

    return width, height, unfilter(zlib.decompress(bytes(body)), width, height)


def unfilter(raw, width, height):
    """Undoes the five PNG scanline filters. Four bytes per pixel, so the left neighbour
    is four bytes back."""
    stride = width * 4
    rows = []
    previous = bytearray(stride)
    at = 0
    for _ in range(height):
        kind = raw[at]
        row = bytearray(raw[at + 1 : at + 1 + stride])
        at += 1 + stride

        if kind == 1:
            for i in range(4, stride):
                row[i] = (row[i] + row[i - 4]) & 0xFF
        elif kind == 2:
            for i in range(stride):
                row[i] = (row[i] + previous[i]) & 0xFF
        elif kind == 3:
            for i in range(stride):
                left = row[i - 4] if i >= 4 else 0
                row[i] = (row[i] + ((left + previous[i]) >> 1)) & 0xFF
        elif kind == 4:
            for i in range(stride):
                left = row[i - 4] if i >= 4 else 0
                up = previous[i]
                corner = previous[i - 4] if i >= 4 else 0
                estimate = left + up - corner
                pa, pb, pc = abs(estimate - left), abs(estimate - up), abs(estimate - corner)
                nearest = left if (pa <= pb and pa <= pc) else (up if pb <= pc else corner)
                row[i] = (row[i] + nearest) & 0xFF
        elif kind != 0:
            raise SystemExit(f"unsupported PNG filter {kind}")

        rows.append(bytes(row))
        previous = row

    return rows


# ---------- placing and resampling ----------


def mark_bounds(width, height, rows):
    """The artwork's own edges, so the padding below is padding around the mark rather than
    around whatever canvas it happened to be saved on."""
    left, top, right, bottom = width, height, -1, -1
    for y, row in enumerate(rows):
        for x in range(width):
            if row[x * 4 + 3] > EDGE:
                if x < left:
                    left = x
                if x > right:
                    right = x
                if y < top:
                    top = y
                if y > bottom:
                    bottom = y
    if right < 0:
        raise SystemExit("the master is entirely transparent")
    return left, top, right + 1, bottom + 1


def premultiplied(width, height, rows, box):
    """The mark, cropped to `box`, as rows of (r*a, g*a, b*a, a) floats.

    Premultiplied because averaging straight colour across the mark's soft edge would pull
    the transparent margin's black into it and leave a dark halo.
    """
    left, top, right, bottom = box
    out = []
    for y in range(top, bottom):
        row = rows[y]
        line = []
        for x in range(left, right):
            r, g, b, a = row[x * 4 : x * 4 + 4]
            weight = a / 255.0
            line.append((r * weight, g * weight, b * weight, weight))
        out.append(line)
    return out


def resample(source, width, height, out_width, out_height):
    """Area average, in two separable passes. Each output pixel is the mean of the source
    rectangle it covers, with fractional weights at the edges."""

    def pass_over(rows, in_size, out_size, horizontal):
        scale = in_size / out_size
        spans = []
        for i in range(out_size):
            start, end = i * scale, (i + 1) * scale
            first, last = int(start), min(in_size, int(end) + (end > int(end)))
            weights = []
            for j in range(first, last):
                weights.append((j, min(end, j + 1) - max(start, j)))
            total = sum(w for _, w in weights) or 1.0
            spans.append([(j, w / total) for j, w in weights])

        if horizontal:
            return [
                [
                    tuple(sum(row[j][c] * w for j, w in span) for c in range(4))
                    for span in spans
                ]
                for row in rows
            ]

        return [
            [
                tuple(sum(rows[j][x][c] * w for j, w in span) for c in range(4))
                for x in range(len(rows[0]))
            ]
            for span in spans
        ]

    return pass_over(pass_over(source, width, out_width, True), height, out_height, False)


def compose(mark, size, padding, ground):
    """One square icon: the mark fitted inside its padding, centred, over `ground`.

    The mark keeps its aspect ratio - its own edges need not be square - so it is fitted to
    the longer side and centred on the other.
    """
    inner = max(1, round(size * (1 - 2 * padding)))
    source_height = len(mark)
    source_width = len(mark[0])

    if source_width >= source_height:
        out_width = inner
        out_height = max(1, round(inner * source_height / source_width))
    else:
        out_height = inner
        out_width = max(1, round(inner * source_width / source_height))

    scaled = resample(mark, source_width, source_height, out_width, out_height)

    offset_x = (size - out_width) // 2
    offset_y = (size - out_height) // 2

    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            inside_x = offset_x <= x < offset_x + out_width
            inside_y = offset_y <= y < offset_y + out_height
            if ground is None:
                if inside_x and inside_y:
                    r, g, b, a = scaled[y - offset_y][x - offset_x]
                    alpha = min(1.0, max(0.0, a))
                    # Back to straight alpha for storage.
                    row += bytes(
                        (
                            channel_byte(r / alpha) if alpha else 0,
                            channel_byte(g / alpha) if alpha else 0,
                            channel_byte(b / alpha) if alpha else 0,
                            # Coverage is a fraction; the channel is a byte.
                            channel_byte(alpha * 255),
                        )
                    )
                else:
                    row += b"\x00\x00\x00\x00"
            elif inside_x and inside_y:
                r, g, b, a = scaled[y - offset_y][x - offset_x]
                alpha = min(1.0, max(0.0, a))
                # Premultiplied mark over an opaque ground is one multiply and one add.
                row += bytes(
                    channel_byte(channel + base * (1 - alpha))
                    for channel, base in zip((r, g, b), ground)
                )
            else:
                row += bytes(ground)
        rows.append(bytes(row))
    return rows


def channel_byte(value):
    return min(255, max(0, round(value)))


# ---------- writing ----------


def write_png(path, size, rows, with_alpha):
    def chunk(kind, payload):
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    header = struct.pack(">IIBBBBB", size, size, 8, 6 if with_alpha else 2, 0, 0, 0)
    body = zlib.compress(b"".join(b"\x00" + row for row in rows), 9)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", body) + chunk(b"IEND", b"")
    )


def main():
    width, height, rows = read_png(SOURCE)
    box = mark_bounds(width, height, rows)
    mark = premultiplied(width, height, rows, box)
    print(f"{SOURCE.name} {width}x{height}, mark {box[2] - box[0]}x{box[3] - box[1]} at {box[:2]}")

    for name, size, padding, ground in TARGETS:
        target = PUBLIC / name
        write_png(target, size, compose(mark, size, padding, ground), ground is None)
        kind = "transparent" if ground is None else "#%02x%02x%02x" % ground
        print(f"{name} {size}x{size} pad {padding:.0%} on {kind} -> {target.stat().st_size} bytes")


if __name__ == "__main__":
    main()
