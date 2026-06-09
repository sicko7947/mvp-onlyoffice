# MVP OnlyOffice

> 📖 English | [中文](README.zh.md)

🌐 **Live Demo**: https://mvp-onlyoffice.vercel.app/

A browser-based document processing solution built on the OnlyOffice technology stack, supporting document viewing, editing, and conversion entirely on the client side. All operations are performed on the user's device without requiring backend services.

## ⚡ Developer Quick Start

> **First-time setup required.** The OnlyOffice assets (~1 GB) are not stored in this repo. You must run the asset build script **once** before `dev` or `build` will work — skipping this step causes a blank page with JS errors.

### Prerequisites

| Tool | Required for | Install |
|------|-------------|---------|
| [Docker](https://docs.docker.com/get-docker/) | Asset build (`build.sh`) — pulls ~2.9 GB image once | `brew install --cask docker` |
| [gh CLI](https://cli.github.com/) | Asset build — downloads x2t WASM release | `brew install gh && gh auth login` |
| [bun](https://bun.sh/) | Installing JS deps + running dev server | `curl -fsSL https://bun.sh/install \| bash` |
| `unzip`, `gzip` | Asset build | pre-installed on macOS |

### Setup (run once)

```bash
# 1. Clone
git clone <repository-url>
cd mvp-onlyoffice

# 2. Build OnlyOffice assets — takes 2–5 min on first run (Docker image pull)
./scripts/onlyoffice-build/build.sh

# 3. Install JS dependencies
bun install

# 4. Start dev server
bun dev
# → http://localhost:3001
```

### What build.sh does

```
extract-documentserver.sh   pull onlyoffice/documentserver:9.3.1, extract web-apps + sdkjs + fonts  (~1 GB)
fetch-x2t-wasm.sh           download cryptpad/onlyoffice-x2t-wasm v9.3.0+0 release                  (~51 MB)
strip-bundle.sh             remove help docs + PDF/Visio editors (not used in MVP)                   → ~414 MB final
```

Output lands in `public/packages/onlyoffice/9/` (gitignored — rebuild any time with `build.sh`).

### Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Blank page / `Cannot find module` | Assets not built | Run `./scripts/onlyoffice-build/build.sh` |
| `docker: command not found` | Docker not installed | Install Docker Desktop |
| `gh: command not found` | gh CLI missing | `brew install gh && gh auth login` |
| Editor loads but documents fail to open | Version mismatch (DocumentServer vs x2t WASM) | Check `scripts/onlyoffice-build/versions.env` — both must be same minor version |
| Font shows as fallback | Custom font not placed | Put font file in `public/packages/onlyoffice/9/fonts/<index>` (see Font Configuration) |

---

## 🎯 Core Advantages

- 🛡️ **Data Security**: Document processing is completed entirely within the browser, data never leaves the local environment
- 📄 **Format Compatibility**: Comprehensive support for mainstream office document formats including Word, Excel, PowerPoint, and more
- 🔄 **Instant Response**: Provides smooth document editing interaction experience
- 💻 **Zero Deployment Cost**: Client-side architecture, no server setup required
- ⚡ **Quick Start**: Access the page and use immediately, no additional configuration needed
- 🌏 **Internationalization**: Built-in multi-language interface with free language switching
- 🎯 **Multi-Instance Support**: Supports running multiple independent editor instances simultaneously with complete resource isolation

## 📘 User Guide

### Quick Start

1. Visit the [Online Editor](https://mvp-onlyoffice.vercel.app/)
2. Select editor type:
   - `/excel/base` - Excel spreadsheet editor
   - `/docs/base` - Word document editor
   - `/ppt/base` - PowerPoint presentation editor
   - `/multi/base` - Multi-instance basic demo (running multiple editors simultaneously)
   - `/multi/tabs` - Multi-instance Tab demo (with cache management)
3. Upload local files
4. Edit document content directly in the browser
5. Export and save the document after editing

### URL Parameter Configuration

| Parameter | Description              | Values      | Priority |
| --------- | ------------------------ | ----------- | -------- |
| `locale`  | Specify interface language | `en`, `zh` | -        |

**Usage Example:**

```bash
# Set English interface
?locale=en
```

## 🔌 API Documentation

### Editor Manager (EditorManager & EditorManagerFactory)

The editor manager provides a complete document operation interface, supporting core functions such as creation, destruction, and export. Supports both single-instance and multi-instance modes.

#### Single-Instance Mode (Backward Compatible)

```typescript
import { editorManagerFactory } from '@/onlyoffice-comp/lib/editor-manager';

// Get default instance
const editorManager = editorManagerFactory.getDefault();

// Check if editor has been created
const exists = editorManager.exists();

// Get editor instance
const editor = editorManager.get();

// Destroy editor
editorManager.destroy();
```

#### Multi-Instance Mode

```typescript
import { editorManagerFactory } from '@/onlyoffice-comp/lib/editor-manager';

// Create or get instance with specified container ID
const manager1 = editorManagerFactory.create('editor-1');
const manager2 = editorManagerFactory.create('editor-2');

// Get instance with specified container ID
const manager = editorManagerFactory.get('editor-1');

// Get all instances
const allManagers = editorManagerFactory.getAll();

// Destroy specified instance
editorManagerFactory.destroy('editor-1');

// Destroy all instances
editorManagerFactory.destroyAll();
```

#### Document Export

Document export uses an event-driven mechanism with asynchronous communication through EventBus.

**Export Process:**

1. **Trigger Save**: Call the `editorManager.export()` method
2. **Wait for Event**: System listens for `saveDocument` event
3. **Get Data**: Returns document binary data after event is triggered

**Code Example:**

```typescript
// Single-instance mode
const editorManager = editorManagerFactory.getDefault();
const result = await editorManager.export();
// result contains: { fileName, fileType, binData, instanceId, media }

// Multi-instance mode
const manager1 = editorManagerFactory.get('editor-1');
const result1 = await manager1.export();
// result1.instanceId will match manager1.getInstanceId()

// Process export data
const blob = new Blob([result.binData], {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
});
const url = window.URL.createObjectURL(blob);
// Perform download or other operations
```

**Multi-Instance Export Mechanism:**

In multi-instance mode, each `EditorManager` instance's `export()` method automatically filters `SAVE_DOCUMENT` events, only receiving save events belonging to the current instance (matched via `instanceId` field). This ensures that even when multiple instances call `export()` simultaneously, there will be no event confusion or data misalignment.

#### Read-Only Mode Control

```typescript
// Set to read-only mode
await editorManager.setReadOnly(true);

// Switch to editable mode
await editorManager.setReadOnly(false);

// Query current mode
const isReadOnly = editorManager.getReadOnly();
```

### Event Bus (EventBus)

The project uses an event bus mechanism to handle editor state changes and document operation events.

#### Supported Event Types

- `saveDocument` - Document save completion event
- `documentReady` - Document load ready event
- `loadingChange` - Loading state change event

#### Event Listening

```typescript
import { onlyofficeEventbus } from '@/onlyoffice-comp/lib/eventbus';
import { ONLYOFFICE_EVENT_KEYS } from '@/onlyoffice-comp/lib/const';

// Listen for document save event
onlyofficeEventbus.on(ONLYOFFICE_EVENT_KEYS.SAVE_DOCUMENT, (data) => {
  console.log('Document saved:', data);
});

// Listen for document ready event
onlyofficeEventbus.on(ONLYOFFICE_EVENT_KEYS.DOCUMENT_READY, (data) => {
  console.log('Document ready:', data);
});

// Remove event listener
onlyofficeEventbus.off(ONLYOFFICE_EVENT_KEYS.SAVE_DOCUMENT, callback);

// Wait for event trigger (returns Promise)
const saveData = await onlyofficeEventbus.waitFor(
  ONLYOFFICE_EVENT_KEYS.SAVE_DOCUMENT, 
  3000 // Timeout (milliseconds)
);
```

### Document Conversion (X2T Converter)

Document conversion functionality is implemented based on WebAssembly, supporting conversion between multiple formats.

```typescript
import { convertBinToDocument, createEditorView } from '@/onlyoffice-comp/lib/x2t';

// Single-instance mode: Create editor view (using default container)
await createEditorView({
  file: fileObject,        // File object (optional)
  fileName: 'document.xlsx', // File name
  isNew: false,            // Whether to create new document
  readOnly: false,        // Whether read-only
  lang: 'en',             // Interface language
});

// Multi-instance mode: Create editor view (specify container ID)
const manager1 = await createEditorView({
  file: fileObject,
  fileName: 'document.xlsx',
  isNew: false,
  readOnly: false,
  lang: 'en',
  containerId: 'editor-1', // Specify container ID
});

// Convert document format
const result = await convertBinToDocument(
  binData,      // Binary data
  fileName,      // File name
  FILE_TYPE.XLSX, // Target format
  media         // Media files (optional)
);
```

### Data Type Definitions

```typescript
// Document save data
type SaveDocumentData = {
  fileName: string;      // File name
  fileType: string;      // File type (e.g., 'xlsx', 'docx')
  binData: Uint8Array;   // Binary data
  instanceId: string;    // Instance ID (used for event matching in multi-instance mode)
  media?: Record<string, string>; // Media file mapping
}

// Document ready data
type DocumentReadyData = {
  fileName: string;      // File name
  fileType: string;      // File type
}
```

## 🏗️ Technical Implementation

- **OnlyOffice SDK**: Integrates OnlyOffice v9 JavaScript SDK (v7 available as opt-in), providing core document editing capabilities
- **WebAssembly**: Uses x2t-wasm module to implement document format conversion functionality
- **Client-Side Architecture**: All functional modules run in the browser environment without server dependencies
- **Single-User Mode**: Mock collaboration server uses a sentinel observer (`hk-1`) so the SDK enters fast-path single-user mode — all edit operations (newline, formatting, etc.) commit without a server lock round-trip
- **In-Place Read-Only Toggle**: `setReadOnly()` calls the SDK's `asc_setViewMode()` directly, preserving unsaved edits without destroying/recreating the editor

### Version Selection

The project supports OnlyOffice v7 and v9:

- **v9 (default)**: Recommended. Passes the full smoke test suite including round-trip conversion, scoped multi-instance exports, in-place read-only toggle, and image paste callbacks.
- **v7 (opt-in)**: Available for legacy compatibility. Set at build time via environment variable:

```bash
NEXT_PUBLIC_ONLYOFFICE_VERSION=7 npm run build
```

## 🚀 Deployment Options

### Asset Build Pipeline (Required First Step)

The OnlyOffice asset bundle (~1 GB) is **not vendored** in the repository. You must build it locally before running or deploying.

**Prerequisites:**
- Docker daemon running (image is ~2.9 GB, pulled once)
- `gh` CLI authenticated (`gh auth status`)
- `unzip`, `gzip`, `sha512sum` (standard on Linux/macOS)

```bash
# Build all assets (runs extract → fetch x2t → strip)
./scripts/onlyoffice-build/build.sh
```

This outputs to `public/packages/onlyoffice/9/{web-apps,sdkjs,fonts,wasm}/` and writes a `MANIFEST.txt` recording the source image digest.

**Individual stages:**
```bash
./scripts/onlyoffice-build/extract-documentserver.sh  # web-apps + sdkjs + fonts (~1GB)
./scripts/onlyoffice-build/fetch-x2t-wasm.sh          # WASM converter (~51MB)
./scripts/onlyoffice-build/strip-bundle.sh            # drop help/PDF/Visio → ~414MB
```

**Version pinning** (`scripts/onlyoffice-build/versions.env`):
```
DOCUMENTSERVER_VERSION=9.3.1   # DocumentServer Docker image version
X2T_WASM_TAG=v9.3.0+0          # Must match same minor as DOCUMENTSERVER_VERSION
```

> **Important**: DocumentServer and x2t WASM must be pinned to the same minor version (e.g. 9.3.x ↔ v9.3.0+0). Mismatched versions silently break document load/save.

### Vercel Deployment

```bash
# 1. Build assets first
./scripts/onlyoffice-build/build.sh

# 2. Install dependencies
pnpm install

# 3. Build project
npm run build

# Vercel will automatically detect and deploy
```

Access URL: https://mvp-onlyoffice.vercel.app/

### Static File Deployment

```bash
# 1. Build assets (required)
./scripts/onlyoffice-build/build.sh

# 2. Build static files
npm run build

# Output directory: out/
# Can be directly deployed to GitHub Pages, Netlify, Nginx, etc.
```

### Local Development

See [Developer Quick Start](#️-developer-quick-start) at the top of this document for the full setup walkthrough including prerequisites and troubleshooting.

## 🛠️ Build Tools

### File Compression Script (`scripts/minify.js`)

A utility script for compressing files in a folder (excluding WASM files) to reduce bundle size. This script recursively processes directories and compresses JavaScript, HTML, CSS, and other text-based files.

#### Features

- **Multi-format Support**: Compresses `.js`, `.html`, `.mjs`, `.cjs`, `.ts`, `.jsx`, `.tsx`, `.css` files
- **Smart Compression**:
  - JavaScript/TypeScript: Uses `terser` for minification (without variable name mangling to avoid breaking code)
  - CSS: Uses `postcss` + `cssnano` for optimization
  - HTML: Uses `html-minifier-terser` for minification
- **Safe Processing**: Automatically falls back to copying original files if compression fails
- **Detailed Statistics**: Provides comprehensive compression statistics including file counts and size reduction percentages
- **WASM Files Preserved**: Automatically skips WASM files to prevent corruption

#### Usage

```bash
# Specify source and target directories
node scripts/minify.js <sourceDir> <targetDir>

# Example: Compress v9 bundle
node scripts/minify.js ./public/packages/onlyoffice/9 ./public/packages/onlyoffice/9-minify
```

#### Compression Configuration

- **JavaScript/TypeScript**: Removes comments, preserves console/debugger statements, no variable name mangling (safe for OnlyOffice SDK)
- **CSS**: Full CSS optimization via cssnano
- **HTML**: Removes comments, collapses whitespace, preserves attribute quotes and structure

#### Output

The script provides real-time progress updates and a final summary including total files processed, compressed/copied counts, original vs. compressed size, and overall reduction percentage.

### Smoke Tests (`scripts/oo-*.mjs`)

Browser-driven test scripts that verify editor functionality via Chrome DevTools Protocol:

| Script | What it tests |
|--------|--------------|
| `oo-roundtrip.mjs` | DOCX/XLSX/PPTX format round-trip conversion |
| `oo-multi-export.mjs` | Multi-instance export isolation (no cross-instance data leakage) |
| `oo-ro-export.mjs` | Read-only mode + export of unsaved edits |
| `oo-img-probe.mjs` | Image paste and media embedding |
| `oo-binfmt.mjs` | Binary format inspection and validation |
| `ppt-cdp-probe.mjs` | PowerPoint-specific CDP probing |

## 📝 Project Structure

```
mvp-onlyoffice/
├── src/
│   ├── app/              # Next.js application pages
│   │   ├── excel/base/          # Excel editor (/excel/base)
│   │   ├── docs/base/           # Word editor (/docs/base)
│   │   ├── ppt/base/            # PowerPoint editor (/ppt/base)
│   │   ├── multi/
│   │   │   ├── base/            # Multi-instance basic demo (/multi/base)
│   │   │   └── tabs/            # Multi-instance Tab demo (/multi/tabs)
│   │   ├── onlyoffice-service/  # iframe service host page (/onlyoffice-service)
│   │   ├── service/onlyoffice/  # iframe service implementation (/service/onlyoffice)
│   │   ├── smoke/               # Smoke test runner page (/smoke)
│   │   └── page.tsx             # Home page (redirects to /excel/base)
│   ├── onlyoffice-comp/  # OnlyOffice component library
│   │   └── lib/
│   │       ├── editor-manager.ts  # Editor manager (supports multi-instance)
│   │       ├── x2t.ts             # Document conversion module
│   │       ├── eventbus.ts        # Event bus
│   │       └── ...
│   └── components/       # Common components
├── public/
│   └── packages/onlyoffice/
│       └── 9/            # OnlyOffice v9 assets (generated — not in git)
│           ├── web-apps/ # OnlyOffice web application resources
│           ├── sdkjs/    # OnlyOffice JavaScript SDK
│           ├── fonts/    # Font configuration
│           └── wasm/     # x2t WebAssembly converter
└── scripts/
    ├── onlyoffice-build/ # Asset build pipeline (Docker-based)
    │   ├── build.sh              # One-shot build (all stages)
    │   ├── extract-documentserver.sh
    │   ├── fetch-x2t-wasm.sh
    │   ├── strip-bundle.sh
    │   └── versions.env          # Pinned versions
    ├── minify.js         # Bundle compression script
    └── oo-*.mjs          # Smoke test scripts (CDP-driven)
```

### Page Routes

| Route | Description |
|-------|-------------|
| `/` | Home — redirects to `/excel/base` |
| `/excel/base` | Excel spreadsheet editor (single-instance) |
| `/docs/base` | Word document editor (single-instance) |
| `/ppt/base` | PowerPoint presentation editor (single-instance) |
| `/multi/base` | Multi-instance demo — multiple independent editors simultaneously |
| `/multi/tabs` | Multi-instance Tab demo — LRU-cached multi-tab editor |
| `/onlyoffice-service` | iframe service host page |
| `/service/onlyoffice` | iframe service implementation (runs editor in isolated frame) |
| `/smoke` | Smoke test runner for v7/v9 feature verification |

## 🔤 Font Configuration

### Font File Description

This project complies with open-source licensing requirements and **does not include** copyrighted commercial font files (such as Arial, Times New Roman, Microsoft YaHei, SimSun, etc.). These font names are still retained in the configuration to ensure document compatibility, but actual font files need to be added by users.

### Adding Font Files

To add fonts, follow these steps:

1. Check the `public/packages/onlyoffice/9/sdkjs/common/AllFonts.js` file
2. Find the target font's index number in the `__fonts_files` array
3. Place the font file in the `public/packages/onlyoffice/9/fonts/` directory
4. Rename the file to the corresponding index number (no extension needed)

**Example: Adding Arial Font**

- Arial regular font index is `223` → Place file as `public/packages/onlyoffice/9/fonts/223`
- Arial bold index is `226` → Place file as `public/packages/onlyoffice/9/fonts/226`
- Arial italic index is `224` → Place file as `public/packages/onlyoffice/9/fonts/224`
- Arial bold italic index is `225` → Place file as `public/packages/onlyoffice/9/fonts/225`

**Important Note**: Please ensure that the font files used comply with relevant licensing agreements, only use open-source fonts or fonts with proper authorization.

## 📚 Related Resources

- [OnlyOffice API Documentation](https://api.onlyoffice.com/zh-CN/docs/docs-api/usage-api/config/document/) - OnlyOffice official API reference
- [ranuts/document](https://github.com/ranuts/document) - Reference static resource implementation
- [OnlyOffice Web Apps](https://github.com/ONLYOFFICE/web-apps) - OnlyOffice web application source code
- [OnlyOffice SDK](https://github.com/ONLYOFFICE/sdkjs) - OnlyOffice JavaScript SDK
- [x2t-wasm](https://github.com/cryptpad/onlyoffice-x2t-wasm) - WebAssembly document converter

## 🤝 Contributing

Welcome to submit Issues and Pull Requests to help improve the project!

## 📄 Open Source License

The project uses an open-source license. For details, please see the [LICENSE](LICENSE) file.

## 📌 Notes

### Browser Compatibility

It is recommended to use modern browsers (latest versions of Chrome, Firefox, Edge, Safari) for the best experience.
