#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"

network="${1:-all}"
attempts="${THEGRAPH_SYNC_MAX_ATTEMPTS:-60}"
interval="${THEGRAPH_SYNC_POLL_SECONDS:-5}"
validate_network_argument "${network}"

for ((attempt = 1; attempt <= attempts; attempt += 1)); do
  if "${THEGRAPH_SCRIPT_DIR}/status.sh" "${network}"; then
    echo "Selected Subgraph deployment(s) are healthy and synchronized."
    exit 0
  fi
  echo "Waiting for sync (${attempt}/${attempts})."
  sleep "${interval}"
done

echo "Synchronization did not complete within the configured polling window." >&2
exit 1
