#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"

require_command rg

"${THEGRAPH_SCRIPT_DIR}/privacy-check.sh"

failures=0
if rg -n --glob '*.ts' --glob '!generated/**' \
  '(\.bind\(|try_[A-Za-z0-9_]+\(|ethereum\.call|ipfs\.|http://|https://)' \
  "${THEGRAPH_HEDERA_SUBGRAPH_DIR}/src" "${THEGRAPH_0G_SUBGRAPH_DIR}/src"; then
  echo "Subgraph mappings contain a forbidden contract call, external read, or URL." >&2
  failures=$((failures + 1))
fi

for manifest in \
  "${THEGRAPH_HEDERA_SUBGRAPH_DIR}/subgraph.yaml" \
  "${THEGRAPH_0G_SUBGRAPH_DIR}/subgraph.yaml"; do
  if [[ -f "${manifest}" ]] && rg -n '(\{\{[^}]+\}\}|0x0{40})' "${manifest}"; then
    echo "Executable manifest contains an unresolved or zero address: ${manifest}" >&2
    failures=$((failures + 1))
  fi
done

if (( failures > 0 )); then
  exit 1
fi
echo "Subgraph event-only and manifest boundary checks passed."
