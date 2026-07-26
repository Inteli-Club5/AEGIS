#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"

network="${1:-all}"
validate_network_argument "${network}"
"${THEGRAPH_SCRIPT_DIR}/boundary-check.sh"

temporary_hedera_manifest=false
cleanup_temporary_hedera_manifest() {
  if [[ "${temporary_hedera_manifest}" == "true" ]] && \
    [[ -f "${THEGRAPH_HEDERA_SUBGRAPH_DIR}/subgraph.yaml" ]] && \
    rg -q '^# CODEGEN/UNIT-TEST ONLY' "${THEGRAPH_HEDERA_SUBGRAPH_DIR}/subgraph.yaml"; then
    unlink "${THEGRAPH_HEDERA_SUBGRAPH_DIR}/subgraph.yaml"
  fi
}
trap cleanup_temporary_hedera_manifest EXIT INT TERM

if [[ "${network}" == "all" || "${network}" == "hedera" ]]; then
  if [[ ! -f "${THEGRAPH_HEDERA_SUBGRAPH_DIR}/subgraph.yaml" ]]; then
    if [[ ! -f "${THEGRAPH_HEDERA_SUBGRAPH_DIR}/.thegraph/matchstick.yaml" ]]; then
      node "${THEGRAPH_SCRIPT_DIR}/generate-hedera-codegen-manifest.mjs"
    fi
    cp "${THEGRAPH_HEDERA_SUBGRAPH_DIR}/.thegraph/matchstick.yaml" \
      "${THEGRAPH_HEDERA_SUBGRAPH_DIR}/subgraph.yaml"
    temporary_hedera_manifest=true
  fi
  "${THEGRAPH_SCRIPT_DIR}/lint-one.sh" "${THEGRAPH_HEDERA_SUBGRAPH_DIR}"
  cleanup_temporary_hedera_manifest
  temporary_hedera_manifest=false
fi
if [[ "${network}" == "all" || "${network}" == "0g" ]]; then
  "${THEGRAPH_SCRIPT_DIR}/lint-one.sh" "${THEGRAPH_0G_SUBGRAPH_DIR}"
fi
