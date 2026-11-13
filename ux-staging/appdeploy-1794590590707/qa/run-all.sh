#!/usr/bin/env bash
set -euo pipefail
BASE="$(cd "$(dirname "$0")/.." && pwd)"
bash "$BASE/qa/run-territorial.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/shared"
cp "$BASE/shared/house-ads.ts" "$BASE/shared/ad-images.ts" "$WORK/shared/"
cd "$WORK"
tsc --module commonjs --target es2020 --outDir dist --rootDir . shared/ad-images.ts shared/house-ads.ts
cp "$BASE/qa/test-commercial.cjs" test-commercial.cjs
node test-commercial.cjs
node "$BASE/qa/test-ux-structure.cjs"
