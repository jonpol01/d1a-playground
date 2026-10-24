#!/bin/bash
# mini.sh's .demo/mini.env handling, the functions themselves (read out of mini.sh): save_env shell-quotes every value, so
# a space or a $( in one reads back as itself and never runs; the file wins over a setting given on the command line,
# and says so when it ignores one; a setting the file leaves out comes from the command line; an older unquoted file
# still loads. The settings' old names (KEV_PORT, KEV_PREFIX_CACHE, KEV_PREFIX_MAX_TOKENS) still work: alone they are
# read, the new name wins over the old, a file that still has them is the record for the new names, and migrate_env
# renames them in the file (values as they were, a copy kept once, nothing more on a second run). Run by CI's Linux and
# mini-macos (bash 3.2) jobs, and by hand.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT
{ grep -E '^(say\(\)|OLD_NAMES=)' "$ROOT/mini.sh"
  awk '/^ENV_KEYS=/ {on=1} on {print} on && /"$/ {exit}' "$ROOT/mini.sh"
  for f in has_old_names rename_old_lines migrate_env load_env save_env; do awk -v f="$f" '$0 ~ "^"f"\\(\\) \\{" {on=1} on {print} on && /^\}/ {exit}' "$ROOT/mini.sh"; done; } > "$T/env.sh"
for f in has_old_names rename_old_lines migrate_env load_env save_env; do grep -q "^$f() {" "$T/env.sh" || { echo "FAIL: mini.sh has no $f"; exit 1; }; done
grep -q '^OLD_NAMES=' "$T/env.sh" || { echo "FAIL: mini.sh has no OLD_NAMES"; exit 1; }
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

# the old names, given alone on the command line (or in the environment), are honoured, and said once; the new name wins
rm -f "$T/state/mini.env"
out="$(SCRIPT='load_env; echo "$MODEL_PORT $MODEL_PREFIX_CACHE $MODEL_PREFIX_MAX_TOKENS"' mini KEV_PORT=9100 KEV_PREFIX_CACHE=2 KEV_PREFIX_MAX_TOKENS=1024)"
case "$out" in *"KEV_PORT is the old name of MODEL_PORT"*"KEV_PREFIX_CACHE is the old name of MODEL_PREFIX_CACHE"*"9100 2 1024") ;; *) fail "old names alone: $out" ;; esac
out="$(SCRIPT='load_env; echo "$MODEL_PORT"' mini KEV_PORT=9100 MODEL_PORT=9200)"
[ "$out" = 9200 ] || fail "MODEL_PORT did not win over KEV_PORT: $out"
out="$(SCRIPT='load_env; echo "$MODEL_PORT"' mini)"; [ "$out" = 8009 ] || fail "no port set: $out"

# a file that still has an old name is the record for the new one: read as renamed, a command-line value it contradicts is
# ignored (under the name it was given by), an equal one is not reported, and loading does not touch the file
printf 'MODEL_RUN=a/b\nKEV_PORT=8123\nPORT=3032\nKEV_PREFIX_CACHE=7\n' > "$T/state/mini.env"
out="$(SCRIPT='load_env; echo "$MODEL_PORT $MODEL_PREFIX_CACHE $MODEL_PREFIX_MAX_TOKENS $PORT"' mini)"
case "$out" in *"still has the old KEV_* names"*"8123 7 65536 3032") ;; *) fail "a file with old names was not read as the record: $out" ;; esac
for given in MODEL_PORT KEV_PORT; do
  out="$(SCRIPT='load_env; echo "$MODEL_PORT"' mini "$given=9000")"
  case "$out" in *"warning: $given=9000 from the command line is ignored"*"sets MODEL_PORT=8123"*8123) ;; *) fail "$given=9000 beat or went unsaid against a file with KEV_PORT: $out" ;; esac
  out="$(SCRIPT='load_env' mini "$given=8123")"
  case "$out" in *"ignored"*) fail "$given equal to the file's was reported: $out" ;; esac
done
[ "$(cat "$T/state/mini.env")" = "$(printf 'MODEL_RUN=a/b\nKEV_PORT=8123\nPORT=3032\nKEV_PREFIX_CACHE=7')" ] || fail "load_env rewrote mini.env"

