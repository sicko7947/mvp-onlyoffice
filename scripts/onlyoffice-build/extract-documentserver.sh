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

IMAGE="${DOCUMENTSERVER_IMAGE}:${DOCUMENTSERVER_VERSION}"
TARGET_DIR="$REPO_ROOT/public/packages/onlyoffice/${TARGET_VERSION_DIR}"
SOURCE_ROOT="/var/www/onlyoffice/documentserver"
CONTAINER_NAME="oo-extract-$$"

echo ">> Pulling $IMAGE (skip if cached)"
docker pull "$IMAGE"

echo ">> Preparing target $TARGET_DIR"
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

echo ">> Generating fonts via short-lived container boot"
# `fonts/` and `sdkjs/common/AllFonts.js` are generated at container startup
# (postinstall hook scans /usr/share/fonts + bundled fonts). We boot the image
# briefly, wait for the marker line, then snapshot.
GEN_CONTAINER="oo-genfonts-$$"
docker run -d --name "$GEN_CONTAINER" "$IMAGE" >/dev/null
trap 'docker rm -f "$GEN_CONTAINER" >/dev/null 2>&1 || true' EXIT
echo "   waiting for AllFonts generation marker..."
for _ in $(seq 1 60); do
  if docker logs "$GEN_CONTAINER" 2>&1 | grep -q "Generating AllFonts.js, please wait...Done"; then
    break
  fi
  sleep 2
done
docker exec "$GEN_CONTAINER" sh -c \
  "cd $SOURCE_ROOT && tar -cf - fonts sdkjs/common/AllFonts.js" \
  | tar -xf - -C "$TARGET_DIR"
chmod -R u+w "$TARGET_DIR/fonts"
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

echo ">> Writing manifest"
cat > "$TARGET_DIR/MANIFEST.txt" <<EOF
documentserver_image: $IMAGE
documentserver_digest: $(docker inspect --format='{{.Id}}' "$IMAGE")
extracted_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF

echo ">> Done. Sizes:"
du -sh "$TARGET_DIR"/* 2>/dev/null || true
