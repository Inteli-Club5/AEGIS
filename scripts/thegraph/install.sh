#!/usr/bin/env bash

set -euo pipefail
source "$(dirname "$0")/common.sh"

require_command npm

npm --prefix "${THEGRAPH_HEDERA_SUBGRAPH_DIR}" install
npm --prefix "${THEGRAPH_0G_SUBGRAPH_DIR}" install

"${THEGRAPH_HEDERA_CLI}" --version
"${THEGRAPH_0G_CLI}" --version
