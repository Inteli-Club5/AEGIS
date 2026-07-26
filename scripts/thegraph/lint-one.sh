#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"

subgraph_dir="${1:-}"
if [[ -z "${subgraph_dir}" ]]; then
  echo "Usage: lint-one.sh <subgraph-directory>" >&2
  exit 1
fi
subgraph_dir="$(cd "${subgraph_dir}" && pwd)"
readonly LINTER_DIR="${THEGRAPH_SUBGRAPH_LINTER_DIR:-${THEGRAPH_REPO_ROOT}/.thegraph/subgraph-linter}"

if [[ ! -f "${LINTER_DIR}/package.json" || ! -d "${LINTER_DIR}/dist" ]]; then
  echo "Official Subgraph Linter is not built at ${LINTER_DIR}. Run scripts/thegraph/linter-install.sh." >&2
  exit 1
fi
require_manifest "${subgraph_dir}"

npm --prefix "${LINTER_DIR}" run check -- \
  --manifest "${subgraph_dir}/subgraph.yaml" \
  --tsconfig "${subgraph_dir}/tsconfig.json" \
  --config "${subgraph_dir}/subgraph-linter.config.json"
