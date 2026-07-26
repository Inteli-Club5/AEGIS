#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"

require_command curl
require_command jq

network="${1:-all}"
validate_network_argument "${network}"

readonly HEDERA_QUERY='query HederaSmoke($first: Int!) { hederaProtocolSummary(id: "global") { totalAgents totalValidations totalAllow totalDeny totalExecutions totalExecutionSuccess totalExecutionFailure totalPolicies } teeMLValidations(first: $first, orderBy: id, orderDirection: asc) { id requestId agentIdHash verdict transactionHash blockNumber blockTimestamp } _meta { block { number hash timestamp } deployment hasIndexingErrors } }'
readonly ZERO_G_QUERY='query ZeroGSmoke($first: Int!, $contract: Bytes!, $tokenId: BigInt!, $mintTransactionHash: Bytes!) { zeroGProtocolSummary(id: "global") { distinctIdentityCount mintEventCount transferEventCount burnEventCount currentIdentityCount totalOwnerChanges authorizationGrantedEventCount authorizationRevokedEventCount delegationSetEventCount delegationRevokedEventCount } agenticIdentities(first: $first, orderBy: id, orderDirection: asc) { id contract tokenId owner status seenMint transactionHash blockNumber blockTimestamp currentAuthorizationCount totalAuthorizationEvents } authorizationEvidence: agenticIdentityAuthorizations(first: 1, orderBy: blockTimestamp, orderDirection: desc) { id tokenId user action transactionHash blockNumber } delegationEvidence: agenticIdentityDelegations(first: 1, orderBy: blockTimestamp, orderDirection: desc) { id owner assistant action transactionHash blockNumber } evidenceIdentities: agenticIdentities(first: 1, where: { contract: $contract, tokenId: $tokenId, mintTransactionHash: $mintTransactionHash }) { id tokenId owner seenMint mintTransactionHash mintBlockNumber transactionHash } _meta { block { number hash timestamp } deployment hasIndexingErrors } }'

query_subgraph() {
  local label="$1"
  local endpoint="$2"
  local query="$3"
  local summary_field="$4"
  local variables="$5"
  local evidence_field="${6:-}"
  local payload
  local response

  payload="$(jq -cn --arg query "${query}" --argjson variables "${variables}" \
    '{query:$query,variables:$variables}')"
  response="$(curl --silent --show-error --fail --max-time 20 \
    -H 'content-type: application/json' --data "${payload}" "${endpoint}")"
  if jq -e '.errors != null or .data._meta == null or .data._meta.hasIndexingErrors == true' >/dev/null <<<"${response}"; then
    echo "${label} smoke query failed or reports indexing errors." >&2
    jq -c '{errors, meta:.data._meta}' <<<"${response}" >&2
    return 1
  fi
  if ! jq -e --arg summary "${summary_field}" '.data[$summary] != null' >/dev/null <<<"${response}"; then
    echo "${label} has no protocol summary; no proven indexed event is available yet." >&2
    return 1
  fi
  if [[ -n "${evidence_field}" ]] && \
    ! jq -e --arg evidence "${evidence_field}" '.data[$evidence] | length == 1' >/dev/null <<<"${response}"; then
    echo "${label} does not contain the independently verified evidence entity." >&2
    return 1
  fi
  if [[ "${label}" == "0G" ]] && ! jq -e \
    '(.data.zeroGProtocolSummary.authorizationGrantedEventCount | tonumber) > 0 and
     (.data.zeroGProtocolSummary.delegationSetEventCount | tonumber) > 0 and
     (.data.authorizationEvidence | length) == 1 and
     (.data.delegationEvidence | length) == 1' >/dev/null <<<"${response}"; then
    echo "0G has no verified authorization/delegation event evidence from the current deployment." >&2
    return 1
  fi
  jq -c '.data' <<<"${response}"
}

if [[ "${network}" == "all" || "${network}" == "hedera" ]]; then
  query_subgraph "Hedera" "${THEGRAPH_HEDERA_QUERY_URL}" "${HEDERA_QUERY}" \
    "hederaProtocolSummary" '{"first":1}'
fi
if [[ "${network}" == "all" || "${network}" == "0g" ]]; then
  zero_g_variables="$(jq -cn \
    --arg contract "$(jq -r '.address | ascii_downcase' "${THEGRAPH_0G_DEPLOYMENT_ARTIFACT}")" \
    --arg tokenId "$(jq -r '.sourceTokenId' "${THEGRAPH_0G_DEPLOYMENT_ARTIFACT}")" \
    --arg mintTransactionHash "$(jq -r '.sourceTransactionHash | ascii_downcase' "${THEGRAPH_0G_DEPLOYMENT_ARTIFACT}")" \
    '{first:1,contract:$contract,tokenId:$tokenId,mintTransactionHash:$mintTransactionHash}')"
  query_subgraph "0G" "${THEGRAPH_0G_QUERY_URL}" "${ZERO_G_QUERY}" \
    "zeroGProtocolSummary" "${zero_g_variables}" "evidenceIdentities"
fi
