#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"

require_command node

network="${1:-all}"
validate_network_argument "${network}"
if [[ "${network}" == "all" || "${network}" == "hedera" ]]; then
  node "${THEGRAPH_SCRIPT_DIR}/export-registry-abi.mjs"
fi
node "${THEGRAPH_SCRIPT_DIR}/generate-manifests.mjs" --network "${network}"
