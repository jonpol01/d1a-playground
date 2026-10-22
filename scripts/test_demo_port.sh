#!/bin/bash
# demo.sh's pick_port, the function itself (read out of demo.sh, so an edit to it is what runs here): a PORT something
# already listens on is refused, so the browser never opens another service's page; a free PORT is used as given; with
# no PORT the first free port of the list is picked. Run by CI's mini-macos job (bash 3.2), and by hand.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; T="$(mktemp -d)"; trap 'kill $SRV $SRV6 2>/dev/null; rm -rf "$T"' EXIT
{ grep -E '^(die|port_busy)\(\)' "$ROOT/demo.sh"; awk '/^pick_port\(\) \{/,/^\}/' "$ROOT/demo.sh"; } > "$T/helpers.sh"
grep -q '^pick_port() {' "$T/helpers.sh" && grep -q '^port_busy()' "$T/helpers.sh" || { echo "demo.sh has no pick_port/port_busy to test"; exit 1; }
fail() { echo "FAIL: $*"; exit 1; }
free_port() { python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])'; }

python3 -c '
import socket, sys, time
s = socket.socket(); s.bind(("127.0.0.1", 0)); s.listen(); print(s.getsockname()[1], flush=True); time.sleep(120)' > "$T/busy" & SRV=$!; disown "$SRV"
for _ in $(seq 50); do [ -s "$T/busy" ] && break; sleep 0.1; done
BUSY="$(cat "$T/busy")"; FREE="$(free_port)"
# a service on ::1 only: the browser's localhost can resolve to it
python3 -c '
import socket, sys, time
s = socket.socket(socket.AF_INET6); s.bind(("::1", 0)); s.listen(); print(s.getsockname()[1], flush=True); time.sleep(120)' > "$T/busy6" & SRV6=$!; disown "$SRV6"
for _ in $(seq 50); do [ -s "$T/busy6" ] && break; sleep 0.1; done
BUSY6="$(cat "$T/busy6")"; [ -n "$BUSY6" ] || fail "could not listen on ::1"

# an occupied PORT is refused, with the error naming it
if out="$(PORT="$BUSY" bash -c ". '$T/helpers.sh'; pick_port" 2>&1)"; then fail "PORT=$BUSY (in use) was accepted: $out"; fi
case "$out" in *"PORT=$BUSY is already in use"*) ;; *) fail "PORT=$BUSY: unexpected message: $out" ;; esac
# so is one in use on ::1 only
if out="$(PORT="$BUSY6" bash -c ". '$T/helpers.sh'; pick_port" 2>&1)"; then fail "PORT=$BUSY6 (in use on ::1) was accepted: $out"; fi
# a free PORT is used as given
out="$(PORT="$FREE" bash -c ". '$T/helpers.sh'; pick_port")" || fail "PORT=$FREE (free) was refused"
[ "$out" = "$FREE" ] || fail "PORT=$FREE: picked $out"
# no PORT: a port of the list that nothing listens on
out="$(PORT= bash -c ". '$T/helpers.sh'; pick_port")" || fail "no PORT: nothing picked"
case " 3001 3011 $(seq -s ' ' 3021 3030) " in *" $out "*) ;; *) fail "no PORT: $out is not in the list" ;; esac
( exec 3<>"/dev/tcp/127.0.0.1/$out" ) 2>/dev/null && fail "no PORT: picked $out, which is in use"
echo "demo.sh pick_port: OK under $(bash --version | head -1)"
