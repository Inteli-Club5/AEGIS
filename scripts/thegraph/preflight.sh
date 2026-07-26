#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"

require_command curl
require_command jq
require_command node

network="all"
if [[ "${1:-}" == "--network" ]]; then
  network="${2:-}"
elif [[ -n "${1:-}" ]]; then
  network="$1"
fi
validate_network_argument "${network}"

readonly ZERO_HASH="0x0000000000000000000000000000000000000000000000000000000000000000"
readonly TRANSFER_TOPIC="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"

rpc_response() {
  local network_label="$1"
  local rpc_url="$2"
  local method="$3"
  local params="$4"
  local payload

  payload="$(jq -cn --arg method "${method}" --argjson params "${params}" \
    '{jsonrpc:"2.0",id:1,method:$method,params:$params}')"
  curl --silent --show-error --fail --max-time 25 --retry 1 \
    -H 'content-type: application/json' --data "${payload}" "${rpc_url}" || {
      echo "${network_label}: ${method} transport request failed." >&2
      return 1
    }
}

rpc_result() {
  local network_label="$1"
  local rpc_url="$2"
  local method="$3"
  local params="$4"
  local response

  response="$(rpc_response "${network_label}" "${rpc_url}" "${method}" "${params}")" || return 1
  if ! jq -e 'has("result") and (.error == null)' >/dev/null <<<"${response}"; then
    echo "${network_label}: ${method} returned a JSON-RPC error." >&2
    return 1
  fi
  jq -c '.result' <<<"${response}"
}

validate_rpc() {
  local network_label="$1"
  local rpc_url="$2"
  local expected_chain_id="$3"
  local chain_id
  local block_number

  echo "Checking ${network_label} RPC capabilities without printing its URL."
  chain_id="$(rpc_result "${network_label}" "${rpc_url}" eth_chainId '[]')" || return 1
  chain_id="${chain_id//\"/}"
  if [[ "${chain_id,,}" != "${expected_chain_id,,}" ]]; then
    echo "${network_label}: expected chain ID ${expected_chain_id}, received ${chain_id}." >&2
    return 1
  fi

  block_number="$(rpc_result "${network_label}" "${rpc_url}" eth_blockNumber '[]')" || return 1
  block_number="${block_number//\"/}"
  rpc_result "${network_label}" "${rpc_url}" eth_getBlockByNumber '["latest",false]' >/dev/null || return 1
  rpc_result "${network_label}" "${rpc_url}" eth_getLogs '[{"fromBlock":"latest","toBlock":"latest"}]' >/dev/null || return 1
  rpc_result "${network_label}" "${rpc_url}" eth_getTransactionReceipt "[\"${ZERO_HASH}\"]" >/dev/null || return 1
  validate_recent_receipts "${network_label}" "${rpc_url}" "${block_number}" || return 1
  echo "${network_label}: required head RPC methods passed at ${block_number}; the null receipt probe only verifies method availability."
}

