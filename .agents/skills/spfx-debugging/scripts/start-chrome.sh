#!/usr/bin/env bash
set -euo pipefail

profile="${SPFX_DEBUG_BROWSER_PROFILE:-}"
profile="${profile/#\~/$HOME}"
cdp_port="${SPFX_DEBUG_CDP_PORT:-9333}"
pid_file="${TMPDIR:-/tmp}/spfx-debug-chrome-${cdp_port}.pid"
log_file="${TMPDIR:-/tmp}/spfx-debug-chrome-${cdp_port}.log"

if [[ -z "$profile" ]]; then
  echo "SPFX_DEBUG_BROWSER_PROFILE is not set. Ask the user for the saved, logged-in browser profile path." >&2
  exit 2
fi
if [[ ! -d "$profile" ]]; then
  echo "Browser profile not found: $profile. Ask the user; never create a fresh profile." >&2
  exit 2
fi

find_chrome() {
  if [[ -n "${SPFX_DEBUG_CHROME:-}" ]]; then
    echo "${SPFX_DEBUG_CHROME/#\~/$HOME}"
    return
  fi
  local managed
  managed="$(ls -d "$HOME"/.agent-browser/browsers/chrome-*/chrome 2>/dev/null | sort -V | tail -n 1 || true)"
  if [[ -n "$managed" ]]; then
    echo "$managed"
    return
  fi
  command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser || true
}

chrome="$(find_chrome)"
if [[ -z "$chrome" || ! -x "$chrome" ]]; then
  echo "No Chrome binary found. Set SPFX_DEBUG_CHROME." >&2
  exit 2
fi

cdp_is_up() {
  curl -fsS --max-time 1 "http://127.0.0.1:${cdp_port}/json/version" >/dev/null 2>&1
}

profile_owner_pids="$(pgrep -f -- "[-]-user-data-dir=${profile}( |$)" || true)"
if [[ -n "$profile_owner_pids" ]]; then
  if pgrep -f -- "[-]-user-data-dir=${profile}( |$).*[-]-remote-debugging-port=${cdp_port}|[-]-remote-debugging-port=${cdp_port}.*[-]-user-data-dir=${profile}( |$)" >/dev/null && cdp_is_up; then
    echo "Chrome with this profile is already running on CDP port ${cdp_port}; reusing it."
    exit 0
  fi
  echo "Another Chrome already uses this profile (pids: $(echo $profile_owner_pids)). Do not start a second one or delete lock files; ask the user." >&2
  exit 3
fi

if cdp_is_up; then
  echo "CDP port ${cdp_port} is already taken by another browser. Set SPFX_DEBUG_CDP_PORT to a free port." >&2
  exit 3
fi

setsid nohup "$chrome" --headless=new --no-sandbox \
  --user-data-dir="$profile" \
  --ignore-certificate-errors \
  --disable-features=LocalNetworkAccessChecks,Translate \
  --remote-debugging-port="$cdp_port" \
  --window-size=1280,900 about:blank >"$log_file" 2>&1 </dev/null &
echo $! >"$pid_file"

for _ in $(seq 1 30); do
  if cdp_is_up; then
    echo "Chrome started: pid $(cat "$pid_file"), CDP port ${cdp_port}, log ${log_file}"
    exit 0
  fi
  sleep 0.5
done

echo "Chrome did not open CDP port ${cdp_port} within 15 s. See ${log_file}." >&2
exit 1
