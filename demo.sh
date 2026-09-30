#!/usr/bin/env bash
# Start the D1A playground: a model server (kev.serve with the trained JohnP1/kev-gemma4-e2b checkpoint) and the web app.
# macOS, Linux and WSL. Windows PowerShell: demo.ps1.
#
#   ./demo.sh                      install what is missing, start both, open the browser; Ctrl+C stops both
#   ./demo.sh --no-server          start only the web app, against a Kev server already running on $KEV_PORT
#   ./demo.sh --lmstudio URL       no Kev weights: a prompted Gemma 4 chat model in LM Studio answers instead (NOT Kev)
#             [--lmstudio-model ID]   the LM Studio model id (default gemma-4-e4b-it-mlx)
#   ./demo.sh --no-browser         do not open the browser
#   ./demo.sh stop                 stop what an earlier ./demo.sh started (for example after closing its terminal)
#
# Environment: KEV_PORT (default 8009), PORT (web app; default 3001, then 3011, then 3021-3030).
set -euo pipefail

# The Kev fork (the D1A model server) this demo runs, pinned to a commit so every friend gets the same server.
KEV_REPO="https://github.com/jonpol01/kev"
KEV_SHA="13374b311cde06d09017c7ca61ff884e2fd90df6"
KEV_RUN="JohnP1/kev-gemma4-e2b"
PYTHON_VERSION="3.13"          # torch has no wheels for 3.14 yet; uv downloads 3.13 if it is missing
LMSTUDIO_MODEL_DEFAULT="gemma-4-e4b-it-mlx"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE="$ROOT/.demo"
VENV="$STATE/venv"
KEV_PORT="${KEV_PORT:-8009}"

say()  { printf '%s\n' "$*"; }
warn() { printf 'warning: %s\n' "$*" >&2; }
die()  { printf 'error: %s\n' "$*" >&2; exit 1; }

usage() { sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; }

# ---------------------------------------------------------------- arguments
CMD="start"; NO_SERVER=0; LMSTUDIO=""; LMSTUDIO_MODEL="$LMSTUDIO_MODEL_DEFAULT"; OPEN_BROWSER=1
while [ $# -gt 0 ]; do
  case "$1" in
    start) CMD="start" ;;
    stop) CMD="stop" ;;
    --no-server) NO_SERVER=1 ;;
    --lmstudio) [ $# -ge 2 ] || die "--lmstudio needs a URL, e.g. --lmstudio http://127.0.0.1:1234"; LMSTUDIO="${2%/}"; shift ;;
    --lmstudio=*) LMSTUDIO="${1#*=}"; LMSTUDIO="${LMSTUDIO%/}" ;;
    --lmstudio-model) [ $# -ge 2 ] || die "--lmstudio-model needs a model id"; LMSTUDIO_MODEL="$2"; shift ;;
    --no-browser) OPEN_BROWSER=0 ;;
    -h|--help) usage; exit 0 ;;
    *) usage; die "unknown argument: $1" ;;
  esac
  shift
done
[ -n "$LMSTUDIO" ] && [ "$NO_SERVER" = 1 ] && die "--lmstudio and --no-server do not go together"

# ---------------------------------------------------------------- helpers
port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }     # something accepts connections on 127.0.0.1:$1
kev_up()    { curl -fsS -m 3 "http://127.0.0.1:$KEV_PORT/v1/models" >/dev/null 2>&1; }

pick_port() {
  if [ -n "${PORT:-}" ]; then port_busy "$PORT" && die "PORT=$PORT is already in use"; echo "$PORT"; return; fi
  for p in 3001 3011 $(seq 3021 3030); do port_busy "$p" || { echo "$p"; return; }; done
  die "no free port for the web app among 3001, 3011, 3021-3030; set PORT=<free port>"
}

open_url() {
  [ "$OPEN_BROWSER" = 1 ] || return 0
  if [ "$(uname -s)" = Darwin ]; then open "$1"
  elif grep -qi microsoft /proc/version 2>/dev/null; then
    if command -v wslview >/dev/null; then wslview "$1"; else cmd.exe /c start "" "$1" >/dev/null 2>&1 || true; fi
  elif command -v xdg-open >/dev/null; then xdg-open "$1" >/dev/null 2>&1 || true
  fi
}

stop_pid() {   # TERM, then KILL after 10 s
  local pid="$1"
  kill -0 "$pid" 2>/dev/null || return 0
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || return 0; sleep 0.5; done
  kill -9 "$pid" 2>/dev/null || true
}

