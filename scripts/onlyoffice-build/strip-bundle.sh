#!/usr/bin/env bash
# Strip the v9 bundle down to what mvp-onlyoffice actually uses.
#
# mvp-onlyoffice is an embedded, client-only editor for DOCX/XLSX/PPTX —
# the Help menu, PDF/Visio editors, and most fonts shipped by the official
# image are dead weight. Matches the v7 footprint (~150M vs ~1GB unstripped).
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/versions.env"

TARGET_DIR="$REPO_ROOT/public/packages/onlyoffice/${TARGET_VERSION_DIR}"

if [[ ! -d "$TARGET_DIR/web-apps" ]]; then
  echo "ERROR: $TARGET_DIR/web-apps not found — run extract-documentserver.sh first" >&2
  exit 1
fi

echo ">> Stripping help docs (loaded by Help menu — unused in embedded mode)"
# ~508M across all editor language packs
find "$TARGET_DIR/web-apps/apps" -type d -name help -prune -exec rm -rf {} +

echo ">> Stripping PDF + Visio editors (mvp handles DOCX/XLSX/PPTX only)"
# ~95M — sdkjs/pdf, sdkjs/visio, web-apps/apps/pdfeditor, web-apps/apps/visioeditor
rm -rf \
  "$TARGET_DIR/web-apps/apps/pdfeditor" \
  "$TARGET_DIR/web-apps/apps/visioeditor" \
  "$TARGET_DIR/sdkjs/pdf" \
  "$TARGET_DIR/sdkjs/visio"

echo ">> Done. Final sizes:"
du -sh "$TARGET_DIR"/* 2>/dev/null || true
echo "   total: $(du -sh "$TARGET_DIR" | cut -f1)"
