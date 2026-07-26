#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"

network="${1:-all}"
validate_network_argument "${network}"

if [[ "${network}" == "all" || "${network}" == "hedera" ]]; then
  require_graph_cli "${THEGRAPH_HEDERA_SUBGRAPH_DIR}"
  node "${THEGRAPH_SCRIPT_DIR}/export-registry-abi.mjs"
  if [[ -f "${THEGRAPH_HEDERA_DEPLOYMENT_ARTIFACT}" ]]; then
    node "${THEGRAPH_SCRIPT_DIR}/generate-manifests.mjs" --network hedera
    hedera_manifest="subgraph.yaml"
  else
    node "${THEGRAPH_SCRIPT_DIR}/generate-hedera-codegen-manifest.mjs"
    hedera_manifest=".thegraph/codegen.yaml"
  fi
  (cd "${THEGRAPH_HEDERA_SUBGRAPH_DIR}" && "${THEGRAPH_HEDERA_CLI}" codegen "${hedera_manifest}")
fi
if [[ "${network}" == "all" || "${network}" == "0g" ]]; then
  require_graph_cli "${THEGRAPH_0G_SUBGRAPH_DIR}"
  node "${THEGRAPH_SCRIPT_DIR}/generate-manifests.mjs" --network 0g
  (cd "${THEGRAPH_0G_SUBGRAPH_DIR}" && "${THEGRAPH_0G_CLI}" codegen subgraph.yaml)
fi
