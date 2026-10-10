#!/usr/bin/env bash
# Run the D1A playground as an always-on service on a Mac: the model server and the web app as user LaunchAgents that
# start at login and restart after a crash. The model loads when a demo asks and is dropped after IDLE_UNLOAD seconds
# without one; with MEDIA=1 the same model also answers Photo check and Voice triage.
#
#   ./mini.sh install   first time: install the model server and the app, build, write and load the LaunchAgents
#   ./mini.sh start     load both LaunchAgents
#   ./mini.sh stop      unload both
#   ./mini.sh status    what is running, and whether the two ports answer
#   ./mini.sh update    git pull, then reinstall
#   ./mini.sh reinstall install the model server while the old one still serves, then stop, rebuild the app and start;
#                       a step that fails after the stop starts the agents again on whatever is installed (no pull)
#
# Settings (read by install and update, then kept in .demo/mini.env):
#   MODEL_RUN=JohnP1/d1a-e2b-mlx-q8 (Apple Silicon; JohnP1/d1a-e4b-mlx-q8 is more accurate, ~6.5 GB) or JohnP1/d1a-e2b elsewhere
#   KEV_PORT=8009  PORT=3031  HOST=127.0.0.1 (0.0.0.0 to serve the LAN directly)  D1A_BASE_PATH= (e.g. /d1a behind a proxy)
#   PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.7  PYTORCH_MPS_LOW_WATERMARK_RATIO=0.6  (cap on PyTorch's share of unified memory; unused on MLX)
#   KEV_PREFIX_CACHE=4  KEV_PREFIX_MAX_TOKENS=65536  (the model server's cache of long states; lower them to save memory)
#   IDLE_UNLOAD=600 (seconds without a request before the model server frees the model; it loads again in a few seconds
#   on the next one; 0 keeps it loaded)
#   MEDIA=0 (1 = demos 10-11 too: the model server answers photos and voice with the same model, through Gemma 4's vision
#   and audio encoders, ~1 GB more while loaded; MODEL_RUN must carry them, e.g. JohnP1/d1a-e4b-mlx-q8@v0.3)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
STATE="$ROOT/.demo"
ENVFILE="$STATE/mini.env"
AGENTS="$HOME/Library/LaunchAgents"
LOGS="$HOME/Library/Logs"
MODEL_LABEL="io.github.jonpol01.d1a-model"
MEDIA_LABEL="io.github.jonpol01.d1a-media"   # the separate media server older versions ran; removed on install
WEB_LABEL="io.github.jonpol01.d1a-web"
OUTCOMES_LABEL="io.github.jonpol01.d1a-outcomes"   # LABEL_OUTCOMES=1: scripts/pr_outcomes.py every 15 minutes
PROMOTE_LABEL="io.github.jonpol01.d1a-promote"     # LABEL_OUTCOMES=1 and OUTCOME_CALIBRATOR: d1a.learning.feedback promote daily at 04:00
# the default model: the MLX 8-bit build on Apple Silicon (4.2 GB, parity-checked), the PyTorch checkpoint elsewhere
if [ "$(uname -sm)" = "Darwin arm64" ]; then DEFAULT_MODEL_RUN="JohnP1/d1a-e2b-mlx-q8"; else DEFAULT_MODEL_RUN="JohnP1/d1a-e2b"; fi
D1A_REPO="https://github.com/jonpol01/d1a"
D1A_SHA="2a90e61f5a58bcbfbbcdfdfa34870b20b027b94f"   # the D1A model server this playground is tested against
PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

say() { printf '\033[1m[mini]\033[0m %s\n' "$*"; }
die() { printf '\033[31m[mini] error:\033[0m %s\n' "$*" >&2; exit 1; }

load_env() {
  # shellcheck disable=SC1090
  [ -f "$ENVFILE" ] && . "$ENVFILE"
  MODEL_RUN="${MODEL_RUN:-$DEFAULT_MODEL_RUN}"; KEV_PORT="${KEV_PORT:-8009}"; PORT="${PORT:-3031}"; HOST="${HOST:-127.0.0.1}"; D1A_BASE_PATH="${D1A_BASE_PATH:-}"
  PYTORCH_MPS_HIGH_WATERMARK_RATIO="${PYTORCH_MPS_HIGH_WATERMARK_RATIO:-0.7}"
  PYTORCH_MPS_LOW_WATERMARK_RATIO="${PYTORCH_MPS_LOW_WATERMARK_RATIO:-0.6}"
  KEV_PREFIX_CACHE="${KEV_PREFIX_CACHE:-4}"; KEV_PREFIX_MAX_TOKENS="${KEV_PREFIX_MAX_TOKENS:-65536}"
  MEDIA="${MEDIA:-0}"; IDLE_UNLOAD="${IDLE_UNLOAD:-600}"
  FEEDBACK_LOG="${FEEDBACK_LOG:-}"; OUTCOME_CALIBRATOR="${OUTCOME_CALIBRATOR:-}"; LABEL_OUTCOMES="${LABEL_OUTCOMES:-0}"
}

