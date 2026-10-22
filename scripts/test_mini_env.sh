#!/bin/bash
# mini.sh's .demo/mini.env handling, the functions themselves (read out of mini.sh): save_env shell-quotes every value, so
# a space or a $( in one reads back as itself and never runs; the file wins over a setting given on the command line,
# and says so when it ignores one; a setting the file leaves out comes from the command line; an older unquoted file
# still loads. Run by CI's Linux and mini-macos (bash 3.2) jobs, and by hand.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
{ grep -E '^say\(\)' "$ROOT/mini.sh"
  awk '/^ENV_KEYS=/ {on=1} on {print} on && /"$/ {exit}' "$ROOT/mini.sh"
  for f in load_env save_env; do awk -v f="$f" '$0 ~ "^"f"\\(\\) \\{" {on=1} on {print} on && /^\}/ {exit}' "$ROOT/mini.sh"; done; } > "$T/env.sh"
for f in load_env save_env; do grep -q "^$f() {" "$T/env.sh" || { echo "FAIL: mini.sh has no $f"; exit 1; }; done
fail() { echo "FAIL: $*"; exit 1; }
mini() { (cd "$T" && env "$@" bash -c 'set -euo pipefail; STATE="$PWD/state"; ENVFILE="$STATE/mini.env"; DEFAULT_MODEL_RUN=default/run; . ./env.sh; '"$SCRIPT") 2>&1; }

# a value with a space and one with a command substitution survive a save and a load, and nothing runs
SCRIPT='load_env; save_env' mini EMBED_GGUF="/models/my models/nomic.gguf" EMBED_REF="\$(touch $T/pwned)" D1A_BASE_PATH=/d1a >/dev/null
SCRIPT='load_env; printf "%s|%s|%s|%s\n" "$EMBED_GGUF" "$EMBED_REF" "$D1A_BASE_PATH" "$MODEL_RUN"' mini > "$T/out" \
  || fail "the saved mini.env did not load: $(cat "$T/out")"
[ "$(cat "$T/out")" = "/models/my models/nomic.gguf|\$(touch $T/pwned)|/d1a|default/run" ] || fail "values changed in a save and load: $(cat "$T/out")"
[ ! -e "$T/pwned" ] || fail "loading mini.env ran a command a value held"
[ "$(grep -c '=' "$T/state/mini.env")" = "$(echo $(awk '/^ENV_KEYS=/ {on=1} on {print} on && /"$/ {exit}' "$ROOT/mini.sh" | tr -d '"' | sed 's/^ENV_KEYS=//') | wc -w | tr -d ' ')" ] \
  || fail "mini.env does not hold one line per ENV_KEYS setting"

# the file wins over the command line, and says so; the same value says nothing
out="$(SCRIPT='load_env; echo "D1A_BASE_PATH=$D1A_BASE_PATH"' mini D1A_BASE_PATH=/other)"
case "$out" in *"D1A_BASE_PATH=/other from the command line is ignored"*"D1A_BASE_PATH=/d1a") ;; *) fail "an ignored override went unsaid or won: $out" ;; esac
out="$(SCRIPT='load_env' mini D1A_BASE_PATH=/d1a)"; [ -z "$out" ] || fail "a command-line value equal to the file's was reported: $out"

# a setting the file leaves out comes from the command line; an older, unquoted file still loads
printf 'PORT=3032\nD1A_BASE_PATH=/d1a\n' > "$T/state/mini.env"
out="$(SCRIPT='load_env; echo "$PORT $CHAT_CONTEXT $D1A_BASE_PATH"' mini CHAT_CONTEXT=32768)"
[ "$out" = "3032 32768 /d1a" ] || fail "an older file with a command-line setting it lacks: $out"
echo "mini.sh mini.env: OK under $(bash --version | head -1)"
