# OnlyOffice asset build pipeline

Produces `public/packages/onlyoffice/<TARGET_VERSION_DIR>/` from upstream OnlyOffice
DocumentServer + CryptPad's x2t WASM build.

## Pinned versions

Edit `versions.env` to bump. The DocumentServer image and the x2t WASM tag must
stay on the same OnlyOffice minor (e.g. 9.3.x ↔ v9.3.0+0) — the x2t bin format
ships with the editor runtime, and mismatched versions silently break document
load/save.

| Component        | Source                                       | Currently pinned |
| ---------------- | -------------------------------------------- | ---------------- |
| `web-apps`       | `onlyoffice/documentserver` Docker image      | 9.3.1            |
| `sdkjs`          | same                                          | 9.3.1            |
| `fonts`          | same                                          | 9.3.1            |
| `wasm/x2t`       | `cryptpad/onlyoffice-x2t-wasm` GitHub release | v9.3.0+0         |

## Prerequisites

- Docker daemon running (image is ~2.9 GB, pulled once)
- `gh` CLI authenticated (`gh auth status`)
- `unzip`, `gzip`, `sha512sum` (standard on Linux/macOS)

## Usage

```bash
./scripts/onlyoffice-build/build.sh
```

Runs three stages: extract → fetch x2t → strip. Outputs to
`public/packages/onlyoffice/9/{web-apps,sdkjs,fonts,wasm}/` and writes
`MANIFEST.txt` recording the source image digest.

To run a single stage:

```bash
./scripts/onlyoffice-build/extract-documentserver.sh   # web-apps + sdkjs + fonts (~1GB)
./scripts/onlyoffice-build/fetch-x2t-wasm.sh           # WASM converter (~51M)
./scripts/onlyoffice-build/strip-bundle.sh             # drop help/PDF/Visio → ~414M
```

The strip step removes help docs (~508M, surfaced by the Help menu we
don't render) and the PDF + Visio editors (~95M, mvp only handles
DOCX/XLSX/PPTX). Skip it if you want the full editor surface.

## What the build does NOT include

- **Commercial fonts** (Arial, Times New Roman, etc.) are referenced by name but
  not shipped — see the project root README. Drop your own font files into
  `public/packages/onlyoffice/9/fonts/` to render documents that name them.
- **No source-from-build** — we extract from the official Docker image rather
  than building sdkjs/web-apps from source. Building from source requires Python
  3 (sdkjs) and Node + Grunt (web-apps); see `docs/upgrading.md` if we ever need
  to patch upstream.

## License

OnlyOffice DocumentServer is AGPL-3.0. Redistributing the extracted assets in a
client-only context is permitted under that license — keep this directory's
copyright headers intact, and ensure the consuming application also complies
(this repo's `LICENSE` is AGPL-3.0, so we're aligned).
