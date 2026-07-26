#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"

# Persistent volumes are intentionally retained. Removing them requires an explicit manual command.
docker compose -f "${THEGRAPH_COMPOSE_FILE}" down
