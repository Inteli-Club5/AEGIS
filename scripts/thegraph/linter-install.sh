#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"

require_command git
require_command npm

readonly LINTER_DIR="${THEGRAPH_SUBGRAPH_LINTER_DIR:-${THEGRAPH_REPO_ROOT}/.thegraph/subgraph-linter}"
readonly LINTER_ORIGIN="https://github.com/graphprotocol/subgraph-linter.git"

if [[ ! -d "${LINTER_DIR}/.git" ]]; then
  mkdir -p "$(dirname "${LINTER_DIR}")"
  git clone "${LINTER_ORIGIN}" "${LINTER_DIR}"
else
  actual_origin="$(git -C "${LINTER_DIR}" remote get-url origin)"
  if [[ "${actual_origin}" != "${LINTER_ORIGIN}" ]]; then
    echo "Existing Subgraph Linter checkout has unexpected origin: ${actual_origin}" >&2
    exit 1
  fi
fi

npm --prefix "${LINTER_DIR}" install
npm --prefix "${LINTER_DIR}" run build
git -C "${LINTER_DIR}" rev-parse HEAD
