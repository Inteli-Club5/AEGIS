#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"

require_command curl
require_command jq
require_command rg

network="${1:-all}"
validate_network_argument "${network}"
readonly STATUS_QUERY='query Status($name: String!) { indexingStatusForCurrentVersion(subgraphName: $name) { synced health fatalError { message block { number hash } handler } chains { network chainHeadBlock { number hash } latestBlock { number hash } } } }'

check_chain_head_observed() {
  local network_name="$1"
  local metrics

  metrics="$(curl --silent --show-error --fail --max-time 20 "${THEGRAPH_GRAPH_NODE_METRICS_URL}")"
  if rg -q "^eth_rpc_status\{provider=\"${network_name}-rpc-[0-9]+\"\}" <<<"${metrics}" && \
    ! rg -q "^eth_rpc_status\{provider=\"${network_name}-rpc-[0-9]+\"\} 0(\.0+)?$" <<<"${metrics}"; then
    echo "Graph Node provider checks explicitly report a failure for ${network_name}." >&2
    return 1
  fi
  if ! rg -q "^ethereum_chain_head_number\{network=\"${network_name}\"\} [0-9]+(\.0+)?$" <<<"${metrics}"; then
    echo "Graph Node has no successfully ingested chain head for ${network_name}." >&2
    echo "Process health alone is insufficient; inspect Graph Node logs for block/receipt inconsistency." >&2
    return 1
  fi
  echo "Graph Node has ingested a chain-head observation for ${network_name}."
  echo "RPC provenance is a separate gate enforced by preflight.sh; this metric alone does not claim provider consistency."
}

check_status() {
  local name="$1"
  local payload
  local response

  payload="$(jq -cn --arg query "${STATUS_QUERY}" --arg name "${name}" \
    '{query:$query,variables:{name:$name}}')"
  response="$(curl --silent --show-error --fail --max-time 20 \
    -H 'content-type: application/json' --data "${payload}" "${THEGRAPH_GRAPH_NODE_STATUS_URL}")"
  if jq -e '.errors != null or .data.indexingStatusForCurrentVersion == null' >/dev/null <<<"${response}"; then
    echo "Indexing status query failed for ${name}:" >&2
    jq -c '{errors, data}' <<<"${response}" >&2
    return 1
  fi
  jq -c --arg name "${name}" \
    '{subgraph:$name, synced:.data.indexingStatusForCurrentVersion.synced, health:.data.indexingStatusForCurrentVersion.health, fatalError:.data.indexingStatusForCurrentVersion.fatalError, chains:.data.indexingStatusForCurrentVersion.chains}' \
    <<<"${response}"
  if ! jq -e '.data.indexingStatusForCurrentVersion.synced == true and .data.indexingStatusForCurrentVersion.health != "failed" and .data.indexingStatusForCurrentVersion.fatalError == null' \
    >/dev/null <<<"${response}"; then
    echo "${name} is deployed but not healthy and fully synchronized." >&2
    return 1
  fi
}

failures=0
if [[ "${network}" == "all" || "${network}" == "hedera" ]]; then
  check_chain_head_observed "hedera-testnet" || failures=$((failures + 1))
  check_status "${THEGRAPH_HEDERA_SUBGRAPH_NAME}" || failures=$((failures + 1))
fi
if [[ "${network}" == "all" || "${network}" == "0g" ]]; then
  check_chain_head_observed "0g-galileo" || failures=$((failures + 1))
  check_status "${THEGRAPH_0G_SUBGRAPH_NAME}" || failures=$((failures + 1))
fi
(( failures == 0 ))
