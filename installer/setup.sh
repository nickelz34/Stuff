#!/bin/bash
set -euo pipefail

if [[ "$(uname -m)" != "x86_64" ]]; then
  echo "cannot execute binary file: this installer is only for x86_64 (uname -m is $(uname -m))." >&2
  exit 1
fi

no_elevate=0
for arg in "$@"; do
  if [[ "$arg" == "--no-elevate" ]]; then
    no_elevate=1
  fi
done

if [[ "$(id -u)" -ne 0 && "$no_elevate" -eq 0 && "${STUFF_SETUP_ELEVATED:-}" != 1 ]]; then
  export STUFF_SETUP_ELEVATED=1
  if command -v sudo >/dev/null 2>&1; then
    exec sudo env STUFF_SETUP_ELEVATED=1 "$0" "$@"
  fi
  if command -v pkexec >/dev/null 2>&1; then
    exec pkexec env STUFF_SETUP_ELEVATED=1 "$0" "$@"
  fi
  echo "This installer needs sudo, or run it again with --no-elevate." >&2
  exit 1
fi

node_is_ready() {
  local raw major minor
  raw=$("${1:-node}" -v 2>/dev/null || true)
  raw=${raw#v}
  [[ -n "$raw" ]] || return 1
  IFS=. read -r major minor _ <<<"$raw"
  if (( major > 22 )); then return 0; fi
  if (( major < 22 )); then return 1; fi
  (( minor >= 13 ))
}

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

line=$(awk '/^__STUFF_PAYLOAD__$/{print NR + 1; exit}' "$0")
if [[ -z "${line}" ]]; then
  echo "This setup file is missing its payload." >&2
  exit 1
fi
tail -n +"$line" "$0" | tar -xz -C "$TMP"

NODE=""
if command -v node >/dev/null 2>&1 && node_is_ready node; then
  NODE=$(command -v node)
else
  sums=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt)
  name=$(printf '%s\n' "$sums" | awk '/node-v22\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$/ { print $2; exit }')
  if [[ -z "$name" ]]; then
    echo "Could not find a Node.js 22 linux-x64 download." >&2
    exit 1
  fi
  curl -fsSL -o "$TMP/node.tar.xz" "https://nodejs.org/dist/latest-v22.x/${name}"
  mkdir -p "$TMP/bootstrap-node"
  tar -xJf "$TMP/node.tar.xz" -C "$TMP/bootstrap-node" --strip-components=1
  NODE="$TMP/bootstrap-node/bin/node"
  if ! node_is_ready "$NODE"; then
    echo "The downloaded Node.js is older than 22.13." >&2
    exit 1
  fi
fi

cli=0
for arg in "$@"; do
  if [[ "$arg" == "--cli" ]]; then
    cli=1
  fi
done

if [[ "$cli" -eq 0 ]]; then
  trap - EXIT
fi

exec "$NODE" "$TMP/installer/server.mjs" --payload "$TMP" "$@"
exit 1
__STUFF_PAYLOAD__
