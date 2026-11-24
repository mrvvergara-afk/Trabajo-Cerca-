"""Regenerate the bundled, pinned Tesseract Spanish model from npm ci."""
import base64
import hashlib
from pathlib import Path
import re
from textwrap import wrap

base = Path(__file__).resolve().parents[2]
model_path = base / 'node_modules/@tesseract.js-data/spa/4.0.0_best_int/spa.traineddata.gz'
target = base / 'backend/ocr-spa-model'
index = target.with_suffix('.ts')
model = model_path.read_bytes()
digest = hashlib.sha256(model).hexdigest()
expected = re.search(r"modelSha256='([0-9a-f]{64})'", index.read_text()).group(1)
if digest != expected:
    raise SystemExit('El archivo no coincide con el modelo fijado.')
payload = base64.b64encode(model).decode()
target.mkdir(exist_ok=True)
imports, names = [], []
for i, start in enumerate(range(0, len(payload), 105000)):
    name = f'data{i:02d}'
    names.append(name)
    (target / f'{name}.ts').write_text(
        '// Generated from the pinned, compressed Tesseract Spanish model.\nexport default [\n'
        + ''.join(f" '{part}',\n" for part in wrap(payload[start:start+105000], 100))
        + "].join('');\n"
    )
    imports.append(f"import {name} from './ocr-spa-model/{name}';\n")
index.write_text(''.join(imports) + f"\nexport const modelSha256='{digest}';\n"
                 + 'export const compressedSpanishModel=[' + ','.join(names) + "].join('');\n")
