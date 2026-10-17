#!/bin/bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"
mkdir -p dist
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT

node "$ROOT/installer/payload.mjs" --root "$ROOT" > "$stage/files.txt"
tar -czf "$stage/payload.tgz" -C "$ROOT" -T "$stage/files.txt"

# The header already ends with the payload marker. Append the archive after it.
cat "$ROOT/installer/setup.sh" "$stage/payload.tgz" > "$ROOT/dist/Stuff-Setup-linux-amd64"
chmod +x "$ROOT/dist/Stuff-Setup-linux-amd64"

bytes=$(wc -c < "$ROOT/dist/Stuff-Setup-linux-amd64" | tr -d ' ')
echo "Wrote dist/Stuff-Setup-linux-amd64 ($bytes bytes)"

node --experimental-strip-types --disable-warning=ExperimentalWarning \
  "$ROOT/lib/update.ts" --root "$ROOT" --out "$ROOT/dist/Stuff-Update.zip"
