#!/usr/bin/env bash
# Build the full OnlyOffice v9 asset bundle: extract DocumentServer assets,
# then drop in the prebuilt x2t WASM. Versions are pinned in versions.env.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"

"$SCRIPT_DIR/extract-documentserver.sh"
"$SCRIPT_DIR/fetch-x2t-wasm.sh"
"$SCRIPT_DIR/strip-bundle.sh"

echo
echo "✓ OnlyOffice asset bundle built. Loader entry points:"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/versions.env"
echo "  /packages/onlyoffice/${TARGET_VERSION_DIR}/web-apps/apps/api/documents/api.js"
echo "  /packages/onlyoffice/${TARGET_VERSION_DIR}/wasm/x2t/x2t.js"
