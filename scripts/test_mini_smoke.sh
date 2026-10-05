#!/bin/bash
# mini.sh's smoke step under the system bash (3.2 on macOS): run by CI's mini-macos job, and by hand on a Mac.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; T="$(mktemp -d)"; trap 'kill $SRV 2>/dev/null; rm -rf "$T"' EXIT
mkdir -p "$T/scripts" "$T/.demo" "$T/www/d1a/kev/v1"
cp "$ROOT/mini.sh" "$T/"; echo '{"models":[]}' > "$T/www/d1a/kev/v1/models"
echo 'import { appendFileSync } from "node:fs"; appendFileSync(process.env.SMOKE_LOG, process.argv.slice(2).join(" ") + "\n");' > "$T/scripts/demo_smoke.mjs"
python3 -m http.server 3999 -b 127.0.0.1 -d "$T/www" >/dev/null 2>&1 & SRV=$!
for _ in $(seq 50); do curl -fsS -o /dev/null http://127.0.0.1:3999/d1a/kev/v1/models 2>/dev/null && break; sleep 0.1; done
for m in 1 0; do
  printf 'MEDIA=%s\nPORT=3999\nD1A_BASE_PATH=/d1a\n' "$m" > "$T/.demo/mini.env"
  SMOKE_LOG="$T/args-$m" /bin/bash "$T/mini.sh" smoke
done
[ "$(cat "$T/args-1")" = "http://127.0.0.1:3999/d1a" ] || { echo "media on: got '$(cat "$T/args-1")'"; exit 1; }
[ "$(cat "$T/args-0")" = "http://127.0.0.1:3999/d1a --no-media" ] || { echo "media off: got '$(cat "$T/args-0")'"; exit 1; }
echo "mini.sh smoke: OK under $(/bin/bash --version | head -1)"
