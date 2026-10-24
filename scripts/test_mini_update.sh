#!/bin/bash
# mini.sh reinstall (update runs it after the pull) under the system bash (3.2 on macOS): a model-server install that fails
# leaves the running services up, a step that fails after they were stopped starts them again, and uv uses the cache under
# .demo unless UV_CACHE_DIR names another. On 2026-10-07 a uv cache owned by root failed the install after the stop and left
# the serving Mac down. Run by CI's mini-macos job, and by hand on a Mac.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
mkdir -p "$T/app/.demo" "$T/home"; cp "$ROOT/mini.sh" "$T/app/"; printf 'PORT=3999\n' > "$T/app/.demo/mini.env"
APP="$T/app"; V="$APP/.demo/d1a-venvs"; PIN="$(sed -n 's/^D1A_SHA="\([0-9a-f]*\)".*/\1/p' "$ROOT/mini.sh")"; export APP
mkdir -p "$APP/scripts"; cp "$ROOT/scripts/d1a-constraints.txt" "$APP/scripts/"   # the tested environment install_server pins
CH() { shasum -a 256 "$APP/scripts/d1a-constraints.txt" | cut -c1-8; }   # its hash, in every venv's name
pin() { sed "s/^D1A_SHA=\"[0-9a-f]*\"/D1A_SHA=\"$1\"/" "$ROOT/mini.sh" > "$APP/mini.sh"; }   # the copy, pinned to another D1A commit
# a venv's python: it logs its calls, and writes the settings file config init names
PYSTUB="$T/python"; export PYSTUB
cat > "$PYSTUB" <<'PY'
#!/bin/bash
echo "python $*" >> "$CALLS"; for a in "$@"; do [ "$prev" = --file ] && [ "$3" = config ] && [ "$4" = init ] && echo '{}' > "$a"; prev=$a; done; exit 0
PY
chmod +x "$PYSTUB"
mkdir -p "$APP/.demo/d1a-venv/bin"; cp "$PYSTUB" "$APP/.demo/d1a-venv/bin/python"   # the one venv the serving Mac had before venvs per pin
# stand-ins for what mini.sh runs, as exported functions so they win over the Homebrew PATH it prepends; they log their calls
uv() {   # printenv: what uv itself would see; venv makes the directory, with the logging python
  echo "uv $* cache=$(printenv UV_CACHE_DIR || echo unset)" >> "$CALLS"
  if [ "$1" = venv ]; then eval "local d=\${$#}"; mkdir -p "$d/bin"; cp "$PYSTUB" "$d/bin/python"; fi
  [ "$1" != pip ] || [ -z "${FAIL_UV:-}" ]
}
npm() {   # a build logs the proxy target it was given
  echo "npm $*" >> "$CALLS"; [ "$1" != run ] || echo "build MODEL_API=${MODEL_API-unset} KEV_API=${KEV_API-unset}" >> "$CALLS"
  [ "$1" != ci ] || [ -z "${FAIL_NPM:-}" ]
}
launchctl() {   # FAIL_BOOTSTRAP=n: the first n bootstraps fail as launchd does right after a bootout (exit 5)
  echo "launchctl $*" >> "$CALLS"
  case "$1 ${2:-}" in "bootout "*/io.github.jonpol01.d1a-model) echo "current at the model's bootout: $(readlink "$APP/.demo/d1a-venvs/current" || echo none)" >> "$CALLS" ;; esac
  [ "$1" = bootstrap ] && [ -n "${FAIL_BOOTSTRAP:-}" ] || return 0
  local n; n=$(cat "$CALLS.bs" 2>/dev/null || echo 0); echo $((n + 1)) > "$CALLS.bs"
  [ "$n" -ge "$FAIL_BOOTSTRAP" ] || { echo "Bootstrap failed: 5: Input/output error" >&2; return 5; }
}
sleep() { :; }
node() {   # NODE_VERSION: what node -p reports; SMOKE_EXIT: what the demo smoke test exits with
  case "${1:-}" in -p) echo "${NODE_VERSION:-22.11.0}" ;; */demo_smoke.mjs) return "${SMOKE_EXIT:-0}" ;; esac
}
curl() { case "$*" in *v1/systemone*) return "${ANSWER_EXIT:-0}" ;; esac; }; plutil() { :; }   # ANSWER_EXIT: a decision fails
export -f uv npm launchctl node curl plutil sleep
run() {   # case name, then its environment: the calls go to $T/<name>, mini.sh's output and exit status next to them
  CALLS="$T/$1"; export CALLS; : > "$CALLS"; shift
  local status=0; env -u UV_CACHE_DIR "$@" HOME="$T/home" /bin/bash "$T/app/mini.sh" "${CMD:-reinstall}" > "$CALLS.out" 2>&1 || status=$?
  echo "$status" > "$CALLS.status"
}
last() { { grep -nE -- "$2" "$T/$1" || true; } | tail -1 | cut -d: -f1; }   # line of case $1's last call matching $2, or empty
fail() { echo "mini.sh reinstall, $1: $2"; echo "--- calls"; cat "$T/$1"; echo "--- output"; cat "$T/$1.out"; exit 1; }
SERVICE='(io.github.jonpol01.d1a-model|io.github.jonpol01.d1a-web)'

