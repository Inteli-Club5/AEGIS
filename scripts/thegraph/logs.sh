#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"

docker compose -f "${THEGRAPH_COMPOSE_FILE}" logs --follow graph-node ipfs graph-postgres
