#!/usr/bin/env bash
# Run the D1A playground as an always-on service on a Mac: the model server and the web app as two user
# LaunchAgents that start at login and restart after a crash.
#
#   ./mini.sh install   first time: install the model server and the app, build, write and load the LaunchAgents
#   ./mini.sh start     load both LaunchAgents
#   ./mini.sh stop      unload both
#   ./mini.sh status    what is running, and whether the two ports answer
#   ./mini.sh update    git pull, reinstall and rebuild, restart
#
# Settings (read by install and update, then kept in .demo/mini.env):
#   KEV_PORT=8009  PORT=3031  HOST=127.0.0.1 (0.0.0.0 to serve the LAN directly)  D1A_BASE_PATH= (e.g. /d1a behind a proxy)
#   PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.7  PYTORCH_MPS_LOW_WATERMARK_RATIO=0.6  (cap on PyTorch's share of unified memory)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
STATE="$ROOT/.demo"
ENVFILE="$STATE/mini.env"
AGENTS="$HOME/Library/LaunchAgents"
LOGS="$HOME/Library/Logs"
MODEL_LABEL="io.github.jonpol01.d1a-model"
WEB_LABEL="io.github.jonpol01.d1a-web"
KEV_RUN="JohnP1/d1a-e2b"
KEV_REPO="https://github.com/jonpol01/kev"
KEV_SHA="$(sed -n 's/^KEV_SHA="\([0-9a-f]*\)".*/\1/p' "$ROOT/demo.sh")"   # the same pinned model server as demo.sh
PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

say() { printf '\033[1m[mini]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[mini] error:\033[0m %s\n' "$*" >&2; exit 1; }

load_env() {
  # shellcheck disable=SC1090
  [ -f "$ENVFILE" ] && . "$ENVFILE"
  KEV_PORT="${KEV_PORT:-8009}"; PORT="${PORT:-3031}"; HOST="${HOST:-127.0.0.1}"; D1A_BASE_PATH="${D1A_BASE_PATH:-}"
  PYTORCH_MPS_HIGH_WATERMARK_RATIO="${PYTORCH_MPS_HIGH_WATERMARK_RATIO:-0.7}"
  PYTORCH_MPS_LOW_WATERMARK_RATIO="${PYTORCH_MPS_LOW_WATERMARK_RATIO:-0.6}"
}

save_env() {
  mkdir -p "$STATE"
  cat >"$ENVFILE" <<EOF
KEV_PORT=$KEV_PORT
PORT=$PORT
HOST=$HOST
D1A_BASE_PATH=$D1A_BASE_PATH
PYTORCH_MPS_HIGH_WATERMARK_RATIO=$PYTORCH_MPS_HIGH_WATERMARK_RATIO
PYTORCH_MPS_LOW_WATERMARK_RATIO=$PYTORCH_MPS_LOW_WATERMARK_RATIO
EOF
}

domain() { if launchctl print "gui/$(id -u)" >/dev/null 2>&1; then echo "gui/$(id -u)"; else echo "user/$(id -u)"; fi; }

install_code() {
  command -v uv >/dev/null || die "uv is missing (brew install uv)"
  command -v node >/dev/null || die "node is missing (brew install node)"
  say "model server: kev[serve] from $KEV_REPO@${KEV_SHA:0:7} into .demo/venv"
  uv venv --quiet --allow-existing --python 3.13 "$STATE/venv"
  uv pip install --quiet --python "$STATE/venv/bin/python" --torch-backend auto "kev[serve] @ git+$KEV_REPO@$KEV_SHA"
  say "web app: npm ci and a production build${D1A_BASE_PATH:+ under $D1A_BASE_PATH}"
  (cd "$ROOT" && npm ci --no-audit --no-fund --loglevel=error && D1A_BASE_PATH="$D1A_BASE_PATH" npm run build >/dev/null)
}