run clean FAIL_UV=
[ "$(cat "$T/clean.status")" = 0 ] && [ -n "$(last clean "bootstrap .*$SERVICE.plist")" ] || fail clean "did not reinstall and restart"
# venvs per pin: the first one is installed while the old venv serves, and current points at it only after the model stopped;
# the old venv stays where it is, as previous
installed=$(last clean "^uv pip install .*d1a-venvs/${PIN:0:12}-serve-$(CH)/"); stopped=$(last clean "bootout .*/io.github.jonpol01.d1a-model$")
[ -n "$installed" ] && [ -n "$stopped" ] && [ "$installed" -lt "$stopped" ] || fail clean "did not install into a venv of its own before the stop"
grep -qx "current at the model's bootout: none" "$T/clean" || fail clean "switched the venv before the model stopped"
[ "$(readlink "$V/current")" = "${PIN:0:12}-serve-$(CH)" ] && [ "$(readlink "$V/previous")" = "$APP/.demo/d1a-venv" ] && [ -x "$APP/.demo/d1a-venv/bin/python" ] \
  || fail clean "current/previous: $(readlink "$V/current") / $(readlink "$V/previous")"
grep -qF "<string>$V/current/bin/python</string>" "$T/home/Library/LaunchAgents/io.github.jonpol01.d1a-model.plist" || fail clean "the model agent does not run current's python"
grep -q "^uv pip install .* -c $APP/scripts/d1a-constraints.txt d1a\[serve\] @ git+" "$T/clean" || fail clean "did not install with the tested environment's constraints"
run same FAIL_UV=   # the pin it runs: nothing to install
[ "$(cat "$T/same.status")" = 0 ] && [ -z "$(last same "^uv pip install")" ] && [ "$(readlink "$V/current")" = "${PIN:0:12}-serve-$(CH)" ] || fail same "reinstalled the pin it runs"
rm "$V/${PIN:0:12}-serve-$(CH)/.complete"   # an install that did not finish is installed again (here: to see the cache it uses)
run override FAIL_UV= UV_CACHE_DIR="$T/elsewhere"
[ "$(cat "$T/override.status")" = 0 ] || fail override "did not reinstall"
for case in clean override; do   # every uv call sees the cache: .demo's by default, UV_CACHE_DIR's when it is set
  want="$T/app/.demo/uv-cache"; [ $case = override ] && want="$T/elsewhere"
  calls=$(grep -c "^uv " "$T/$case" || true); seen=$(grep -cF -- " cache=$want" "$T/$case" || true)   # -c prints 0 but exits 1
  [ "$calls" -ge 2 ] && [ "$seen" = "$calls" ] || fail $case "uv did not use the cache $want"
done

printf 'PORT=3999\nLABEL_OUTCOMES=1\nFEEDBACK_LOG=%s\nOUTCOME_CALIBRATOR=%s\nMODEL_RUN=JohnP1/d1a-e4b-mlx-q8@v0.5\n' "$T/log.jsonl" "$T/cal.json" > "$T/app/.demo/mini.env"
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
run promote2 FAIL_UV=   # a reinstall never overwrites the maintainer's settings
! grep -q "config init" "$T/promote2" || fail promote2 "re-created the settings file on reinstall"
printf 'PORT=3999\n' > "$T/app/.demo/mini.env"

