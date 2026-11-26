#!/usr/bin/env python3
"""Build the rocky-mem brand assets from one source illustration.

    python3 scripts/build-brand-assets.py --source ~/Desktop/rocky.png

Pipeline: key out the flat background, remove the ground shadow, square the
subject with even padding, then emit every size the plugin needs. Small sizes get
their own rim (dilate + tint), because a rim scaled down from 1024 disappears.

Requires Pillow, NumPy and SciPy.
"""

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

SIZES = (1024, 512, 256, 180, 64, 48, 32, 24, 16)
RIM = (29, 87, 137)  # #1D5789, the character's own outline colour
RIM_ALPHA = 150
PAD = 0.06


def cutout(src: Image.Image) -> Image.Image:
    """Drop the background and the ground shadow, keep interior highlights."""
    rgba = src.convert("RGBA")
    rgb = np.array(rgba).astype(int)[..., :3]
    sat = rgb.max(axis=2) - rgb.min(axis=2)
    lum = rgb.mean(axis=2)

    # Character = saturated blue or dark outline. The shadow is neutral
    # (sat ~15, lum ~222), so it falls outside both.
    mask = (sat > 22) | (lum < 205)
    mask = ndimage.binary_fill_holes(mask)  # restore eye whites and speculars
    mask = ndimage.binary_closing(mask, iterations=2)
    labels, count = ndimage.label(mask)
    if count > 1:
        sizes = ndimage.sum(mask, labels, range(1, count + 1))
        mask = labels == int(np.argmax(sizes)) + 1

    alpha = Image.fromarray(np.where(mask, 255, 0).astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(0.8)
    )
    out = rgba.copy()
    out.putalpha(alpha)
    return out


def square(im: Image.Image, pad: float = PAD, side: int = 1024) -> Image.Image:
    box = im.getbbox()
    if box is None:
        raise SystemExit("nothing left after cutout")
    body = im.crop(box)
    edge = int(max(body.size) * (1 + 2 * pad))
    canvas = Image.new("RGBA", (edge, edge), (0, 0, 0, 0))
    canvas.paste(body, ((edge - body.width) // 2, (edge - body.height) // 2), body)
    return canvas.resize((side, side), Image.LANCZOS)


def rim(im: Image.Image, width: int) -> Image.Image:
    """Draw a soft outline just outside the alpha, in the art's own colour."""
    arr = np.array(im)
    solid = arr[..., 3] > 24
    grown = ndimage.binary_dilation(solid, iterations=max(1, width))
    ring = grown & ~solid
    out = arr.copy()
    out[ring] = [*RIM, RIM_ALPHA]
    return Image.fromarray(out).filter(ImageFilter.GaussianBlur(0.35))


def rim_width(size: int) -> int:
    return max(1, round(size / 340))


def avatar(master: Image.Image, size: int = 1024, scale: float = 0.82) -> Image.Image:
    """Leave room for a circular mask, which clips the arms otherwise."""
    inner = master.resize((int(size * scale), int(size * scale)), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    offset = (size - inner.width) // 2
    canvas.paste(inner, (offset, offset), inner)
    return rim(canvas, rim_width(size))


def save_png(im: Image.Image, path: Path) -> None:
    """Flat illustration + alpha: 256 colours is lossless to the eye and ~8x smaller."""
    im.quantize(colors=256, method=Image.FASTOCTREE, dither=Image.NONE).save(
        path, "PNG", optimize=True, compress_level=9
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True, help="original illustration (PNG)")
    ap.add_argument("--out", default="assets/brand")
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    master = square(cutout(Image.open(args.source)))
    save_png(master, out / "mascot-1024.png")  # no rim: for large editorial use

    for size in SIZES:
        scaled = master.resize((size, size), Image.LANCZOS)
        save_png(rim(scaled, rim_width(size)), out / f"icon-{size}.png")

    save_png(avatar(master), out / "avatar-1024.png")

    frames = [Image.open(out / f"icon-{s}.png").convert("RGBA") for s in (16, 32, 48)]
    frames[0].save(out / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"wrote {len(SIZES) + 3} files to {out}")


if __name__ == "__main__":
    main()