plist() {   # label, then program arguments; environment from the ENV_* variables below
  local label="$1"; shift
  local args="" a; for a in "$@"; do args+="    <string>$a</string>"$'\n'; done
  cat <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array>
$args  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
$ENV_XML  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$LOGS/${label##*.}.log</string>
  <key>StandardErrorPath</key><string>$LOGS/${label##*.}.log</string>
</dict>
</plist>
EOF
}

write_agents() {
  mkdir -p "$AGENTS" "$LOGS"
  local path="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  ENV_XML="    <key>PATH</key><string>$path</string>
    <key>PYTORCH_MPS_HIGH_WATERMARK_RATIO</key><string>$PYTORCH_MPS_HIGH_WATERMARK_RATIO</string>
    <key>PYTORCH_MPS_LOW_WATERMARK_RATIO</key><string>$PYTORCH_MPS_LOW_WATERMARK_RATIO</string>
"
  plist "$MODEL_LABEL" "$STATE/venv/bin/python" -m kev.serve --run "$KEV_RUN" --port "$KEV_PORT" --host 127.0.0.1 >"$AGENTS/$MODEL_LABEL.plist"
  ENV_XML="    <key>PATH</key><string>$path</string>
    <key>NODE_ENV</key><string>production</string>
    <key>KEV_API</key><string>http://127.0.0.1:$KEV_PORT</string>
    <key>D1A_BASE_PATH</key><string>$D1A_BASE_PATH</string>
"   # next start reads next.config.ts again, so the base path must match the build's
  plist "$WEB_LABEL" "$(command -v node)" "$ROOT/node_modules/next/dist/bin/next" start -p "$PORT" -H "$HOST" >"$AGENTS/$WEB_LABEL.plist"
  plutil -lint "$AGENTS/$MODEL_LABEL.plist" "$AGENTS/$WEB_LABEL.plist" >/dev/null
}

start() {
  local d; d="$(domain)"
  for l in "$MODEL_LABEL" "$WEB_LABEL"; do
    launchctl bootout "$d/$l" 2>/dev/null || true
    launchctl bootstrap "$d" "$AGENTS/$l.plist"
  done
  say "started; logs in $LOGS/d1a-model.log and $LOGS/d1a-web.log (the model takes about a minute to load)"
}

stop() {
  local d; d="$(domain)"
  for l in "$WEB_LABEL" "$MODEL_LABEL"; do launchctl bootout "$d/$l" 2>/dev/null && say "stopped $l" || say "$l was not loaded"; done
}

status() {
  local d; d="$(domain)"
  for l in "$MODEL_LABEL" "$WEB_LABEL"; do
    if launchctl print "$d/$l" >/dev/null 2>&1; then
      say "$l: loaded, $(launchctl print "$d/$l" | awk -F'= ' '/^\tstate/ {s=$2} /^\tpid/ {p=$2} END {print s (p ? ", pid " p : "")}')"
    else say "$l: not loaded"; fi
  done
  curl -fsS -m 3 "http://127.0.0.1:$KEV_PORT/v1/models" >/dev/null && say "model server answers on :$KEV_PORT" || say "model server not answering on :$KEV_PORT (still loading?)"
  curl -fsS -m 5 -o /dev/null "http://127.0.0.1:$PORT$D1A_BASE_PATH" && say "web app answers on http://$HOST:$PORT$D1A_BASE_PATH" || say "web app not answering on :$PORT"
}

load_env
case "${1:-status}" in
  install) save_env; install_code; write_agents; start ;;
  start) [ -f "$AGENTS/$MODEL_LABEL.plist" ] || die "run ./mini.sh install first"; start ;;
  stop) stop ;;
  status) status ;;
  update)
    git -C "$ROOT" pull --ff-only
    KEV_SHA="$(sed -n 's/^KEV_SHA="\([0-9a-f]*\)".*/\1/p' "$ROOT/demo.sh")"
    stop; install_code; write_agents; start ;;
  *) die "usage: ./mini.sh {install|start|stop|status|update}" ;;
esac
