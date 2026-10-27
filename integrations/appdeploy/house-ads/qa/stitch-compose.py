"""Build side-by-side evidence from actual browser screenshots; never synthesize renders."""
import json
import shutil
from pathlib import Path
from PIL import Image, ImageDraw

out = Path('qa-output/stitch-fidelity')
dist = Path('qa-stitch-dist')
out.mkdir(parents=True, exist_ok=True)
rows = []
for width, kind in [(1440, 'web'), (390, 'mobile')]:
    capture = out / f'{width}-full.png'
    if not capture.exists():
        rows.append({'width': width, 'status': 'missing_browser_capture'})
        continue
    original = Image.open(Path('qa/stitch-reference') / kind / 'screen.png').convert('RGB')
    original_size = original.size
    original = original.resize((width, round(original.height * width / original.width)), Image.Resampling.LANCZOS)
    implemented = Image.open(capture).convert('RGB')
    assert implemented.width == width, 'Unexpected screenshot width'
    height = max(original.height, implemented.height)
    pair = Image.new('RGB', (width * 2 + 24, height + 76), '#ffffff')
    draw = ImageDraw.Draw(pair)
    draw.text((12, 12), 'ORIGINAL STITCH (proportionally resized)', fill='#103529')
    draw.text((width + 24, 12), 'REACT IMPLEMENTATION (synthetic QA data)', fill='#103529')
    draw.text((12, 36), f'Original {original_size[0]}x{original_size[1]}; comparison width {width}px. No pixel-match approval implied.', fill='#4a584e')
    pair.paste(original, (0, 76))
    pair.paste(implemented, (width + 24, 76))
    pair.save(out / f'{width}-side-by-side.png')
    rows.append({'width': width, 'status': 'generated', 'originalSize': original_size, 'captureSize': implemented.size})
(out / 'comparison-results.json').write_text(json.dumps(rows, indent=2))
if dist.exists():
    shutil.copytree(out, dist / 'comparisons', dirs_exist_ok=True)
    (dist / 'LEEME.txt').write_text('Trabajo Cerca: vista React aislada con datos sinteticos. No publicar este build.\nEjecutar: python -m http.server 8000 --bind 127.0.0.1\nAbrir http://127.0.0.1:8000/ para comparar y /qa/stitch-preview.html para la app.\nresults.json identifica verificaciones aprobadas, fallos y bloqueos.\nLas capturas no son una prueba con el SDK productivo.\n')
print(json.dumps(rows))
