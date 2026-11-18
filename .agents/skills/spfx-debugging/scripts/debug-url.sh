#!/usr/bin/env bash
set -euo pipefail

page_url="${1:-${SPFX_DEBUG_PAGE_URL:-}}"
dev_server_port="${2:-${SPFX_DEBUG_DEV_SERVER_PORT:-4321}}"

if [[ -z "$page_url" ]]; then
  echo "Usage: debug-url.sh <sharepoint page url> [dev server port] (or set SPFX_DEBUG_PAGE_URL)" >&2
  exit 2
fi

hash=""
if [[ "$page_url" == *"#"* ]]; then
  hash="#${page_url#*#}"
  page_url="${page_url%%#*}"
fi
page_without_query="${page_url%%\?*}"
manifests_url="https%3A%2F%2Flocalhost%3A${dev_server_port}%2Ftemp%2Fbuild%2Fmanifests.js"

echo "${page_without_query}?debugManifestsFile=${manifests_url}&debug=true&noredir=true${hash}"