stop_all() {
  local f name
  for f in "$STATE"/*.pid; do
    [ -e "$f" ] || continue
    name="$(basename "$f" .pid)"
    stop_pid "$(cat "$f")" && say "stopped $name"
    rm -f "$f"
  done
}

total_mem_gb() {
  if [ "$(uname -s)" = Darwin ]; then echo $(( $(sysctl -n hw.memsize) / 1073741824 ))
  elif [ -r /proc/meminfo ]; then awk '/MemTotal/ {printf "%d", $2 / 1048576}' /proc/meminfo
  else echo 0; fi
}

if [ "$CMD" = stop ]; then
  mkdir -p "$STATE"; stop_all; exit 0
fi

# ---------------------------------------------------------------- prerequisites
missing=0
need() { command -v "$1" >/dev/null 2>&1 || { say "missing: $1  ->  $2"; missing=1; }; }
need git  "install git: https://git-scm.com/downloads (macOS: xcode-select --install)"
need curl "install curl with your package manager (e.g. sudo apt install curl)"
need node "install Node.js 20.9 or newer: https://nodejs.org (or: brew install node / nvm install --lts)"
need npm  "npm comes with Node.js: https://nodejs.org"
if [ "$NO_SERVER" = 0 ]; then need uv "install uv: curl -LsSf https://astral.sh/uv/install.sh | sh   (then open a new terminal)"; fi
[ "$missing" = 0 ] || die "install the missing tools above, then run ./demo.sh again"

node_version="$(node -p 'process.versions.node')"
IFS=. read -r nmaj nmin _ <<<"$node_version"
if [ "$nmaj" -lt 20 ] || { [ "$nmaj" -eq 20 ] && [ "$nmin" -lt 9 ]; }; then
  die "Node.js $node_version is too old; Next.js 16 needs 20.9 or newer (https://nodejs.org, or nvm install --lts)"
fi

mkdir -p "$STATE"
if ls "$STATE"/*.pid >/dev/null 2>&1; then say "cleaning up a previous run"; stop_all; fi

PIDS=()
cleanup() {
  trap - INT TERM EXIT
  say ""; say "stopping..."
  stop_all
}
trap cleanup INT TERM EXIT

# ---------------------------------------------------------------- the Kev server (or the LM Studio bridge)
start_kev() {
  if kev_up; then
    say "A Kev-compatible server is already answering on port $KEV_PORT; using it."
    return
  fi
  port_busy "$KEV_PORT" && die "port $KEV_PORT is taken by something that is not a Kev server; stop it or set KEV_PORT"

  if [ -n "$LMSTUDIO" ]; then
    say "LM Studio mode: answers come from $LMSTUDIO_MODEL, a prompted chat model in LM Studio at $LMSTUDIO."
    say "This is NOT the trained Kev checkpoint: no LoRA, no pointer head, uncalibrated probabilities."
    curl -fsS -m 5 "$LMSTUDIO/v1/models" >"$STATE/lmstudio-models.json" 2>/dev/null \
      || die "LM Studio is not answering at $LMSTUDIO/v1/models (start its server: Developer tab -> Start Server)"
    if ! grep -q "\"$LMSTUDIO_MODEL\"" "$STATE/lmstudio-models.json"; then
      warn "LM Studio does not list $LMSTUDIO_MODEL. Gemma models it has: $(grep -o '"id": *"[^"]*gemma[^"]*"' "$STATE/lmstudio-models.json" | sed 's/.*"\([^"]*\)"$/\1/' | tr '\n' ' ')"
      warn "pass --lmstudio-model <id> to pick one (on Windows and Linux, LM Studio ids have no -mlx suffix)"
    fi
    (cd "$ROOT" && exec uv run --no-project --python "$PYTHON_VERSION" --with fastapi --with uvicorn --with httpx \
        python server/lmstudio_systemone.py --lmstudio "$LMSTUDIO" --model "$LMSTUDIO_MODEL" --port "$KEV_PORT") \
        >"$STATE/kev-server.log" 2>&1 &
  else
    if [ ! -f "$VENV/.kev-$KEV_SHA" ]; then
      say "Installing the Kev server from $KEV_REPO@${KEV_SHA:0:7} into .demo/venv (first run: about 1 GB of Python packages)"
      uv venv --quiet --allow-existing --python "$PYTHON_VERSION" "$VENV"
      # --torch-backend auto picks the CUDA build of torch when an NVIDIA driver is present (PyPI's default is CPU-only on Windows)
      uv pip install --quiet --python "$VENV/bin/python" --torch-backend auto "kev[serve] @ git+$KEV_REPO@$KEV_SHA"
      rm -f "$VENV"/.kev-*; touch "$VENV/.kev-$KEV_SHA"
    fi
    if [ "$(uname -s)" = Darwin ] && [ "$(uname -m)" = arm64 ]; then
      # Cap PyTorch's share of unified memory (both are needed: a high cap below the default low of 1.4 is refused).
      export PYTORCH_MPS_HIGH_WATERMARK_RATIO="${PYTORCH_MPS_HIGH_WATERMARK_RATIO:-0.5}"
      export PYTORCH_MPS_LOW_WATERMARK_RATIO="${PYTORCH_MPS_LOW_WATERMARK_RATIO:-0.4}"
      device="Apple Silicon GPU (MPS)"
    elif command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi >/dev/null 2>&1; then device="NVIDIA GPU (CUDA)"
    else device="CPU (works, but slow: several seconds per request)"; fi
    mem="$(total_mem_gb)"
    if [ "$mem" -gt 0 ] && [ "$mem" -lt 16 ]; then
      warn "this machine has ${mem} GB of memory; the Kev server peaks around 15 GB. If it runs out, use --lmstudio instead."
    fi
    say "Starting the model server (kev.serve): $KEV_RUN on $device, port $KEV_PORT (log: .demo/kev-server.log)"
    say "The first start downloads Gemma 4 E2B (about 10 GB) and the adapter; later starts take about 20 s."
    "$VENV/bin/python" -m kev.serve --run "$KEV_RUN" --port "$KEV_PORT" >"$STATE/kev-server.log" 2>&1 &
  fi
  echo $! >"$STATE/kev-server.pid"; PIDS+=("$!")

  local t0=$SECONDS last=0
  until kev_up; do
    if ! kill -0 "$(cat "$STATE/kev-server.pid")" 2>/dev/null; then
      say "The server exited. Last lines of .demo/kev-server.log:"; tail -n 25 "$STATE/kev-server.log" >&2 || true
      die "the Kev server did not start (see .demo/kev-server.log)"
    fi
    if [ $((SECONDS - last)) -ge 15 ]; then
      last=$SECONDS
      say "  waiting for the server ($((SECONDS - t0)) s): $(tail -c 300 "$STATE/kev-server.log" 2>/dev/null | tr '\r' '\n' | grep -v '^[[:space:]]*$' | tail -n 1 | cut -c1-110)"
    fi
    sleep 1
  done
  say "Server ready on http://127.0.0.1:$KEV_PORT after $((SECONDS - t0)) s."
}

if [ "$NO_SERVER" = 1 ]; then
  kev_up || die "--no-server: nothing answers on http://127.0.0.1:$KEV_PORT/v1/models (start a Kev server there, or drop --no-server)"
  say "Using the Kev server already running on port $KEV_PORT."
else
  start_kev
fi

# ---------------------------------------------------------------- the web app
cd "$ROOT"
if [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  say "Installing the web app's packages (npm ci)"
  npm ci --no-audit --no-fund --loglevel=error
fi
WEB_PORT="$(pick_port)"
say "Starting the web app on port $WEB_PORT (log: .demo/web.log)"
KEV_API="http://127.0.0.1:$KEV_PORT" NEXT_TELEMETRY_DISABLED=1 node node_modules/next/dist/bin/next dev -p "$WEB_PORT" >"$STATE/web.log" 2>&1 &
echo $! >"$STATE/web.pid"; PIDS+=("$!")
for _ in $(seq 1 120); do
  curl -fsS -m 30 -o /dev/null "http://localhost:$WEB_PORT/" 2>/dev/null && break
  kill -0 "$(cat "$STATE/web.pid")" 2>/dev/null || { tail -n 25 "$STATE/web.log" >&2; die "the web app did not start (see .demo/web.log)"; }
  sleep 1
done
curl -fsS -m 5 "http://localhost:$WEB_PORT/kev/v1/models" >/dev/null || warn "the web app cannot reach the Kev server through its /kev proxy"

URL="http://localhost:$WEB_PORT"
say ""
say "D1A playground is running:"
say "  $URL                the nine demos"
say "  $URL/#inbox         jump to one (#routing #guardrails #tools #inbox #rerank #evals #labeling #control #gate)"
say "  http://127.0.0.1:$KEV_PORT/v1/models   the server's model card"
[ -n "$LMSTUDIO" ] && say "  (LM Studio mode: a prompted chat model answers, NOT the trained Kev checkpoint)"
say "Press Ctrl+C to stop (or run ./demo.sh stop from another terminal)."
open_url "$URL"

# Stay in the foreground until either process exits or Ctrl+C.
while :; do
  for pid in "${PIDS[@]}"; do
    kill -0 "$pid" 2>/dev/null || { warn "a process exited; see the logs in .demo/"; exit 1; }
  done
  sleep 2
done
