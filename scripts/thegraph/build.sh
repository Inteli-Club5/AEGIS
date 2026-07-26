#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"

network="${1:-all}"
validate_network_argument "${network}"

if [[ "${network}" == "all" || "${network}" == "hedera" ]]; then
  require_graph_cli "${THEGRAPH_HEDERA_SUBGRAPH_DIR}"
  if [[ -f "${THEGRAPH_HEDERA_SUBGRAPH_DIR}/subgraph.yaml" ]]; then
    hedera_manifest="subgraph.yaml"
  elif [[ -f "${THEGRAPH_HEDERA_SUBGRAPH_DIR}/.thegraph/codegen.yaml" ]]; then
    hedera_manifest=".thegraph/codegen.yaml"
    echo "Building Hedera mappings for compile/test only; no deployable registry manifest exists."
  else
    echo "Hedera manifest is absent. Run codegen.sh hedera first." >&2
    exit 1
  fi
  (cd "${THEGRAPH_HEDERA_SUBGRAPH_DIR}" && "${THEGRAPH_HEDERA_CLI}" build "${hedera_manifest}")
fi
if [[ "${network}" == "all" || "${network}" == "0g" ]]; then
  require_graph_cli "${THEGRAPH_0G_SUBGRAPH_DIR}"
  require_manifest "${THEGRAPH_0G_SUBGRAPH_DIR}"
  (cd "${THEGRAPH_0G_SUBGRAPH_DIR}" && "${THEGRAPH_0G_CLI}" build subgraph.yaml)
fi
