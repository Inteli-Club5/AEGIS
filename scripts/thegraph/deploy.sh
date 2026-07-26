#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"

network="${1:-all}"
validate_network_argument "${network}"
if [[ "${network}" == "all" || "${network}" == "hedera" ]]; then
  "${THEGRAPH_SCRIPT_DIR}/deploy-hedera.sh"
fi
if [[ "${network}" == "all" || "${network}" == "0g" ]]; then
  "${THEGRAPH_SCRIPT_DIR}/deploy-0g.sh"
fi
