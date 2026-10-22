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
launchctl() {   # FAIL_BOOTSTRAP=n: the first n bootstraps fail as launchd does right after a bootout (exit 5)
  echo "launchctl $*" >> "$CALLS"
  [ "$1" = bootstrap ] && [ -n "${FAIL_BOOTSTRAP:-}" ] || return 0
  local n; n=$(cat "$CALLS.bs" 2>/dev/null || echo 0); echo $((n + 1)) > "$CALLS.bs"
  [ "$n" -ge "$FAIL_BOOTSTRAP" ] || { echo "Bootstrap failed: 5: Input/output error" >&2; return 5; }
}
sleep() { :; }
node() { [ "${1:-}" != -p ] || echo "${NODE_VERSION:-22.11.0}"; }; curl() { :; }; plutil() { :; }   # NODE_VERSION: what node -p reports
export -f uv npm launchctl node curl plutil sleep
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
grep -A1 "<key>D1A_LEARNING</key>" "$T/home/Library/LaunchAgents/io.github.jonpol01.d1a-model.plist" | grep -qF "<string>$T/app/.demo/learning.json</string>" || fail promote "the model server does not read the settings file (its learned flags and rules)"
grep -qF "config init --file $T/app/.demo/learning.json" "$T/promote" || fail promote "did not create the settings file"
grep -qF 'promotion.questions=["type","blast","sev"]' "$T/promote" || fail promote "did not set the questions that learn"
run promote2 FAIL_UV=   # a reinstall never overwrites John's settings
! grep -q "config init" "$T/promote2" || fail promote2 "re-created the settings file on reinstall"
printf 'PORT=3999\n' > "$T/app/.demo/mini.env"

printf 'PORT=3999\nOPENAI_PORT=1234\nEMBED_GGUF=/models/nomic.gguf\nCHAT_CONTEXT=32768\n' > "$T/app/.demo/mini.env"
run openai FAIL_UV=   # OPENAI_PORT and EMBED_GGUF: the OpenAI routes on the LAN and the embedder (d1a#274)
agent="$T/home/Library/LaunchAgents/io.github.jonpol01.d1a-openai.plist"
[ "$(cat "$T/openai.status")" = 0 ] && [ -f "$agent" ] || fail openai "did not write the OpenAI port agent"
tr -d ' \n' < "$agent" | grep -qF "openai_port.mjs</string><string>::</string><string>1234</string><string>http://127.0.0.1:8009</string>" || fail openai "the agent does not forward every address on 1234 to the model server"
[ -n "$(last openai "bootstrap .*io.github.jonpol01.d1a-openai.plist")" ] || fail openai "did not start the OpenAI port"
grep -A1 "<key>D1A_EMBED_GGUF</key>" "$T/home/Library/LaunchAgents/io.github.jonpol01.d1a-model.plist" | grep -qF "<string>/models/nomic.gguf</string>" || fail openai "the model server has no embedder"
grep -q '^uv pip install .*d1a\[serve,embed\]' "$T/openai" || fail openai "did not install the embed extra"
grep -A1 "<key>D1A_CHAT_CONTEXT</key>" "$T/home/Library/LaunchAgents/io.github.jonpol01.d1a-model.plist" | grep -qF "<string>32768</string>" || fail openai "the model server has no chat context cap"   # d1a#318
printf 'PORT=3999\n' > "$T/app/.demo/mini.env"
run openai_off FAIL_UV=   # without OPENAI_PORT the agent goes, and nothing listens on the LAN
[ ! -f "$agent" ] && [ -n "$(last openai_off "bootout .*/io.github.jonpol01.d1a-openai$")" ] || fail openai_off "left the OpenAI port agent"
! grep -q 'embed\]' "$T/openai_off" || fail openai_off "installed the embed extra without EMBED_GGUF"
! grep -q "D1A_CHAT_CONTEXT" "$T/home/Library/LaunchAgents/io.github.jonpol01.d1a-model.plist" || fail openai_off "set a chat context cap nobody asked for"

run bootstrap FAIL_UV= FAIL_BOOTSTRAP=2   # launchd refuses the first two bootstraps: start waits and tries again (2026-10-15)
[ "$(cat "$T/bootstrap.status")" = 0 ] || fail bootstrap "a refused bootstrap ended the start"
for label in io.github.jonpol01.d1a-model io.github.jonpol01.d1a-web; do
  [ -n "$(last bootstrap "kickstart .*$label$")" ] || fail bootstrap "$label never started after launchd refused a bootstrap"
done
run bootstrap_never FAIL_UV= FAIL_BOOTSTRAP=99   # launchd never accepts: the start fails loudly, not silently
[ "$(cat "$T/bootstrap_never.status")" != 0 ] && grep -q "refused" "$T/bootstrap_never.out" || fail bootstrap_never "a start launchd never accepted exited 0"

run install FAIL_UV=1
[ -n "$(last install "^uv pip install")" ] || fail install "never reached the install"
[ "$(cat "$T/install.status")" != 0 ] || fail install "a failed install exited 0"
[ -z "$(last install "bootout .*/$SERVICE$")" ] || fail install "stopped the services, then the install failed"

run oldnode FAIL_UV= NODE_VERSION=20.8.1   # Next.js 16 needs Node 20.9: refused before anything is installed or stopped
[ "$(cat "$T/oldnode.status")" != 0 ] && grep -qF "Node.js 20.8.1 is too old" "$T/oldnode.out" || fail oldnode "took Node 20.8.1"
[ -z "$(last oldnode "^uv pip install|^npm ci|bootout")" ] || fail oldnode "installed, built or stopped before refusing Node 20.8.1"
run newnode FAIL_UV= NODE_VERSION=26.10.0
[ "$(cat "$T/newnode.status")" = 0 ] || fail newnode "refused Node 26.10.0"

run build FAIL_NPM=1
built=$(last build "^npm ci"); [ -n "$built" ] || fail build "never reached the web build"
[ "$(cat "$T/build.status")" != 0 ] || fail build "a failed build exited 0"
for label in io.github.jonpol01.d1a-model io.github.jonpol01.d1a-web; do
  up=$(last build "bootstrap .*$label.plist"); [ -n "$up" ] && [ "$up" -gt "$built" ] || fail build "left $label down after the failed build"
done
echo "mini.sh reinstall: OK under $(/bin/bash --version | head -1)"
