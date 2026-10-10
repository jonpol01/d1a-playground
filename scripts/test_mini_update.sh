#!/bin/bash
# mini.sh reinstall (update runs it after the pull) under the system bash (3.2 on macOS): a model-server install that fails
# leaves the running services up, a step that fails after they were stopped starts them again, and uv uses the cache under
# .demo unless UV_CACHE_DIR names another. On 2026-10-07 a uv cache owned by root failed the install after the stop and left
# the Mac mini down. Run by CI's mini-macos job, and by hand on a Mac.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/app/.demo" "$T/home"; cp "$ROOT/mini.sh" "$T/app/"; printf 'PORT=3999\n' > "$T/app/.demo/mini.env"
# stand-ins for what mini.sh runs, as exported functions so they win over the Homebrew PATH it prepends; they log their calls
uv() { echo "uv $* cache=$(printenv UV_CACHE_DIR || echo unset)" >> "$CALLS"; [ "$1" != pip ] || [ -z "${FAIL_UV:-}" ]; }   # printenv: what uv itself would see
npm() { echo "npm $*" >> "$CALLS"; [ "$1" != ci ] || [ -z "${FAIL_NPM:-}" ]; }
launchctl() { echo "launchctl $*" >> "$CALLS"; }
node() { :; }; curl() { :; }; plutil() { :; }
export -f uv npm launchctl node curl plutil
run() {   # case name, then its environment: the calls go to $T/<name>, mini.sh's output and exit status next to them
  CALLS="$T/$1"; export CALLS; : > "$CALLS"; shift
  local status=0; env -u UV_CACHE_DIR "$@" HOME="$T/home" /bin/bash "$T/app/mini.sh" reinstall > "$CALLS.out" 2>&1 || status=$?
  echo "$status" > "$CALLS.status"
}
last() { { grep -nE -- "$2" "$T/$1" || true; } | tail -1 | cut -d: -f1; }   # line of case $1's last call matching $2, or empty
fail() { echo "mini.sh reinstall, $1: $2"; echo "--- calls"; cat "$T/$1"; echo "--- output"; cat "$T/$1.out"; exit 1; }
SERVICE='(io.github.jonpol01.d1a-model|io.github.jonpol01.d1a-web)'

run clean FAIL_UV=
[ "$(cat "$T/clean.status")" = 0 ] && [ -n "$(last clean "bootstrap .*$SERVICE.plist")" ] || fail clean "did not reinstall and restart"
run override FAIL_UV= UV_CACHE_DIR="$T/elsewhere"
[ "$(cat "$T/override.status")" = 0 ] || fail override "did not reinstall"
for case in clean override; do   # every uv call sees the cache: .demo's by default, UV_CACHE_DIR's when it is set
  want="$T/app/.demo/uv-cache"; [ $case = override ] && want="$T/elsewhere"
  calls=$(grep -c "^uv " "$T/$case" || true); seen=$(grep -cF -- " cache=$want" "$T/$case" || true)   # -c prints 0 but exits 1
  [ "$calls" -ge 2 ] && [ "$seen" = "$calls" ] || fail $case "uv did not use the cache $want"
done

printf 'PORT=3999\nLABEL_OUTCOMES=1\nFEEDBACK_LOG=%s\nOUTCOME_CALIBRATOR=%s\nMODEL_RUN=JohnP1/d1a-e4b-mlx-q8@v0.5\n' "$T/log.jsonl" "$T/cal.json" > "$T/app/.demo/mini.env"
mkdir -p "$T/app/.demo/d1a-venv/bin"   # the model server's venv: its python logs the learning commands and writes the file
cat > "$T/app/.demo/d1a-venv/bin/python" <<'PY'
#!/bin/bash
echo "python $*" >> "$CALLS"; for a in "$@"; do [ "$prev" = --file ] && [ "$3" = config ] && [ "$4" = init ] && echo '{}' > "$a"; prev=$a; done; exit 0
PY
chmod +x "$T/app/.demo/d1a-venv/bin/python"
run promote FAIL_UV=   # the 15-minute self-learning tick replaces the 04:00 promote (d1a#233)
agent="$T/home/Library/LaunchAgents/io.github.jonpol01.d1a-promote.plist"
[ "$(cat "$T/promote.status")" = 0 ] && [ -f "$agent" ] || fail promote "did not write the learning agent"
grep -A1 "<string>d1a.learning.feedback</string>" "$agent" | grep -qF "<string>tick</string>" || fail promote "the agent does not run the tick"
grep -A1 "<string>--server</string>" "$agent" | grep -qF "<string>http://127.0.0.1:8009</string>" || fail promote "the tick does not ask the model server which model it serves"
grep -A1 "<string>--trained-dir</string>" "$agent" | grep -qF "<string>$T/app/.demo/trained</string>" || fail promote "the tick has no trained manifests folder"
grep -A1 "<key>D1A_LEARNING</key>" "$agent" | grep -qF "<string>$T/app/.demo/learning.json</string>" || fail promote "the tick does not read the settings file"
grep -q "StartInterval" "$agent" && ! grep -q "StartCalendarInterval" "$agent" || fail promote "the tick is not every 15 minutes"
grep -qF "config init --file $T/app/.demo/learning.json" "$T/promote" || fail promote "did not create the settings file"
grep -qF 'promotion.questions=["type","blast","sev"]' "$T/promote" || fail promote "did not set the questions that learn"
run promote2 FAIL_UV=   # a reinstall never overwrites John's settings
! grep -q "config init" "$T/promote2" || fail promote2 "re-created the settings file on reinstall"
printf 'PORT=3999\n' > "$T/app/.demo/mini.env"

run install FAIL_UV=1
[ -n "$(last install "^uv pip install")" ] || fail install "never reached the install"
[ "$(cat "$T/install.status")" != 0 ] || fail install "a failed install exited 0"
[ -z "$(last install "bootout .*/$SERVICE$")" ] || fail install "stopped the services, then the install failed"

run build FAIL_NPM=1
built=$(last build "^npm ci"); [ -n "$built" ] || fail build "never reached the web build"
[ "$(cat "$T/build.status")" != 0 ] || fail build "a failed build exited 0"
for label in io.github.jonpol01.d1a-model io.github.jonpol01.d1a-web; do
  up=$(last build "bootstrap .*$label.plist"); [ -n "$up" ] && [ "$up" -gt "$built" ] || fail build "left $label down after the failed build"
done
echo "mini.sh reinstall: OK under $(/bin/bash --version | head -1)"
