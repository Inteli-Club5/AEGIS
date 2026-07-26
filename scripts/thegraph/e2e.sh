#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"

network="${1:-all}"
validate_network_argument "${network}"
"${THEGRAPH_SCRIPT_DIR}/status.sh" "${network}"
"${THEGRAPH_SCRIPT_DIR}/smoke.sh" "${network}"

echo "Graph Node sync and real GraphQL data checks passed for ${network}; this script uses no runtime fixtures or RPC-read fallback."