# a Mac set up before the rename, its mini.env with the KEV_* names: update (reinstall) renames them in the file, keeps the
# file as it was, and the build and every agent carry the new names only, with the same values
printf 'PORT=3999\nKEV_PORT=8123\nKEV_PREFIX_CACHE=2\nKEV_PREFIX_MAX_TOKENS=1024\nLABEL_OUTCOMES=1\nFEEDBACK_LOG=%s\nOUTCOME_CALIBRATOR=%s\nOPENAI_PORT=1234\n' "$T/log.jsonl" "$T/cal.json" > "$T/app/.demo/mini.env"
run legacy FAIL_UV=
[ "$(cat "$T/legacy.status")" = 0 ] || fail legacy "did not reinstall"
mini_env="$T/app/.demo/mini.env"; agents="$T/home/Library/LaunchAgents"
grep -qx 'MODEL_PORT=8123' "$mini_env" && grep -qx 'MODEL_PREFIX_CACHE=2' "$mini_env" && grep -qx 'MODEL_PREFIX_MAX_TOKENS=1024' "$mini_env" && ! grep -q 'KEV_' "$mini_env" \
  || fail legacy "mini.env was not renamed: $(cat "$mini_env")"
grep -qx 'KEV_PORT=8123' "$mini_env.before-rename" || fail legacy "no copy of mini.env as it was"
grep -qF 'build MODEL_API=http://127.0.0.1:8123 KEV_API=unset' "$T/legacy" || fail legacy "the web build did not get MODEL_API: $(grep '^build' "$T/legacy")"
grep -A1 "<string>--port</string>" "$agents/io.github.jonpol01.d1a-model.plist" | grep -qF "<string>8123</string>" || fail legacy "the model server is not on the port KEV_PORT named"
grep -A1 "<key>D1A_PREFIX_CACHE</key>" "$agents/io.github.jonpol01.d1a-model.plist" | grep -qF "<string>2</string>" || fail legacy "the cache size of KEV_PREFIX_CACHE was lost"
grep -A1 "<key>D1A_PREFIX_MAX_TOKENS</key>" "$agents/io.github.jonpol01.d1a-model.plist" | grep -qF "<string>1024</string>" || fail legacy "the limit of KEV_PREFIX_MAX_TOKENS was lost"
for key in MODEL_API MEDIA_API; do
  grep -A0 "<key>$key</key>" "$agents/io.github.jonpol01.d1a-web.plist" | grep -qF "<string>http://127.0.0.1:8123</string>" || fail legacy "the web agent has no $key for port 8123"
done
for agent in model web openai outcomes promote; do   # every generated agent: no old name left, and every one that names the port names 8123
  [ -f "$agents/io.github.jonpol01.d1a-$agent.plist" ] || fail legacy "no $agent agent"
  ! grep -qi 'kev' "$agents/io.github.jonpol01.d1a-$agent.plist" || fail legacy "the $agent agent still has an old name"
done
grep -qF "<string>http://127.0.0.1:8123/v1/feedback</string>" "$agents/io.github.jonpol01.d1a-outcomes.plist" && grep -qF "<string>http://127.0.0.1:8123</string>" "$agents/io.github.jonpol01.d1a-promote.plist" \
  || fail legacy "the outcomes or promote agent is not on port 8123"
cp "$mini_env" "$T/mini-env-after"; cp "$mini_env.before-rename" "$T/mini-env-copy"
run legacy2 FAIL_UV=   # a second update changes nothing in the file or in the copy
[ "$(cat "$T/legacy2.status")" = 0 ] && ! grep -q 'renamed the old' "$T/legacy2.out" && cmp -s "$mini_env" "$T/mini-env-after" && cmp -s "$mini_env.before-rename" "$T/mini-env-copy" \
  || fail legacy2 "renamed again: $(cat "$T/legacy2.out")"
printf 'PORT=3999\n' > "$T/app/.demo/mini.env"; rm -f "$T/app/.demo/mini.env.before-rename"

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

pin 1111111111111111111111111111111111111111   # a pin not installed yet
run install FAIL_UV=1
[ -n "$(last install "^uv pip install")" ] || fail install "never reached the install"
[ "$(cat "$T/install.status")" != 0 ] || fail install "a failed install exited 0"
[ -z "$(last install "bootout .*/$SERVICE$")" ] || fail install "stopped the services, then the install failed"
pin "$PIN"

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
  [ -f "$T/home/Library/LaunchAgents/$label.plist" ] || fail build "removed $label's agent while going back"
