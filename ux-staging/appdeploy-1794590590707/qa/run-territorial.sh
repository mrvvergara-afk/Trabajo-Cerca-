#!/usr/bin/env bash
set -euo pipefail
BASE="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK"/{src,shared}
cp "$BASE/src/territorial-exploration.ts" "$WORK/src/"
cp "$BASE/qa/fixtures/territories.ts" "$WORK/shared/"
cp "$BASE/qa/fixtures/commercial-policy.ts" "$WORK/shared/"
cp "$BASE/qa/test.cjs" "$WORK/"
cd "$WORK"
tsc --module commonjs --target es2020 --rootDir . --outDir dist src/territorial-exploration.ts shared/territories.ts shared/commercial-policy.ts
node test.cjs
