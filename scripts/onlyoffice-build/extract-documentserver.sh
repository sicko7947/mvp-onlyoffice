#!/usr/bin/env bash
# Extract web-apps + sdkjs + fonts from an official OnlyOffice DocumentServer Docker image
# and write them into public/packages/onlyoffice/$TARGET_VERSION_DIR/.
#
# Reproducible: same image tag = same output. No network calls beyond the Docker registry.
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &>/dev/null && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# shellcheck disable=SC1091
source "$SCRIPT_DIR/versions.env"

# BSD sed (macOS) requires an explicit empty backup suffix; GNU sed does not.
if sed --version 2>/dev/null | grep -q 'GNU sed'; then
  SED_I=(sed -i)
else
  SED_I=(sed -i '')
fi

IMAGE="${DOCUMENTSERVER_IMAGE}:${DOCUMENTSERVER_VERSION}"
TARGET_DIR="$REPO_ROOT/public/packages/onlyoffice/${TARGET_VERSION_DIR}"
SOURCE_ROOT="/var/www/onlyoffice/documentserver"
CONTAINER_NAME="oo-extract-$$"

echo ">> Pulling $IMAGE (skip if cached)"
docker pull "$IMAGE"

echo ">> Preparing target $TARGET_DIR"
# Docker-extracted files are often root-owned and read-only; chmod before rm.
chmod -R u+w "$TARGET_DIR" 2>/dev/null || true
rm -rf "$TARGET_DIR/web-apps" "$TARGET_DIR/sdkjs" "$TARGET_DIR/fonts"
mkdir -p "$TARGET_DIR"

echo ">> Streaming web-apps + sdkjs out of the image (tar pipe)"
# `docker cp` leaves the top-level directories with read-only perms (555) which
# breaks any follow-up writes. Streaming via tar lets us re-set sane perms on the
# host side.
docker run --rm --entrypoint /bin/sh "$IMAGE" -c \
  "cd $SOURCE_ROOT && tar -cf - web-apps sdkjs" \
  | tar -xf - -C "$TARGET_DIR"
chmod -R u+w "$TARGET_DIR/web-apps" "$TARGET_DIR/sdkjs"

echo ">> Generating runtime assets via short-lived container boot"
# Several assets are generated at container startup, not baked into the image:
#   - fonts/  + sdkjs/common/AllFonts.js  (font cache scan)
#   - sdkjs/slide/themes/themeN/  + themes.js  (compiled from src/*.pptx via x2t)
# Boot the image, poll until all are present, then snapshot.
GEN_CONTAINER="oo-genassets-$$"
docker run -d --name "$GEN_CONTAINER" "$IMAGE" >/dev/null
trap 'docker rm -f "$GEN_CONTAINER" >/dev/null 2>&1 || true' EXIT
echo "   waiting for fonts + themes generation (up to 2min)..."
for _ in $(seq 1 60); do
  if docker exec "$GEN_CONTAINER" sh -c \
      "test -f $SOURCE_ROOT/sdkjs/common/AllFonts.js && \
       test -f $SOURCE_ROOT/sdkjs/slide/themes/themes.js" 2>/dev/null; then
    break
  fi
  sleep 2
done
# Extra wait — themes.js appearing is the sentinel, but individual .theme files
# may still be flushed to disk for a few seconds after. Give generation time to settle.
sleep 8
docker exec "$GEN_CONTAINER" sh -c \
  "cd $SOURCE_ROOT && tar --warning=no-file-changed -cf - fonts sdkjs/common/AllFonts.js sdkjs/slide/themes 2>/dev/null; true" \
  | tar -xf - -C "$TARGET_DIR"
chmod -R u+w "$TARGET_DIR/fonts" "$TARGET_DIR/sdkjs/slide/themes"
docker rm -f "$GEN_CONTAINER" >/dev/null 2>&1 || true
trap - EXIT

echo ">> Substituting {{HASH_POSTFIX}} placeholders"
# DocumentServer ships api.js.tpl that nginx normally rewrites with a cache-buster
# hash. We bake an empty string — assets are versioned by path (/9/).
if [[ -f "$TARGET_DIR/web-apps/apps/api/documents/api.js.tpl" ]]; then
  sed 's/{{HASH_POSTFIX}}//g' \
    "$TARGET_DIR/web-apps/apps/api/documents/api.js.tpl" \
    > "$TARGET_DIR/web-apps/apps/api/documents/api.js"
  rm "$TARGET_DIR/web-apps/apps/api/documents/api.js.tpl"
fi

echo ">> Copying service worker to package root (nginx aliases it from /)"
# sdkjs registers a ServiceWorker at <package_root>/document_editor_service_worker.js
# but the file actually lives under sdkjs/common/serviceworker/. Upstream nginx
# aliases it; we just copy.
if [[ -f "$TARGET_DIR/sdkjs/common/serviceworker/document_editor_service_worker.js" ]]; then
  cp "$TARGET_DIR/sdkjs/common/serviceworker/document_editor_service_worker.js" \
     "$TARGET_DIR/document_editor_service_worker.js"
fi

echo ">> Neutralizing baked-in version path injection in api.js"
# api.js v9 calls extendAppPath() which splices "/9.3.1-/" between the package
# root and "/web-apps/app...". Upstream nginx aliases that segment back to the
# real dir for cache-busting; we serve flat statics so the segment 404s. Empty
# the const so the function falls through to `return path`.
"${SED_I[@]}" "s|const ver = '/${DOCUMENTSERVER_VERSION}-';|const ver = '';|g" \
  "$TARGET_DIR/web-apps/apps/api/documents/api.js"

echo ">> Patching x2t.js pre-js URL constructor"
# v9 pre-js does `new URL(myScript.getAttribute("src"))` to grab ?cache-buster
# off its own <script> tag. getAttribute returns the raw (relative) value, so
# URL() throws without a base. Use `.src` (resolved absolute URL) plus a base
# arg + try/catch so it degrades to empty suffix instead of blowing up init.
X2T_JS="$TARGET_DIR/wasm/x2t/x2t.js"
if [[ -f "$X2T_JS" ]]; then
  "${SED_I[@]}" 's|const mySrc=myScript.getAttribute("src");suffix=new URL(mySrc).search|const mySrc=document.currentScript.src;try{suffix=new URL(mySrc,location.href).search}catch{suffix=""}|g' \
    "$X2T_JS"
fi

echo ">> Writing manifest"
cat > "$TARGET_DIR/MANIFEST.txt" <<EOF
documentserver_image: $IMAGE
documentserver_digest: $(docker inspect --format='{{.Id}}' "$IMAGE")
extracted_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

echo ">> Done. Sizes:"
du -sh "$TARGET_DIR"/* 2>/dev/null || true