done

# a new pin that fails the smoke test after the stop: back to the venv and the agents that ran before (here with another
# CHAT_CONTEXT in mini.env, so the agents differ too), and the run fails
model="$T/home/Library/LaunchAgents/io.github.jonpol01.d1a-model.plist"; cp "$model" "$T/model-before.plist"
NEW=2222222222222222222222222222222222222222; pin $NEW; printf 'PORT=3999\nCHAT_CONTEXT=1\n' > "$APP/.demo/mini.env"
run rollback FAIL_UV= SMOKE_EXIT=1
[ "$(cat "$T/rollback.status")" != 0 ] || fail rollback "a failed smoke test exited 0"
[ "$(readlink "$V/current")" = "${PIN:0:12}-serve-$(CH)" ] || fail rollback "current is $(readlink "$V/current"), not the venv that ran before"
cmp -s "$model" "$T/model-before.plist" || fail rollback "did not restore the model agent that ran before"
grep -q "back on the version that ran before" "$T/rollback.out" && [ -f "$V/${NEW:0:12}-serve-$(CH)/.complete" ] || fail rollback "did not say it went back"
[ "$(last rollback "bootstrap .*io.github.jonpol01.d1a-model.plist")" -gt "$(last rollback "^npm ci")" ] || fail rollback "left the model server down"
run rollback_dead FAIL_UV= SMOKE_EXIT=1 ANSWER_EXIT=7   # the version before does not answer either: said, with both venvs
grep -q "does not answer either.*${NEW:0:12}-serve-$(CH)" "$T/rollback_dead.out" && [ "$(cat "$T/rollback_dead.status")" != 0 ] || fail rollback_dead "did not say the rollback failed too"
# answers that only differ from the baseline (smoke exit 3): every demo answered, so the new version stays, and the run fails
run moved FAIL_UV= SMOKE_EXIT=3
[ "$(cat "$T/moved.status")" != 0 ] && [ "$(readlink "$V/current")" = "${NEW:0:12}-serve-$(CH)" ] && ! grep -q "going back" "$T/moved.out" \
  || fail moved "rolled back a server that answers every demo"
# a pass keeps current and previous and removes the rest, the old one-venv directory included once it is not previous
run passed FAIL_UV=
[ "$(cat "$T/passed.status")" = 0 ] && [ "$(readlink "$V/previous")" = "${PIN:0:12}-serve-$(CH)" ] && [ ! -e "$APP/.demo/d1a-venv" ] || fail passed "kept the old venv"
pin 3333333333333333333333333333333333333333; run third FAIL_UV=
[ "$(cat "$T/third.status")" = 0 ] && [ "$(readlink "$V/previous")" = "${NEW:0:12}-serve-$(CH)" ] && [ ! -e "$V/${PIN:0:12}-serve-$(CH)" ] && [ -d "$V/${NEW:0:12}-serve-$(CH)" ] \
  || fail third "pruned the wrong venvs: $(ls "$V")"
# install on a Mac that runs it takes the reinstall path: install first, stop after
CMD=install run installed FAIL_UV=
grep -q "already installed here: reinstalling" "$T/installed.out" && [ "$(cat "$T/installed.status")" = 0 ] || fail installed "rebuilt under the running agents"
# a current that is a directory, not a link: refused before anything stops (ln -sfn would put the link inside it)
mv "$V/current" "$T/current-link"; mkdir "$V/current"
run notalink FAIL_UV=
grep -q "is not a link" "$T/notalink.out" && [ -z "$(last notalink "bootout")" ] || fail notalink "went on with a current directory"
rmdir "$V/current"; mv "$T/current-link" "$V/current"
# a changed constraints file (a pin move regenerates it) is a new venv, even for the same pin
was=$(readlink "$V/current"); echo "# changed" >> "$APP/scripts/d1a-constraints.txt"
run constraints FAIL_UV=
[ "$(cat "$T/constraints.status")" = 0 ] && [ -n "$(last constraints "^uv pip install")" ] && [ "$(readlink "$V/current")" != "$was" ] \
  && [ "$(readlink "$V/current")" = "333333333333-serve-$(CH)" ] || fail constraints "kept the venv of the old constraints: $(readlink "$V/current")"
echo "mini.sh reinstall: OK under $(/bin/bash --version | head -1)"
