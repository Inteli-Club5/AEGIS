#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"

require_command jq
require_command rg

readonly REGISTRY_ABI="${THEGRAPH_HEDERA_SUBGRAPH_DIR}/abis/AegisTeeValidationRegistry.json"
readonly AGENTIC_ID_ABI="${THEGRAPH_0G_SUBGRAPH_DIR}/abis/AgenticID.json"

if ! jq -e '
  [.[] | select(.type == "event" and .name == "TeeMLValidationRecorded")] as $events |
  ($events | length == 1) and
  ([ $events[0].inputs[].type ] | all(. != "string" and . != "bytes" and (endswith("[]") | not)))
' "${REGISTRY_ABI}" >/dev/null; then
  echo "TeeMLValidationRecorded is absent, duplicated, or exposes a dynamic event value." >&2
  exit 1
fi

if ! jq -e '
  ([.[] | select(.type == "event") | .name] | sort) ==
    ["DelegateAccessSet", "Transfer", "UsageAuthorized", "UsageRevoked"] and
  ([.[] | select(.type == "event") | .inputs[] | .type] |
    all(. != "string" and . != "bytes" and (endswith("[]") | not))) and
  ([.[] | select(.name == "Transfer") | .inputs[] | [.name, .type, .indexed]]) ==
    [["from", "address", true], ["to", "address", true], ["tokenId", "uint256", true]] and
  ([.[] | select(.name == "UsageAuthorized") | .inputs[] | [.name, .type, .indexed]]) ==
    [["tokenId", "uint256", true], ["user", "address", true]] and
  ([.[] | select(.name == "UsageRevoked") | .inputs[] | [.name, .type, .indexed]]) ==
    [["tokenId", "uint256", true], ["user", "address", true]] and
  ([.[] | select(.name == "DelegateAccessSet") | .inputs[] | [.name, .type, .indexed]]) ==
    [["owner", "address", true], ["assistant", "address", true]]
' "${AGENTIC_ID_ABI}" >/dev/null; then
  echo "0G Agentic ID ABI is not the exact verified, fixed-width AEGIS event allowlist." >&2
  exit 1
fi

if rg -n -i \
  '(prompt|detailedReason|semanticRules|privateKey|apiKey|rawTee|rawProof|attestation|metadataURI)\s*:' \
  "${THEGRAPH_HEDERA_SUBGRAPH_DIR}/schema.graphql" \
  "${THEGRAPH_0G_SUBGRAPH_DIR}/schema.graphql"; then
  echo "A Subgraph schema exposes a private, unverified, or unavailable field." >&2
  exit 1
fi

echo "Subgraph ABI/schema privacy boundary checks passed."