validate_recent_receipts() {
  local network_label="$1"
  local rpc_url="$2"
  local head_hex="$3"
  local head_decimal
  local offset
  local block_decimal
  local block_hex
  local block
  local block_hash
  local block_number
  local repeated_block
  local transaction
  local repeated_transaction
  local transaction_hash
  local transaction_block_hash
  local transaction_block_number
  local receipt
  local repeated_receipt
  local receipt_block_hash
  local receipt_block_number
  local tx_hash
  local logs
  local read_round
  local verified_blocks=0
  local verified_receipts=0
  local -a tx_hashes

  head_decimal="$((head_hex))"
  for ((offset = 0; offset < 64; offset += 1)); do
    block_decimal=$((head_decimal - offset))
    block_hex="$(printf '0x%x' "${block_decimal}")"
    block="$(rpc_result "${network_label}" "${rpc_url}" eth_getBlockByNumber \
      "[\"${block_hex}\",false]")" || return 1
    if [[ "${block}" == "null" ]] || ! jq -e '.transactions | length > 0' >/dev/null <<<"${block}"; then
      continue
    fi

    block_hash="$(jq -r '.hash // empty' <<<"${block}")"
    block_number="$(jq -r '.number // empty' <<<"${block}")"
    if [[ -z "${block_hash}" || "${block_number,,}" != "${block_hex,,}" ]]; then
      echo "${network_label}: block identity mismatch for requested block ${block_hex}." >&2
      return 1
    fi
    repeated_block="$(rpc_result "${network_label}" "${rpc_url}" eth_getBlockByNumber \
      "[\"${block_hex}\",false]")" || return 1
    if [[ "$(jq -cS . <<<"${block}")" != "$(jq -cS . <<<"${repeated_block}")" ]]; then
      echo "${network_label}: repeated block read changed for ${block_hex}." >&2
      echo "${network_label}: this RPC is not safe for Graph Node indexing." >&2
      return 1
    fi
    logs="$(rpc_result "${network_label}" "${rpc_url}" eth_getLogs \
      "[{\"fromBlock\":\"${block_hex}\",\"toBlock\":\"${block_hex}\"}]")" || return 1
    if ! jq -e 'type == "array"' >/dev/null <<<"${logs}"; then
      echo "${network_label}: eth_getLogs did not return an array for block ${block_hex}." >&2
      return 1
    fi

    mapfile -t tx_hashes < <(jq -r '.transactions[]' <<<"${block}")
    for tx_hash in "${tx_hashes[@]}"; do
      transaction="$(rpc_result "${network_label}" "${rpc_url}" eth_getTransactionByHash \
        "[\"${tx_hash}\"]")" || return 1
      if [[ "${transaction}" == "null" ]]; then
        echo "${network_label}: transaction ${tx_hash} listed in ${block_hex} is unavailable by hash." >&2
        return 1
      fi
      transaction_hash="$(jq -r '.hash // empty' <<<"${transaction}")"
      transaction_block_hash="$(jq -r '.blockHash // empty' <<<"${transaction}")"
      transaction_block_number="$(jq -r '.blockNumber // empty' <<<"${transaction}")"
      if [[ "${transaction_hash,,}" != "${tx_hash,,}" || \
        "${transaction_block_hash,,}" != "${block_hash,,}" || \
        "${transaction_block_number,,}" != "${block_hex,,}" ]]; then
        echo "${network_label}: transaction provenance mismatch for ${tx_hash} in ${block_hex}." >&2
        return 1
      fi

      receipt="$(rpc_result "${network_label}" "${rpc_url}" eth_getTransactionReceipt \
        "[\"${tx_hash}\"]")" || return 1
      if [[ "${receipt}" == "null" ]]; then
        echo "${network_label}: receipt is missing for transaction ${tx_hash} in recent block ${block_hex}." >&2
        echo "${network_label}: this RPC is not safe for Graph Node indexing." >&2
        return 1
      fi
      receipt_block_hash="$(jq -r '.blockHash // empty' <<<"${receipt}")"
      receipt_block_number="$(jq -r '.blockNumber // empty' <<<"${receipt}")"
      if [[ "${receipt_block_hash,,}" != "${block_hash,,}" || \
        "${receipt_block_number,,}" != "${block_hex,,}" ]]; then
        echo "${network_label}: receipt.blockHash mismatch for transaction ${tx_hash} in recent block ${block_hex}." >&2
        echo "${network_label}: block/receipt provenance is inconsistent or incomplete." >&2
        echo "${network_label}: this RPC is not safe for Graph Node indexing." >&2
        return 1
      fi

      if [[ "${tx_hash}" == "${tx_hashes[0]}" ]]; then
        for read_round in 2 3; do
          repeated_transaction="$(rpc_result "${network_label}" "${rpc_url}" eth_getTransactionByHash \
            "[\"${tx_hash}\"]")" || return 1
          repeated_receipt="$(rpc_result "${network_label}" "${rpc_url}" eth_getTransactionReceipt \
            "[\"${tx_hash}\"]")" || return 1
          if [[ "$(jq -cS . <<<"${transaction}")" != "$(jq -cS . <<<"${repeated_transaction}")" || \
            "$(jq -cS . <<<"${receipt}")" != "$(jq -cS . <<<"${repeated_receipt}")" ]]; then
            echo "${network_label}: repeated transaction/receipt read ${read_round} changed for ${tx_hash}." >&2
            echo "${network_label}: this RPC is not safe for Graph Node indexing." >&2
            return 1
          fi
        done
      fi
    done
    verified_blocks=$((verified_blocks + 1))
    verified_receipts=$((verified_receipts + ${#tx_hashes[@]}))
  done

  if (( verified_blocks < 5 )); then
    echo "${network_label}: found only ${verified_blocks} non-empty block(s) within 64 blocks of the head; five are required." >&2
    echo "${network_label}: recent receipt consistency could not be proven robustly for Graph Node indexing." >&2
    return 1
  fi

  echo "${network_label}: verified ${verified_receipts} receipt(s) across all ${verified_blocks} non-empty blocks in the 64-block window."
}

validate_deployment_transaction() {
  local network_label="$1"
  local rpc_url="$2"
  local artifact="$3"
  local expected_address
  local expected_block
  local expected_block_hex
  local deploy_tx_hash
  local transaction
  local receipt
  local repeated_transaction
  local repeated_receipt
  local read_round

  expected_address="$(jq -r '.address // empty' "${artifact}")"
  expected_block="$(jq -r '.startBlock // .deployBlock // .deploymentBlock // empty' "${artifact}")"
  deploy_tx_hash="$(jq -r '.deployTxHash // .deploymentTransactionHash // empty' "${artifact}")"
  if [[ ! "${deploy_tx_hash}" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
    echo "${network_label}: deployment artifact is missing a valid deployTxHash." >&2
    return 1
  fi
  expected_block_hex="$(printf '0x%x' "${expected_block}")"

  transaction="$(rpc_result "${network_label}" "${rpc_url}" eth_getTransactionByHash \
    "[\"${deploy_tx_hash}\"]")" || return 1
  receipt="$(rpc_result "${network_label}" "${rpc_url}" eth_getTransactionReceipt \
    "[\"${deploy_tx_hash}\"]")" || return 1
  if [[ "${transaction}" == "null" || "${receipt}" == "null" ]]; then
    echo "${network_label}: deployment transaction or receipt is unavailable." >&2
    return 1
  fi
  if ! jq -e --arg tx "${deploy_tx_hash,,}" --arg block "${expected_block_hex,,}" \
    '((.hash | ascii_downcase) == $tx) and ((.blockNumber | ascii_downcase) == $block)' \
    >/dev/null <<<"${transaction}"; then
    echo "${network_label}: deployment transaction provenance does not match the artifact." >&2
    return 1
  fi
  if ! jq -e --arg tx "${deploy_tx_hash,,}" --arg block "${expected_block_hex,,}" \
    --arg address "${expected_address,,}" \
    '((.transactionHash | ascii_downcase) == $tx) and
      ((.blockNumber | ascii_downcase) == $block) and
      ((.contractAddress | ascii_downcase) == $address) and (.status == "0x1")' \
    >/dev/null <<<"${receipt}"; then
    echo "${network_label}: deployment receipt does not match the public artifact." >&2
    return 1
  fi

  for read_round in 2 3; do
    repeated_transaction="$(rpc_result "${network_label}" "${rpc_url}" eth_getTransactionByHash \
      "[\"${deploy_tx_hash}\"]")" || return 1
    repeated_receipt="$(rpc_result "${network_label}" "${rpc_url}" eth_getTransactionReceipt \
      "[\"${deploy_tx_hash}\"]")" || return 1
    if [[ "$(jq -cS . <<<"${transaction}")" != "$(jq -cS . <<<"${repeated_transaction}")" || \
      "$(jq -cS . <<<"${receipt}")" != "$(jq -cS . <<<"${repeated_receipt}")" ]]; then
      echo "${network_label}: repeated deployment transaction/receipt read ${read_round} changed." >&2
      return 1
    fi
  done
  echo "${network_label}: deployment transaction and receipt passed three identical reads."
}

validate_historical_registry_range() {
  local network_label="$1"
  local rpc_url="$2"
  local address="$3"
  local start_block="$4"
  local head_hex
  local head_decimal
  local end_decimal
  local start_hex
  local end_hex
  local start_block_result
  local repeated_start_block
  local logs

  head_hex="$(rpc_result "${network_label}" "${rpc_url}" eth_blockNumber '[]')" || return 1
  head_hex="${head_hex//\"/}"
  head_decimal="$((head_hex))"
  end_decimal=$((start_block + 63))
  if (( end_decimal > head_decimal )); then
    end_decimal="${head_decimal}"
  fi
  start_hex="$(printf '0x%x' "${start_block}")"
  end_hex="$(printf '0x%x' "${end_decimal}")"

  start_block_result="$(rpc_result "${network_label}" "${rpc_url}" eth_getBlockByNumber \
    "[\"${start_hex}\",false]")" || return 1
  repeated_start_block="$(rpc_result "${network_label}" "${rpc_url}" eth_getBlockByNumber \
    "[\"${start_hex}\",false]")" || return 1
  if [[ "${start_block_result}" == "null" || \
    "$(jq -cS . <<<"${start_block_result}")" != "$(jq -cS . <<<"${repeated_start_block}")" ]]; then
    echo "${network_label}: start block ${start_block} is unavailable or inconsistent." >&2
    return 1
  fi

  logs="$(rpc_result "${network_label}" "${rpc_url}" eth_getLogs \
    "[{\"address\":\"${address}\",\"fromBlock\":\"${start_hex}\",\"toBlock\":\"${end_hex}\"}]")" || return 1
  if ! jq -e 'type == "array"' >/dev/null <<<"${logs}"; then
    echo "${network_label}: historical registry log range did not return an array." >&2
    return 1
  fi
  echo "${network_label}: historical block/log range ${start_hex}-${end_hex} is readable and repeatable."
}

validate_code() {
  local network_label="$1"
  local rpc_url="$2"
  local address="$3"
  local code

  code="$(rpc_result "${network_label}" "${rpc_url}" eth_getCode "[\"${address}\",\"latest\"]")" || return 1
  code="${code//\"/}"
  if [[ "${code}" == "0x" || "${code}" == "0x0" ]]; then
    echo "${network_label}: deployment artifact address has no latest bytecode." >&2
    return 1
  fi
  echo "${network_label}: deployment artifact address has latest bytecode."
}

probe_historical_code() {
  local network_label="$1"
  local rpc_url="$2"
  local address="$3"
  local start_block="$4"
  local block_hex
  local response
  local error_message

  block_hex="$(printf '0x%x' "${start_block}")"
  response="$(rpc_response "${network_label}" "${rpc_url}" eth_getCode "[\"${address}\",\"${block_hex}\"]")" || {
    echo "${network_label}: warning: historical eth_getCode transport probe failed at start block ${start_block}." >&2
    return 0
  }
  if jq -e '.error != null' >/dev/null <<<"${response}"; then
    error_message="$(jq -r '.error.message // "unspecified JSON-RPC error"' <<<"${response}")"
    echo "${network_label}: warning: historical state is unavailable at start block ${start_block}: ${error_message}" >&2
    echo "${network_label}: mappings are event-only; an actual Graph Node sync remains the decisive compatibility gate." >&2
    return 0
  fi
  if jq -e '.result != null and .result != "0x" and .result != "0x0"' >/dev/null <<<"${response}"; then
    echo "${network_label}: historical contract bytecode is available at start block ${start_block}."
  else
    echo "${network_label}: warning: no historical bytecode was returned at start block ${start_block}." >&2
  fi
}

validate_zero_g_evidence() {
  local artifact="$1"
  local address
  local source_transaction_hash
  local source_mint_block
  local expected_block_hex
  local receipt
  local receipt_block
  local block

  address="$(jq -r '.address' "${artifact}")"
  source_transaction_hash="$(jq -r '.sourceTransactionHash // empty' "${artifact}")"
  source_mint_block="$(jq -r '.sourceMintBlock // empty' "${artifact}")"
  if [[ ! "${source_transaction_hash}" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
    echo "0G Galileo: sourceTransactionHash is missing from the public evidence artifact." >&2
    return 1
  fi
  if [[ ! "${source_mint_block}" =~ ^[0-9]+$ ]]; then
    echo "0G Galileo: sourceMintBlock is missing from the public evidence artifact." >&2
    return 1
  fi

  receipt="$(rpc_result "0G Galileo" "${THEGRAPH_0G_RPC_URL}" eth_getTransactionReceipt \
    "[\"${source_transaction_hash}\"]")" || return 1
  if [[ "${receipt}" == "null" ]] || ! jq -e '.status == "0x1"' >/dev/null <<<"${receipt}"; then
    echo "0G Galileo: evidence transaction receipt is absent or unsuccessful." >&2
    return 1
  fi
  receipt_block="$(jq -r '.blockNumber' <<<"${receipt}")"
  expected_block_hex="$(printf '0x%x' "${source_mint_block}")"
  if [[ "${receipt_block,,}" != "${expected_block_hex,,}" ]]; then
    echo "0G Galileo: evidence receipt block ${receipt_block} does not match sourceMintBlock ${source_mint_block}." >&2
    return 1
  fi
  if ! jq -e --arg address "${address,,}" --arg topic "${TRANSFER_TOPIC}" \
    'any(.logs[]?; ((.address | ascii_downcase) == $address) and ((.topics[0] | ascii_downcase) == $topic))' \
    >/dev/null <<<"${receipt}"; then
    echo "0G Galileo: evidence receipt has no ERC-721 Transfer emitted by the configured contract." >&2
    return 1
  fi
  block="$(rpc_result "0G Galileo" "${THEGRAPH_0G_RPC_URL}" eth_getBlockByNumber \
    "[\"${receipt_block}\",false]")" || return 1
  if [[ "${block}" == "null" ]]; then
    echo "0G Galileo: evidence block is unavailable." >&2
    return 1
  fi
  echo "0G Galileo: successful evidence receipt, Transfer log, and source block verified."
}

failures=0
hedera_failures=0

if [[ "${network}" == "all" || "${network}" == "hedera" ]]; then
  validate_rpc "Hedera testnet" "${THEGRAPH_HEDERA_RPC_URL}" "0x128" || {
    failures=$((failures + 1))
    hedera_failures=$((hedera_failures + 1))
  }
  if node "${THEGRAPH_SCRIPT_DIR}/generate-manifests.mjs" --check --network hedera; then
    hedera_address="$(jq -r '.address' "${THEGRAPH_HEDERA_DEPLOYMENT_ARTIFACT}")"
    hedera_start_block="$(jq -r '.startBlock // .deployBlock // .deploymentBlock' "${THEGRAPH_HEDERA_DEPLOYMENT_ARTIFACT}")"
    validate_code "Hedera testnet" "${THEGRAPH_HEDERA_RPC_URL}" "${hedera_address}" || {
      failures=$((failures + 1))
      hedera_failures=$((hedera_failures + 1))
    }
    validate_deployment_transaction \
      "Hedera testnet" "${THEGRAPH_HEDERA_RPC_URL}" "${THEGRAPH_HEDERA_DEPLOYMENT_ARTIFACT}" || {
      failures=$((failures + 1))
      hedera_failures=$((hedera_failures + 1))
    }
    probe_historical_code "Hedera testnet" "${THEGRAPH_HEDERA_RPC_URL}" "${hedera_address}" "${hedera_start_block}"
    validate_historical_registry_range \
      "Hedera testnet" "${THEGRAPH_HEDERA_RPC_URL}" "${hedera_address}" "${hedera_start_block}" || {
      failures=$((failures + 1))
      hedera_failures=$((hedera_failures + 1))
    }
  else
    failures=$((failures + 1))
    hedera_failures=$((hedera_failures + 1))
  fi
fi

if [[ "${network}" == "all" || "${network}" == "0g" ]]; then
  validate_rpc "0G Galileo" "${THEGRAPH_0G_RPC_URL}" "0x40da" || failures=$((failures + 1))
  if node "${THEGRAPH_SCRIPT_DIR}/generate-manifests.mjs" --check --network 0g; then
    zero_g_address="$(jq -r '.address' "${THEGRAPH_0G_DEPLOYMENT_ARTIFACT}")"
    zero_g_start_block="$(jq -r '.startBlock' "${THEGRAPH_0G_DEPLOYMENT_ARTIFACT}")"
    validate_code "0G Galileo" "${THEGRAPH_0G_RPC_URL}" "${zero_g_address}" || failures=$((failures + 1))
    validate_deployment_transaction \
      "0G Galileo" "${THEGRAPH_0G_RPC_URL}" "${THEGRAPH_0G_DEPLOYMENT_ARTIFACT}" || failures=$((failures + 1))
    probe_historical_code "0G Galileo" "${THEGRAPH_0G_RPC_URL}" "${zero_g_address}" "${zero_g_start_block}"
    validate_zero_g_evidence "${THEGRAPH_0G_DEPLOYMENT_ARTIFACT}" || failures=$((failures + 1))
  else
    failures=$((failures + 1))
  fi
fi

if (( failures > 0 )); then
  # Keep the summary and terminal readiness marker on the same stream so
  # automation can reliably treat the final line as the machine-readable gate.
  echo "The Graph preflight failed with ${failures} blocking check(s) for ${network}."
  if [[ "${network}" == "all" || "${network}" == "hedera" ]]; then
    if (( hedera_failures > 0 )); then
      echo "HEDERA_GRAPH_RPC_BLOCKED"
    else
      echo "HEDERA_GRAPH_RPC_READY"
    fi
  fi
  exit 1
fi

echo "The Graph preflight passed for ${network}; warnings remain visible and live sync is still required."
if [[ "${network}" == "all" || "${network}" == "hedera" ]]; then
  echo "HEDERA_GRAPH_RPC_READY"
fi
