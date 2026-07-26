#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"

network="${1:-all}"
validate_network_argument "${network}"

create_subgraph() {
  local cli="$1"
  local name="$2"
  local output
  local status

  set +e
  output="$("${cli}" create --node "${THEGRAPH_GRAPH_NODE_ADMIN_URL}" "${name}" 2>&1)"
  status=$?
  set -e
  if (( status == 0 )); then
    echo "${output}"
    return 0
  fi
  if [[ "${output,,}" == *"already exists"* ]]; then
    echo "Subgraph ${name} already exists; create is idempotently complete."
    return 0
  fi
  echo "${output}" >&2
  return "${status}"
}

if [[ "${network}" == "all" || "${network}" == "hedera" ]]; then
  require_graph_cli "${THEGRAPH_HEDERA_SUBGRAPH_DIR}"
  create_subgraph "${THEGRAPH_HEDERA_CLI}" "${THEGRAPH_HEDERA_SUBGRAPH_NAME}"
fi
if [[ "${network}" == "all" || "${network}" == "0g" ]]; then
  require_graph_cli "${THEGRAPH_0G_SUBGRAPH_DIR}"
  create_subgraph "${THEGRAPH_0G_CLI}" "${THEGRAPH_0G_SUBGRAPH_NAME}"
fi
