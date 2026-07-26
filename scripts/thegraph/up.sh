#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"

docker compose -f "${THEGRAPH_COMPOSE_FILE}" up -d graph-postgres ipfs graph-node