save_env() {
  mkdir -p "$STATE"
  cat >"$ENVFILE" <<EOF
MODEL_RUN=$MODEL_RUN
KEV_PORT=$KEV_PORT
PORT=$PORT
HOST=$HOST
D1A_BASE_PATH=$D1A_BASE_PATH
PYTORCH_MPS_HIGH_WATERMARK_RATIO=$PYTORCH_MPS_HIGH_WATERMARK_RATIO
PYTORCH_MPS_LOW_WATERMARK_RATIO=$PYTORCH_MPS_LOW_WATERMARK_RATIO
KEV_PREFIX_CACHE=$KEV_PREFIX_CACHE
KEV_PREFIX_MAX_TOKENS=$KEV_PREFIX_MAX_TOKENS
MEDIA=$MEDIA
IDLE_UNLOAD=$IDLE_UNLOAD
FEEDBACK_LOG=$FEEDBACK_LOG
OUTCOME_CALIBRATOR=$OUTCOME_CALIBRATOR
LABEL_OUTCOMES=$LABEL_OUTCOMES
EOF
}

domain() { if launchctl print "gui/$(id -u)" >/dev/null 2>&1; then echo "gui/$(id -u)"; else echo "user/$(id -u)"; fi; }

install_server() {   # reinstall runs it before stop: a failed download or install leaves the old server serving
  [ ! -f "$HOME/d1a-guard/preflight.sh" ] || { . "$HOME/d1a-guard/preflight.sh"; d1a_preflight mini-install 2 3 || die "preflight refused: free must cover the ~2 GB install + 5 GB headroom (line above)"; }
  command -v uv >/dev/null || die "uv is missing (brew install uv)"
  # uv's cache under .demo, which this user owns, unless UV_CACHE_DIR says otherwise: a global ~/.cache/uv that a `sudo`
  # run left owned by root failed the Mac mini's install (#33)
  : "${UV_CACHE_DIR:=$STATE/uv-cache}"; export UV_CACHE_DIR
  command -v node >/dev/null || die "node is missing (brew install node)"
  local extras="serve"; [ "$MEDIA" = 1 ] && extras="serve,media"
  say "model server: d1a[$extras] from $D1A_REPO@${D1A_SHA:0:7} into .demo/d1a-venv ($MODEL_RUN)"
  uv venv --quiet --allow-existing --python 3.12 "$STATE/d1a-venv"
  uv pip install --quiet --python "$STATE/d1a-venv/bin/python" --torch-backend auto "d1a[$extras] @ git+$D1A_REPO@$D1A_SHA"
}

