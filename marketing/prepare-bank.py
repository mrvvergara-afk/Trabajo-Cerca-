"""Build the institutional bank from the authorized originals and a JSON catalog."""
import argparse
import hashlib
import io
import json
from pathlib import Path
from zipfile import ZipFile

from PIL import Image, ImageOps

MAX_BYTES = 200_000
Image.MAX_IMAGE_PIXELS = 25_000_000


def source_bytes(root, entry):
    path = root / entry["source"]
    if "member" in entry:
        with ZipFile(path) as archive:
            member = archive.getinfo(entry["member"])
            if member.file_size > 18_000_000:
                raise ValueError("Original demasiado grande")
            return archive.read(member)
    if path.stat().st_size > 18_000_000:
        raise ValueError("Original demasiado grande")
    return path.read_bytes()


def derivative(image, directory, size, image_format):
    canvas = ImageOps.fit(image, size, method=Image.Resampling.LANCZOS)
    extension = "webp" if image_format == "WEBP" else "jpg"
    for quality in range(86, 59, -4):
        result = io.BytesIO()
        canvas.save(result, image_format, quality=quality, optimize=True)
        data = result.getvalue()
        if len(data) <= MAX_BYTES:
            digest = hashlib.sha256(data).hexdigest()
            (directory / f"{digest}.{extension}").write_bytes(data)
            return {"sha256": digest, "bytes": len(data), "width": size[0], "height": size[1]}
    raise ValueError("La imagen supera 200 KB al umbral de calidad establecido")


def build(root, catalog, directory):
    directory.mkdir(parents=True, exist_ok=True)
    records = []
    for entry in catalog:
        if entry.get("rights") != "trabajo-cerca-generated":
            raise ValueError(f"Falta acreditar el uso editorial de {entry['id']}")
        original = source_bytes(root, entry)
        with Image.open(io.BytesIO(original)) as opened:
            if getattr(opened, "n_frames", 1) != 1:
                raise ValueError("El original debe ser una imagen fija")
            image = ImageOps.exif_transpose(opened).convert("RGB")
        if min(image.size) < 600 or max(image.size) > 6000:
            raise ValueError("Dimensiones del original fuera del rango")
        if max(high - low for low, high in image.getextrema()) < 40:
            raise ValueError("Original sin contraste suficiente")
        records.append({
            **entry,
            "originalSha256": hashlib.sha256(original).hexdigest(),
            "web": derivative(image, directory, (840, 560), "WEBP"),
            "social": derivative(image, directory, (840, 840), "JPEG"),
        })
    (directory / "index.json").write_text(
        json.dumps({"schema": 1, "assets": records}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf8",
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("originals", type=Path)
    parser.add_argument("--catalog", type=Path, default=Path(__file__).with_name("asset-sources.json"))
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("bank"))
    args = parser.parse_args()
    build(args.originals, json.loads(args.catalog.read_text(encoding="utf8")), args.output)
