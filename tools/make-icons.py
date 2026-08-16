"""Build-time only. Draws the Lawha action icons at 16/32/48/128 px.

The mark is the Waqt arc: one hairline sweep across a squircle, with the
present-moment dot sitting just past centre. Rendered at 8x and downsampled
so the hairline survives at 16px.
"""
import pathlib
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "assets"
OUT.mkdir(parents=True, exist_ok=True)

ACCENT = (31, 110, 99, 255)      # --accent, waraq
PAPER = (251, 250, 247, 255)     # --bg-canvas, waraq
TRACK = (251, 250, 247, 90)      # arc ahead of now
SS = 8                           # supersample factor


def quad(t, p0, p1, p2):
    """Point on a quadratic bezier at t."""
    m = 1 - t
    return (m * m * p0[0] + 2 * m * t * p1[0] + t * t * p2[0],
            m * m * p0[1] + 2 * m * t * p1[1] + t * t * p2[1])


def draw(size):
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.22, fill=ACCENT)

    # Arc geometry, in unit space, mirroring the newtab Waqt path.
    p0 = (0.20 * s, 0.64 * s)
    p1 = (0.50 * s, 0.30 * s)
    p2 = (0.80 * s, 0.64 * s)
    now = 0.62                       # where the dot sits along the sweep

    w = max(SS, round(s * 0.030))    # hairline: ~1px at final scale
    steps = 240

    def stroke(a, b, fill):
        pts = [quad(a + (b - a) * i / steps, p0, p1, p2) for i in range(steps + 1)]
        d.line(pts, fill=fill, width=w, joint="curve")

    stroke(now, 1.0, TRACK)
    stroke(0.0, now, PAPER)

    cx, cy = quad(now, p0, p1, p2)
    r = s * 0.062
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=PAPER)

    return img.resize((size, size), Image.LANCZOS)


for n in (16, 32, 48, 128):
    path = OUT / f"icon-{n}.png"
    draw(n).save(path, "PNG", optimize=True)
    print(f"  {path.name:16s} {path.stat().st_size:6d} bytes")