# migrate_env: KEV_X=value becomes MODEL_X=value, the value byte for byte; a KEV_X line is dropped when MODEL_X has one (before
# or after it); other lines, a name that only starts like an old one included, stay; the first rewrite keeps a copy
NASTY="/m dir/a \$(touch $T/pwned) \"q\" 's' \\ \\\\ =x  日本  "
{ printf 'MODEL_RUN=run\nKEV_PORT=8123\n'
  printf 'KEV_PREFIX_CACHE=%q\n' "$NASTY"
  printf 'KEV_PREFIX_MAX_TOKENS=5\nMODEL_PREFIX_MAX_TOKENS=6\nKEV_PORTAL=3\nEMBED_GGUF=%q\n' "$NASTY"; } > "$T/state/mini.env"
cp "$T/state/mini.env" "$T/before"
out="$(SCRIPT='migrate_env' mini)"
case "$out" in *"renamed the old KEV_* settings"*) ;; *) fail "migrate_env said nothing: $out" ;; esac
{ printf 'MODEL_RUN=run\nMODEL_PORT=8123\n'
  printf 'MODEL_PREFIX_CACHE=%q\n' "$NASTY"
  printf 'MODEL_PREFIX_MAX_TOKENS=6\nKEV_PORTAL=3\nEMBED_GGUF=%q\n' "$NASTY"; } > "$T/want"
cmp -s "$T/state/mini.env" "$T/want" || fail "the migrated mini.env differs from what it should be: $(diff "$T/want" "$T/state/mini.env")"
cmp -s "$T/state/mini.env.before-rename" "$T/before" || fail "the copy is not the file as it was"
[ ! -e "$T/pwned" ] || fail "migrating ran a command a value held"
# the migrated file is the record, with no note; a second run changes nothing and says nothing
SCRIPT='load_env; printf "%s|%s|%s|%s" "$MODEL_PORT" "$MODEL_PREFIX_CACHE" "$MODEL_PREFIX_MAX_TOKENS" "$EMBED_GGUF"' mini > "$T/out" || fail "the migrated file did not load: $(cat "$T/out")"
[ "$(cat "$T/out")" = "8123|$NASTY|6|$NASTY" ] || fail "the migrated file did not load as the record, values as they were: $(cat "$T/out")"
cp "$T/state/mini.env" "$T/after"; out="$(SCRIPT='migrate_env' mini)"
[ -z "$out" ] && cmp -s "$T/state/mini.env" "$T/after" && cmp -s "$T/state/mini.env.before-rename" "$T/before" || fail "migrate_env is not idempotent: $out"
# the copy is kept once: old names that show up later are renamed, and the copy of the first rewrite stays
printf 'MODEL_RUN=late\nKEV_PREFIX_CACHE=1\nKEV_PORT=2\n' > "$T/state/mini.env"
SCRIPT='migrate_env' mini >/dev/null
[ "$(cat "$T/state/mini.env")" = "$(printf 'MODEL_RUN=late\nMODEL_PREFIX_CACHE=1\nMODEL_PORT=2')" ] || fail "a later old name was not migrated: $(cat "$T/state/mini.env")"
cmp -s "$T/state/mini.env.before-rename" "$T/before" || fail "the copy of the first rewrite was overwritten"
# a twin before the old line, and a file whose last line has no newline
rm -f "$T/state/mini.env.before-rename"; printf 'MODEL_PORT=7\nKEV_PORT=8\nKEV_PREFIX_CACHE=9' > "$T/state/mini.env"
SCRIPT='migrate_env' mini >/dev/null
[ "$(cat "$T/state/mini.env")" = "$(printf 'MODEL_PORT=7\nMODEL_PREFIX_CACHE=9')" ] || fail "a twin before the old line, or a last line without a newline: $(cat "$T/state/mini.env")"
rm -f "$T/state/mini.env"; out="$(SCRIPT='migrate_env' mini)"; [ -z "$out" ] && [ ! -e "$T/state/mini.env" ] || fail "migrate_env made a file out of nothing"
echo "mini.sh mini.env: OK under $(bash --version | head -1)"
