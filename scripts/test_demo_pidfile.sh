#!/bin/bash
# demo.sh's stop_all, the functions themselves (read out of demo.sh): a pid file left by a run that never stopped (a reboot,
# a crash) can name an unrelated process by now, and that process must survive; one demo.sh did start is stopped. Run by
# CI's Linux and mini-macos (bash 3.2) jobs, and by hand.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; T="$(mktemp -d)"; KIDS=()
trap 'for p in ${KIDS[@]+"${KIDS[@]}"}; do kill "$p" 2>/dev/null || true; done; rm -rf "$T"' EXIT
{ grep -E '^(say|warn|die)\(\)' "$ROOT/demo.sh"
  for f in stop_pid ours stop_all; do awk -v f="$f" '$0 ~ "^"f"\\(\\) \\{" {on=1} on {print} on && /^\}/ {exit}' "$ROOT/demo.sh"; done; } > "$T/helpers.sh"
for f in stop_pid ours stop_all; do grep -q "^$f() {" "$T/helpers.sh" || { echo "FAIL: demo.sh has no $f"; exit 1; }; done
fail() { echo "FAIL: $*"; exit 1; }
STATE="$T/state"; mkdir -p "$STATE" "$T/node_modules/next/dist/bin"
printf 'while :; do sleep 1; done\n' > "$T/node_modules/next/dist/bin/next"
alive() { kill -0 "$1" 2>/dev/null; }
run_stop_all() { STATE="$STATE" bash -c ". '$T/helpers.sh'; stop_all" 2>&1; }

sleep 300 & stranger=$!; KIDS+=("$stranger"); disown "$!"                     # what a stale pid now names: not ours
bash "$T/node_modules/next/dist/bin/next" & web=$!; KIDS+=("$web"); disown "$!"  # the web app demo.sh started (next dev)
bash -c 'while :; do sleep 1; done' d1a.serving.serve & model=$!; KIDS+=("$model"); disown "$!"

echo "$stranger" > "$STATE/web.pid"
out="$(run_stop_all)"
alive "$stranger" || fail "stop_all killed an unrelated process that a stale web.pid named"
case "$out" in *"web: process $stranger is not the one this script started; left running"*) ;; *) fail "no warning for the stale pid: $out" ;; esac
[ ! -e "$STATE/web.pid" ] || fail "the stale pid file was kept"

echo "$stranger" > "$STATE/model-server.pid"; echo "$web" > "$STATE/media-server.pid"   # alive, but not what these names start
run_stop_all >/dev/null; alive "$stranger" && alive "$web" || fail "stop_all killed a process under another pid file's name"

echo "$web" > "$STATE/web.pid"; echo "$model" > "$STATE/model-server.pid"; echo "not-a-pid" > "$STATE/media-server.pid"
out="$(run_stop_all)"
for _ in $(seq 20); do alive "$web" || alive "$model" || break; sleep 0.5; done
alive "$web" && fail "stop_all left the web app it started running"
alive "$model" && fail "stop_all left the model server it started running"
case "$out" in *"stopped web"*"stopped model-server"*|*"stopped model-server"*"stopped web"*) ;; *) fail "no 'stopped' lines: $out" ;; esac
[ -z "$(ls "$STATE")" ] || fail "pid files left: $(ls "$STATE")"
alive "$stranger" || fail "the unrelated process died"
echo "demo.sh stop_all: OK under $(bash --version | head -1)"
