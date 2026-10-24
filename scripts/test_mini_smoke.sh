#!/bin/bash
# mini.sh's smoke step under the system bash (3.2 on macOS): run by CI's mini-macos job, and by hand on a Mac.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; T="$(mktemp -d)"; trap 'kill $SRV 2>/dev/null; rm -rf "$T"' EXIT
mkdir -p "$T/scripts" "$T/.demo" "$T/www/d1a/model/v1"
cp "$ROOT/mini.sh" "$T/"; echo '{"models":[]}' > "$T/www/d1a/model/v1/models"
echo 'import { appendFileSync } from "node:fs"; appendFileSync(process.env.SMOKE_LOG, process.argv.slice(2).join(" ") + "\n"); process.exit(Number(process.env.DEMO_EXIT || 0));' > "$T/scripts/demo_smoke.mjs"
echo 'import { appendFileSync } from "node:fs"; appendFileSync(process.env.SMOKE_LOG, "openai " + process.argv.slice(2).join(" ") + "\n"); process.exit(Number(process.env.OPENAI_EXIT || 0));' > "$T/scripts/openai_smoke.mjs"
python3 -m http.server 3999 -b 127.0.0.1 -d "$T/www" >/dev/null 2>&1 & SRV=$!
for _ in $(seq 50); do curl -fsS -o /dev/null http://127.0.0.1:3999/d1a/model/v1/models 2>/dev/null && break; sleep 0.1; done
for m in 1 0; do
  printf 'MEDIA=%s\nPORT=3999\nD1A_BASE_PATH=/d1a\n' "$m" > "$T/.demo/mini.env"
  SMOKE_LOG="$T/args-$m" /bin/bash "$T/mini.sh" smoke
done
[ "$(cat "$T/args-1")" = "http://127.0.0.1:3999/d1a" ] || { echo "media on: got '$(cat "$T/args-1")'"; exit 1; }
[ "$(cat "$T/args-0")" = "http://127.0.0.1:3999/d1a --no-media" ] || { echo "media off: got '$(cat "$T/args-0")'"; exit 1; }
# OPENAI_PORT adds the OpenAI check after the demos, against the port (as 127.0.0.1 for "::"), with decisions and EMBED_REF;
# a failed check fails the smoke step
printf 'MEDIA=0\nPORT=3999\nD1A_BASE_PATH=/d1a\nOPENAI_PORT=1234\nEMBED_REF=/ref.json\n' > "$T/.demo/mini.env"
SMOKE_LOG="$T/args-openai" /bin/bash "$T/mini.sh" smoke
[ "$(tail -1 "$T/args-openai")" = "openai http://127.0.0.1:1234 --decide http://127.0.0.1:8009 --embed-ref /ref.json" ] || { echo "openai: got '$(cat "$T/args-openai")'"; exit 1; }
if SMOKE_LOG="$T/args-fail" OPENAI_EXIT=1 /bin/bash "$T/mini.sh" smoke >/dev/null 2>&1; then echo "a failed OpenAI check passed the smoke step"; exit 1; fi
# this Mac's own baseline in .demo, when there is one; answers that only differ from it (exit 3) and a failed demo (1) both
# fail the step, each with its own message
printf 'MEDIA=0\nPORT=3999\nD1A_BASE_PATH=/d1a\n' > "$T/.demo/mini.env"; echo '{}' > "$T/.demo/demo-baseline.json"
SMOKE_LOG="$T/args-local" /bin/bash "$T/mini.sh" smoke
[ "$(cat "$T/args-local")" = "http://127.0.0.1:3999/d1a --no-media --baseline=$T/.demo/demo-baseline.json" ] || { echo "local baseline: got '$(cat "$T/args-local")'"; exit 1; }
if out="$(SMOKE_LOG="$T/args-3" DEMO_EXIT=3 /bin/bash "$T/mini.sh" smoke 2>&1)"; then echo "answers that differ from the baseline passed"; exit 1; fi
case "$out" in *"some answers differ from the baseline"*"--baseline=$T/.demo/demo-baseline.json --record"*) ;; *) echo "exit 3: $out"; exit 1 ;; esac
if out="$(SMOKE_LOG="$T/args-f" DEMO_EXIT=1 /bin/bash "$T/mini.sh" smoke 2>&1)"; then echo "a failed demo passed"; exit 1; fi
case "$out" in *"a demo no longer answers"*) ;; *) echo "exit 1: $out"; exit 1 ;; esac
# the served outcome calibrator goes to the smoke test, so answers a promotion moved are reported, not failed (#93)
printf 'MEDIA=0\nPORT=3999\nD1A_BASE_PATH=/d1a\nOUTCOME_CALIBRATOR=/cal.json\n' > "$T/.demo/mini.env"
SMOKE_LOG="$T/args-cal" /bin/bash "$T/mini.sh" smoke
[ "$(cat "$T/args-cal")" = "http://127.0.0.1:3999/d1a --no-media --baseline=$T/.demo/demo-baseline.json --calibrator=/cal.json" ] || { echo "calibrator: got '$(cat "$T/args-cal")'"; exit 1; }
if out="$(SMOKE_LOG="$T/args-cal3" DEMO_EXIT=3 /bin/bash "$T/mini.sh" smoke 2>&1)"; then echo "exit 3 passed"; exit 1; fi
case "$out" in *"--calibrator=/cal.json --record"*) ;; *) echo "the record command leaves out the calibrator: $out"; exit 1 ;; esac
echo "mini.sh smoke: OK under $(/bin/bash --version | head -1)"
