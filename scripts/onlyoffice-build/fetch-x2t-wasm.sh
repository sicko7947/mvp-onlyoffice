#!/usr/bin/env bash
# Fetch the prebuilt x2t WASM bundle from cryptpad/onlyoffice-x2t-wasm,
# verify the SHA512, unpack into public/packages/onlyoffice/$TARGET_VERSION_DIR/wasm/x2t/,
# and (re)generate the gzip variant the loader expects.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/versions.env"

TARGET_DIR="$REPO_ROOT/public/packages/onlyoffice/${TARGET_VERSION_DIR}/wasm/x2t"
WORK_DIR="$(mktemp -d -t x2t-fetch.XXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT

echo ">> Downloading $X2T_WASM_TAG from $X2T_WASM_REPO"
gh release download "$X2T_WASM_TAG" \
  --repo "$X2T_WASM_REPO" \
  --dir "$WORK_DIR" \
  --pattern 'x2t.zip' \
  --pattern 'x2t.zip.sha512'

echo ">> Verifying SHA512"
(cd "$WORK_DIR" && sha512sum -c x2t.zip.sha512)

echo ">> Unpacking into $TARGET_DIR"
rm -rf "$TARGET_DIR"
mkdir -p "$TARGET_DIR"
unzip -q "$WORK_DIR/x2t.zip" -d "$TARGET_DIR"

echo ">> Regenerating x2t.wasm.gz (release ships .br only; loader expects .gz)"
if [[ ! -f "$TARGET_DIR/x2t.wasm" ]]; then
  echo "ERROR: x2t.wasm missing after unpack" >&2
  exit 1
fi
gzip -kf -9 "$TARGET_DIR/x2t.wasm"

echo ">> Done. Contents:"
ls -lh "$TARGET_DIR"