build_web() {   # after stop: npm ci and next build replace the files the running web app serves from
  say "web app: npm ci and a production build${D1A_BASE_PATH:+ under $D1A_BASE_PATH}"
  # next build bakes the /kev and /media proxy targets into the build; next start does not read them again
  (cd "$ROOT" && npm ci --no-audit --no-fund --loglevel=error && D1A_BASE_PATH="$D1A_BASE_PATH" KEV_API="http://127.0.0.1:$KEV_PORT" \
    MEDIA_API="http://127.0.0.1:$KEV_PORT" npm run build >/dev/null)
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
    <key>D1A_PREFIX_CACHE</key><string>$KEV_PREFIX_CACHE</string>
    <key>D1A_PREFIX_MAX_TOKENS</key><string>$KEV_PREFIX_MAX_TOKENS</string>
"
  # self-learning (d1a.learning.feedback): log every decision and take outcomes at POST /v1/feedback; apply a fitted calibrator
  [ -n "$FEEDBACK_LOG" ] && ENV_XML+="    <key>D1A_FEEDBACK_LOG</key><string>$FEEDBACK_LOG</string>
"
  [ -n "$OUTCOME_CALIBRATOR" ] && ENV_XML+="    <key>D1A_OUTCOME_CALIBRATOR</key><string>$OUTCOME_CALIBRATOR</string>
"
  plist "$MODEL_LABEL" "$STATE/d1a-venv/bin/python" -m d1a.serving.serve --run "$MODEL_RUN" --port "$KEV_PORT" --host 127.0.0.1 --idle-unload "$IDLE_UNLOAD" >"$AGENTS/$MODEL_LABEL.plist"
  launchctl bootout "$(domain)/$MEDIA_LABEL" 2>/dev/null || true; rm -f "$AGENTS/$MEDIA_LABEL.plist"   # photos and voice now go to the model server
  ENV_XML="    <key>PATH</key><string>$path</string>
    <key>NODE_ENV</key><string>production</string>
    <key>KEV_API</key><string>http://127.0.0.1:$KEV_PORT</string>
    <key>MEDIA_API</key><string>http://127.0.0.1:$KEV_PORT</string>
    <key>D1A_BASE_PATH</key><string>$D1A_BASE_PATH</string>
"   # next start reads next.config.ts again, so the base path must match the build's
  # the PR label check (/review, d1a-playground#29) reads the decision log; off unless the labeler's outcomes are on
  [ "$LABEL_OUTCOMES" = 1 ] && [ -n "$FEEDBACK_LOG" ] && ENV_XML+="    <key>REVIEW_FEEDBACK_LOG</key><string>$FEEDBACK_LOG</string>
"
  plist "$WEB_LABEL" "$(command -v node)" "$ROOT/node_modules/next/dist/bin/next" start -p "$PORT" -H "$HOST" >"$AGENTS/$WEB_LABEL.plist"
  plutil -lint "$AGENTS/$MODEL_LABEL.plist" "$AGENTS/$WEB_LABEL.plist" >/dev/null
  if [ "$LABEL_OUTCOMES" = 1 ]; then
    [ -n "$FEEDBACK_LOG" ] || die "LABEL_OUTCOMES=1 needs FEEDBACK_LOG: the outcomes go to the model server's decision log"
    # the PR and issue labeler's outcomes (review bot and human label changes) posted to /v1/feedback; runs at load, then every
    # 900 s. --log: the issue labeler's calls are only in the decision log
    cat >"$AGENTS/$OUTCOMES_LABEL.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$OUTCOMES_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$STATE/d1a-venv/bin/python</string>
    <string>$ROOT/scripts/pr_outcomes.py</string>
    <string>--feedback</string>
    <string>http://127.0.0.1:$KEV_PORT/v1/feedback</string>
    <string>--log</string>
    <string>$FEEDBACK_LOG</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$path</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>900</integer>
  <key>StandardOutPath</key><string>$LOGS/d1a-outcomes.log</string>
  <key>StandardErrorPath</key><string>$LOGS/d1a-outcomes.log</string>
</dict>
</plist>
EOF
    plutil -lint "$AGENTS/$OUTCOMES_LABEL.plist" >/dev/null
  else
    launchctl bootout "$(domain)/$OUTCOMES_LABEL" 2>/dev/null || true; rm -f "$AGENTS/$OUTCOMES_LABEL.plist"
  fi
  if [ "$LABEL_OUTCOMES" = 1 ] && [ -n "$OUTCOME_CALIBRATOR" ]; then
    # the promotion gate on the live decision log (d1a.learning.feedback promote, d1a#148): daily at 04:00 it fits a calibrator on
    # the outcomes so far and writes OUTCOME_CALIBRATOR only for the questions that pass; the server picks the file up
    # without a restart. Nothing else ever writes that file. --run: only the decisions MODEL_RUN made (d1a#186), since a
    # calibrator corrects one model's probabilities and the log keeps every model's
    cat >"$AGENTS/$PROMOTE_LABEL.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$PROMOTE_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$STATE/d1a-venv/bin/python</string>
    <string>-m</string>
    <string>d1a.learning.feedback</string>
    <string>promote</string>
    <string>$FEEDBACK_LOG</string>
    <string>--calibrator</string>
    <string>$OUTCOME_CALIBRATOR</string>
    <string>--run</string>
    <string>$MODEL_RUN</string>
  </array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$path</string>
  </dict>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>4</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>StandardOutPath</key><string>$LOGS/d1a-promote.log</string>
  <key>StandardErrorPath</key><string>$LOGS/d1a-promote.log</string>
</dict>
</plist>
EOF
    plutil -lint "$AGENTS/$PROMOTE_LABEL.plist" >/dev/null
  else
    launchctl bootout "$(domain)/$PROMOTE_LABEL" 2>/dev/null || true; rm -f "$AGENTS/$PROMOTE_LABEL.plist"
  fi
}

