#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"

require_graph_cli "${THEGRAPH_0G_SUBGRAPH_DIR}"
"${THEGRAPH_SCRIPT_DIR}/preflight.sh" --network 0g
"${THEGRAPH_SCRIPT_DIR}/generate.sh" 0g
require_manifest "${THEGRAPH_0G_SUBGRAPH_DIR}"

(cd "${THEGRAPH_0G_SUBGRAPH_DIR}" && "${THEGRAPH_0G_CLI}" deploy \
  --node "${THEGRAPH_GRAPH_NODE_ADMIN_URL}" \
  --ipfs "${THEGRAPH_IPFS_URL}" \
  --version-label "local-v1" \
  "${THEGRAPH_0G_SUBGRAPH_NAME}" \
  subgraph.yaml)

echo "0G deployment submitted. Run status.sh 0g; submission does not prove synchronization."
