#!/usr/bin/env bash
# One command after git clone: install, start FreeTrial Terminator, open a tunnel.
set -euo pipefail
set -m

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PORT=47231
RUN_TEST=0
NO_TUNNEL=0
SERVER_PID=""
TUNNEL_PID=""
SERVER_LOG=""
TUNNEL_LOG=""
CLEANED=0

usage() {
  cat <<EOF
Usage: ./start.sh [--test] [--no-tunnel]

  --test       Run npm test before the server starts.
  --no-tunnel  Do not open a public HTTPS tunnel.
  -h, --help   Show this help.

npm run go is the same command. Pass flags after --, for example:
  npm run go -- --test
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --test) RUN_TEST=1 ;;
    --no-tunnel) NO_TUNNEL=1 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

fail_node() {
  echo ""
  echo "Node.js 20 or newer is required."
  echo "Install it from https://nodejs.org/ (the Current or LTS build is fine),"
  echo "or with your system package manager, then run ./start.sh again."
  exit 1
}

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed, or it is not on your PATH."
  fail_node
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not installed. It ships with Node.js 20."
  fail_node
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || true)"
if [[ ! "$NODE_MAJOR" =~ ^[0-9]+$ ]] || (( NODE_MAJOR < 20 )); then
  echo "Found Node $(node -v 2>/dev/null || echo unknown)."
  echo "FreeTrial Terminator needs Node.js 20 or newer."
  fail_node
fi

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

LOCK_STAMP="node_modules/.package-lock.sha256"
if [[ ! -f package-lock.json ]]; then
  echo "package-lock.json is missing. Run this script from a full clone of the repo."
  exit 1
fi
LOCK_HASH="$(hash_file package-lock.json)"
if [[ ! -d node_modules ]] || [[ ! -f "$LOCK_STAMP" ]] || [[ "$(cat "$LOCK_STAMP")" != "$LOCK_HASH" ]]; then
  echo "Installing dependencies (node_modules is missing or package-lock.json changed)."
  npm install
  # npm install can rewrite the lockfile, so stamp the hash that is on disk now.
  LOCK_HASH="$(hash_file package-lock.json)"
  printf '%s\n' "$LOCK_HASH" > "$LOCK_STAMP"
else
  echo "Dependencies are already installed."
fi

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env from .env.example. Demo mode is on. No keys are required."
else
  echo "Using the existing .env file."
fi

