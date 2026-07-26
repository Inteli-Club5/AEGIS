#!/usr/bin/env bash

set -euo pipefail

THEGRAPH_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
THEGRAPH_REPO_ROOT="$(cd "${THEGRAPH_SCRIPT_DIR}/../.." && pwd)"

readonly THEGRAPH_SCRIPT_DIR
readonly THEGRAPH_REPO_ROOT
readonly THEGRAPH_COMPOSE_FILE="${THEGRAPH_REPO_ROOT}/compose.thegraph.yaml"
readonly THEGRAPH_HEDERA_SUBGRAPH_DIR="${THEGRAPH_REPO_ROOT}/subgraphs/aegis-hedera"
readonly THEGRAPH_0G_SUBGRAPH_DIR="${THEGRAPH_REPO_ROOT}/subgraphs/aegis-0g"
readonly THEGRAPH_HEDERA_SUBGRAPH_NAME="aegis-hedera"
readonly THEGRAPH_0G_SUBGRAPH_NAME="aegis-0g"
readonly THEGRAPH_GRAPH_NODE_ADMIN_URL="${THEGRAPH_GRAPH_NODE_ADMIN_URL:-http://127.0.0.1:8020}"
readonly THEGRAPH_GRAPH_NODE_STATUS_URL="${THEGRAPH_GRAPH_NODE_STATUS_URL:-http://127.0.0.1:8030/graphql}"
readonly THEGRAPH_GRAPH_NODE_METRICS_URL="${THEGRAPH_GRAPH_NODE_METRICS_URL:-http://127.0.0.1:8040/metrics}"
readonly THEGRAPH_IPFS_URL="${THEGRAPH_IPFS_URL:-http://127.0.0.1:5001}"
readonly THEGRAPH_QUERY_BASE_URL="${THEGRAPH_QUERY_BASE_URL:-http://127.0.0.1:8000/subgraphs/name}"
readonly THEGRAPH_HEDERA_QUERY_URL="${THEGRAPH_QUERY_BASE_URL}/${THEGRAPH_HEDERA_SUBGRAPH_NAME}"
readonly THEGRAPH_0G_QUERY_URL="${THEGRAPH_QUERY_BASE_URL}/${THEGRAPH_0G_SUBGRAPH_NAME}"
# Host-side preflight endpoint for the official/self-hosted Hedera JSON-RPC
# Relay. Graph Node uses THEGRAPH_HEDERA_GRAPH_NODE_RPC_URL inside Compose.
readonly THEGRAPH_HEDERA_RPC_URL="${THEGRAPH_HEDERA_RPC_URL:-http://127.0.0.1:7546}"
readonly THEGRAPH_0G_RPC_URL="${THEGRAPH_0G_RPC_URL:-https://evmrpc-testnet.0g.ai}"
readonly THEGRAPH_HEDERA_DEPLOYMENT_ARTIFACT="${THEGRAPH_HEDERA_DEPLOYMENT_ARTIFACT:-${THEGRAPH_REPO_ROOT}/deployments/hedera-testnet/tee-validation-registry.json}"
readonly THEGRAPH_0G_DEPLOYMENT_ARTIFACT="${THEGRAPH_0G_DEPLOYMENT_ARTIFACT:-${THEGRAPH_REPO_ROOT}/subgraphs/aegis-0g/config/agentic-id.json}"
readonly THEGRAPH_HEDERA_CLI="${THEGRAPH_HEDERA_SUBGRAPH_DIR}/node_modules/.bin/graph"
readonly THEGRAPH_0G_CLI="${THEGRAPH_0G_SUBGRAPH_DIR}/node_modules/.bin/graph"

require_command() {
  local command_name="$1"
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Required command is unavailable: ${command_name}" >&2
    exit 1
  fi
}

require_graph_cli() {
  local subgraph_dir="$1"
  local graph_cli="${subgraph_dir}/node_modules/.bin/graph"
  if [[ ! -x "${graph_cli}" ]]; then
    echo "Graph CLI is not installed for ${subgraph_dir}. Run scripts/thegraph/install.sh." >&2
    exit 1
  fi
}

validate_network_argument() {
  local network="$1"
  case "${network}" in
    all | hedera | 0g) ;;
    *)
      echo "Network must be one of: all, hedera, 0g." >&2
      exit 1
      ;;
  esac
}

require_manifest() {
  local subgraph_dir="$1"
  if [[ ! -f "${subgraph_dir}/subgraph.yaml" ]]; then
    echo "Generated manifest is missing: ${subgraph_dir}/subgraph.yaml" >&2
    echo "Run scripts/thegraph/generate.sh after the public deployment artifact exists." >&2
    exit 1
  fi
}
