#!/usr/bin/env bash
set -euo pipefail

cdp_port="${SPFX_DEBUG_CDP_PORT:-9333}"
pid_file="${TMPDIR:-/tmp}/spfx-debug-chrome-${cdp_port}.pid"

if [[ ! -f "$pid_file" ]]; then
  echo "No Chrome started by start-chrome.sh on CDP port ${cdp_port}; nothing to stop."
  exit 0
fi

pid="$(cat "$pid_file")"
if ! tr '\0' ' ' <"/proc/${pid}/cmdline" 2>/dev/null | grep -q -- "--remote-debugging-port=${cdp_port}"; then
  echo "Process ${pid} is gone or is not our Chrome; removing the stale pid file."
  rm -f "$pid_file"
  exit 0
fi

kill "$pid"
for _ in $(seq 1 20); do
  if ! kill -0 "$pid" 2>/dev/null; then
    rm -f "$pid_file"
    echo "Chrome ${pid} stopped."
    exit 0
  fi
  sleep 0.5
done

echo "Chrome ${pid} is still running after 10 s; check it manually (never delete profile lock files)." >&2
exit 1