env_value() {
  local key="$1"
  local line=""
  line="$(grep -E "^${key}=" .env 2>/dev/null | tail -n 1 || true)"
  local value="${line#*=}"
  value="$(printf '%s' "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  local first=""
  local last=""
  if [[ ${#value} -ge 2 ]]; then
    first="${value:0:1}"
    last="${value:$((${#value} - 1)):1}"
    if [[ "$first" == "$last" && ( "$first" == '"' || "$first" == "'" ) ]]; then
      value="${value:1:$((${#value} - 2))}"
    fi
  fi
  printf '%s' "$value"
}

GMAIL_READY=0
GOOGLE_ID="$(env_value GOOGLE_CLIENT_ID)"
GOOGLE_SECRET="$(env_value GOOGLE_CLIENT_SECRET)"
if [[ -n "$GOOGLE_ID" && -n "$GOOGLE_SECRET" ]]; then
  GMAIL_READY=1
fi

if [[ "$RUN_TEST" -eq 1 ]]; then
  echo "Running npm test."
  npm test
fi

if curl -fsS -o /dev/null --max-time 1 "http://127.0.0.1:${PORT}/" 2>/dev/null; then
  echo "Port ${PORT} is already in use. Stop the other process, then run ./start.sh again."
  exit 1
fi

SERVER_LOG="$(mktemp "${TMPDIR:-/tmp}/freetrial-server.XXXXXX")"
TUNNEL_LOG="$(mktemp "${TMPDIR:-/tmp}/freetrial-tunnel.XXXXXX")"

stop_pid() {
  local pid="${1:-}"
  if [[ -z "$pid" ]]; then
    return 0
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    return 0
  fi
  kill -TERM -"$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  local _i
  for _i in 1 2 3 4 5; do
    if ! kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    sleep 0.2
  done
  kill -KILL -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
}

cleanup() {
  if [[ "$CLEANED" -eq 1 ]]; then
    return 0
  fi
  CLEANED=1
  trap - INT TERM EXIT
  stop_pid "$TUNNEL_PID"
  stop_pid "$SERVER_PID"
  if [[ -n "$SERVER_LOG" ]]; then
    rm -f "$SERVER_LOG"
  fi
  if [[ -n "$TUNNEL_LOG" ]]; then
    rm -f "$TUNNEL_LOG"
  fi
}

on_signal() {
  echo ""
  echo "Stopping the server and the tunnel."
  cleanup
  exit 130
}

trap on_signal INT TERM
trap cleanup EXIT

export PORT
echo "Starting the server on port ${PORT}."
npm start >"$SERVER_LOG" 2>&1 &
SERVER_PID="$!"

ready=0
for _ in $(seq 1 50); do
  if curl -fsS -o /dev/null --max-time 1 "http://127.0.0.1:${PORT}/preview" 2>/dev/null; then
    ready=1
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "The server exited before it was ready."
    echo "----- server log -----"
    cat "$SERVER_LOG" || true
    exit 1
  fi
  sleep 0.2
done

if [[ "$ready" -ne 1 ]]; then
  echo "The server did not answer on port ${PORT}."
  echo "----- server log -----"
  cat "$SERVER_LOG" || true
  exit 1
fi

print_install_help() {
  cat <<EOF

No tunnel tool is available, so ChatGPT cannot reach this machine yet.
Install one, then run ./start.sh again:

  cloudflared (preferred, no account for a quick tunnel)
    macOS: brew install cloudflared
    https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

  or, with Node already installed:
    npx --yes cloudflared tunnel --url http://127.0.0.1:${PORT}

  ngrok
    https://ngrok.com/download
    ngrok http ${PORT}
EOF
}

extract_tunnel_url() {
  awk 'match($0, /https:\/\/[A-Za-z0-9.-]+\.(trycloudflare\.com|ngrok-free\.app|ngrok\.app|ngrok\.io)/) { print substr($0, RSTART, RLENGTH); exit }' "$TUNNEL_LOG" 2>/dev/null || true
}

start_cloudflared() {
  local bin="$1"
  echo "Opening a Cloudflare quick tunnel (no account)."
  "$bin" tunnel --url "http://127.0.0.1:${PORT}" >"$TUNNEL_LOG" 2>&1 &
  TUNNEL_PID="$!"
}

start_npx_cloudflared() {
  echo "cloudflared is not installed. Using npx for a quick tunnel (no account)."
  npx --yes cloudflared tunnel --url "http://127.0.0.1:${PORT}" >"$TUNNEL_LOG" 2>&1 &
  TUNNEL_PID="$!"
}

start_ngrok() {
  echo "Opening an ngrok tunnel."
  : >"$TUNNEL_LOG"
  ngrok http "$PORT" --log stdout >"$TUNNEL_LOG" 2>&1 &
  TUNNEL_PID="$!"
}

wait_for_tunnel_url() {
  local _i
  TUNNEL_URL=""
  for _i in $(seq 1 180); do
    TUNNEL_URL="$(extract_tunnel_url)"
    if [[ -n "$TUNNEL_URL" ]]; then
      return 0
    fi
    if [[ -z "$TUNNEL_PID" ]] || ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
      return 1
    fi
    if (( _i % 20 == 0 )); then
      echo "  still waiting for the tunnel..."
    fi
    sleep 0.5
  done
  return 1
}

TUNNEL_URL=""
TUNNEL_KIND=""
if [[ "$NO_TUNNEL" -eq 0 ]]; then
  if command -v cloudflared >/dev/null 2>&1; then
    start_cloudflared cloudflared
    TUNNEL_KIND="cloudflared"
  elif command -v npx >/dev/null 2>&1; then
    start_npx_cloudflared
    TUNNEL_KIND="npx"
  elif command -v ngrok >/dev/null 2>&1; then
    start_ngrok
    TUNNEL_KIND="ngrok"
  else
    print_install_help
  fi

  if [[ -n "$TUNNEL_PID" ]]; then
    echo "Waiting for the tunnel URL."
    if ! wait_for_tunnel_url; then
      echo "The tunnel did not print an HTTPS URL."
      echo "----- tunnel log -----"
      cat "$TUNNEL_LOG" || true
      if [[ "$TUNNEL_KIND" != "ngrok" ]] && command -v ngrok >/dev/null 2>&1; then
        echo "Trying ngrok instead."
        stop_pid "$TUNNEL_PID"
        TUNNEL_PID=""
        start_ngrok
        TUNNEL_KIND="ngrok"
        echo "Waiting for the ngrok URL."
        if ! wait_for_tunnel_url; then
          echo "ngrok did not print an HTTPS URL."
          echo "----- tunnel log -----"
          cat "$TUNNEL_LOG" || true
          print_install_help
        fi
      else
        print_install_help
      fi
    fi
  fi
fi

border() {
  printf '%s\n' "================================================================"
}

border
echo "  FreeTrial Terminator is ready"
border
echo ""
echo "  Widget preview (this machine):"
echo "    http://127.0.0.1:${PORT}/preview"
echo ""
if [[ -n "$TUNNEL_URL" ]]; then
  echo "  Public preview (same widget, through the tunnel):"
  echo "    ${TUNNEL_URL}/preview"
  echo ""
  echo "  MCP connector URL (paste this into ChatGPT):"
  echo "    ${TUNNEL_URL}/mcp"
else
  echo "  MCP connector URL:"
  echo "    http://127.0.0.1:${PORT}/mcp"
  echo "    This address only works on this machine. ChatGPT needs the HTTPS tunnel URL."
fi
echo ""
if [[ "$GMAIL_READY" -eq 1 ]]; then
  echo "  Real Gmail mode is available. Demo stays on until DEMO_MODE=false."
  echo "  Redirect URI: http://127.0.0.1:${PORT}/auth/google/callback"
  echo ""
fi
echo "  Add it in ChatGPT developer mode:"
echo "    1. Open Settings, then Security and login, and turn on Developer mode."
echo "    2. Open ChatGPT Plugins and press the plus button."
echo "    3. Paste the MCP connector URL. Name it FreeTrial Terminator."
echo "    4. Create the connector, start a new chat, and select it from the plus menu."
echo ""
echo "  Demo script (no login):"
echo "    1. What free trials are about to charge me?"
echo "    2. Cancel Canva."
echo "    3. Keep Duolingo."
echo "    4. Remind me about Adobe."
echo "    5. What will I be charged in the next week?"
echo ""
echo "  Leave this window open. Ctrl+C stops the server and the tunnel."
border

# Stay alive until the server stops or the user hits Ctrl+C.
while true; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "The server stopped."
    echo "----- server log -----"
    cat "$SERVER_LOG" || true
    exit 1
  fi
  if [[ -n "$TUNNEL_PID" ]] && ! kill -0 "$TUNNEL_PID" 2>/dev/null; then
    echo "The tunnel stopped. The local server is still up at http://127.0.0.1:${PORT}/preview"
    TUNNEL_PID=""
  fi
  sleep 1
done