labels() {   # the agents this machine runs, in start order
  echo "$MODEL_LABEL"; echo "$WEB_LABEL"
  [ -f "$AGENTS/$OUTCOMES_LABEL.plist" ] && echo "$OUTCOMES_LABEL"
  [ -f "$AGENTS/$PROMOTE_LABEL.plist" ] && echo "$PROMOTE_LABEL"
  return 0
}

start() {
  local d; d="$(domain)"
  for l in $(labels); do
    launchctl bootout "$d/$l" 2>/dev/null || true
    launchctl bootstrap "$d" "$AGENTS/$l.plist"
    [ "$l" = "$PROMOTE_LABEL" ] && continue   # a calendar job: it runs at 04:00, not at start
    launchctl kickstart "$d/$l"   # a bootstrap right after a bootout can leave the agent loaded but not running
  done
  say "started; logs in $LOGS/d1a-model.log and $LOGS/d1a-web.log (the model takes a minute or two to load the first time)"
}
smoke() {   # every demo's examples through the web app, checked against scripts/demo-baseline.json (scripts/demo_smoke.mjs)
  local url="http://127.0.0.1:$PORT$D1A_BASE_PATH" n=0
  until curl -fsS -m 5 -o /dev/null "$url/kev/v1/models"; do n=$((n + 1)); [ $n -gt 120 ] && die "the web app or the model server did not come up; see $LOGS"; sleep 5; done
  local media=""; [ "$MEDIA" = 1 ] || media="--no-media"   # a string, not an array: bash 3.2 under set -u calls an empty array unbound
  node "$ROOT/scripts/demo_smoke.mjs" "$url" $media || die "demo smoke test FAILED: a demo no longer answers, or answers differently (scripts/demo_smoke.mjs)"
}

stop() {
  local d; d="$(domain)"
  for l in "$PROMOTE_LABEL" "$OUTCOMES_LABEL" "$WEB_LABEL" "$MEDIA_LABEL" "$MODEL_LABEL"; do launchctl bootout "$d/$l" 2>/dev/null && say "stopped $l" || say "$l was not loaded"; done
}

restart_after_failure() {   # the EXIT trap between reinstall's stop and start: a down model server also stops the PR labeler
  local status=$?
  say "a step after the stop failed (exit $status): starting the agents again on whatever is installed"
  start || true
  exit "$status"
}

status() {
  local d; d="$(domain)"
  for l in $(labels); do
    if launchctl print "$d/$l" >/dev/null 2>&1; then
      say "$l: loaded, $(launchctl print "$d/$l" | awk -F'= ' '/^\tstate/ {s=$2} /^\tpid/ {p=$2} END {print s (p ? ", pid " p : "")}')"
    else say "$l: not loaded"; fi
  done
  curl -fsS -m 3 "http://127.0.0.1:$KEV_PORT/v1/models" >/dev/null && say "model server answers on :$KEV_PORT" || say "model server not answering on :$KEV_PORT (still loading?)"
  curl -fsS -m 3 "http://127.0.0.1:$KEV_PORT/v1/models" 2>/dev/null | grep -q '"loaded":true' && say "model in memory" || say "model not in memory (it loads on the next request)"
  curl -fsS -m 5 -o /dev/null "http://127.0.0.1:$PORT$D1A_BASE_PATH" && say "web app answers on http://$HOST:$PORT$D1A_BASE_PATH" || say "web app not answering on :$PORT"
}

load_env
case "${1:-status}" in
  install) save_env; install_server; build_web; write_agents; start; smoke ;;
  start) [ -f "$AGENTS/$MODEL_LABEL.plist" ] || die "run ./mini.sh install first"; start ;;
  stop) stop ;;
  status) status ;;
  update)
    git -C "$ROOT" pull --ff-only
    exec "$ROOT/mini.sh" reinstall ;;   # the pulled script, not the functions this process read before the pull
  reinstall)
    install_server; write_agents; stop
    trap restart_after_failure EXIT; build_web; start; trap - EXIT
    smoke ;;
  smoke) smoke ;;
  *) die "usage: ./mini.sh {install|start|stop|status|update|reinstall|smoke}" ;;
esac
