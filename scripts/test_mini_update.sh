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
