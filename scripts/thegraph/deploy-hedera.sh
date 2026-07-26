#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"

require_graph_cli "${THEGRAPH_HEDERA_SUBGRAPH_DIR}"
"${THEGRAPH_SCRIPT_DIR}/preflight.sh" --network hedera
"${THEGRAPH_SCRIPT_DIR}/generate.sh" hedera
require_manifest "${THEGRAPH_HEDERA_SUBGRAPH_DIR}"

(cd "${THEGRAPH_HEDERA_SUBGRAPH_DIR}" && "${THEGRAPH_HEDERA_CLI}" deploy \
  --node "${THEGRAPH_GRAPH_NODE_ADMIN_URL}" \
  --ipfs "${THEGRAPH_IPFS_URL}" \
  --version-label "local-v1" \
  "${THEGRAPH_HEDERA_SUBGRAPH_NAME}" \
  subgraph.yaml)

echo "Hedera deployment submitted. Run status.sh hedera; submission does not prove synchronization."
