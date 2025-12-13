# MVP OnlyOffice

> 📖 English | [中文](README.zh.md)

🌐 **Live Demo**: https://mvp-onlyoffice.vercel.app/

A browser-based document processing solution built on the OnlyOffice technology stack, supporting document viewing, editing, and conversion entirely on the client side. All operations are performed on the user's device without requiring backend services.

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

- **OnlyOffice SDK**: Integrates OnlyOffice official JavaScript SDK, providing core document editing capabilities
- **WebAssembly**: Uses x2t-wasm module to implement document format conversion functionality
- **Client-Side Architecture**: All functional modules run in the browser environment without server dependencies

## 🚀 Deployment Options

### Vercel Deployment

The project is configured for static export and can be deployed directly to Vercel:

```bash
# Install dependencies
npm install
# or
pnpm install

# Build project
npm run build

# Vercel will automatically detect and deploy
```

Access URL: https://mvp-onlyoffice.vercel.app/

### Static File Deployment

The project supports static export, and built files can be deployed to any static hosting service:

```bash
# Build static files
npm run build

# Output directory: out/
# Can be directly deployed to GitHub Pages, Netlify, Nginx, etc.
```

### Local Development

```bash
# Clone repository
git clone <repository-url>
cd mvp-onlyoffice

# Install dependencies
npm install
# or
pnpm install

# Start development server
npm run dev

# Access http://localhost:3001
```

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
# Use default paths (compresses from version 7 to 7-minify)
node scripts/minify.js

# Specify custom source and target directories
node scripts/minify.js <sourceDir> <targetDir>

# Example: Compress files from one directory to another
node scripts/minify.js ./public/packages/onlyoffice/7 ./public/packages/onlyoffice/7-minify
```

#### Default Paths

- **Source Directory**: `public/packages/onlyoffice/7`
- **Target Directory**: `public/packages/onlyoffice/7-minify`

#### Compression Configuration

- **JavaScript/TypeScript**: 
  - Removes comments
  - Preserves console/debugger statements
  - No variable name mangling (safe for OnlyOffice SDK)
- **CSS**: 
  - Full CSS optimization via cssnano
- **HTML**: 
  - Removes comments
  - Collapses whitespace
  - Preserves attribute quotes and structure

#### Output

The script provides real-time progress updates and a final summary including:
- Total files processed
- Number of compressed files
- Number of copied files
- Original total size
- Compressed total size
- Overall size reduction percentage

## 📝 Project Structure

```
mvp-onlyoffice/
├── src/
│   ├── app/              # Next.js application pages
│   │   ├── excel/
│   │   │   └── base/     # Excel editor page (/excel/base)
│   │   ├── docs/
│   │   │   └── base/     # Word editor page (/docs/base)
│   │   ├── ppt/
│   │   │   └── base/     # PowerPoint editor page (/ppt/base)
│   │   ├── multi/
│   │   │   ├── base/     # Multi-instance basic demo page (/multi/base)
│   │   │   └── tabs/     # Multi-instance Tab demo page (/multi/tabs)
│   │   └── page.tsx      # Home page (redirects to /excel/base)
│   ├── onlyoffice-comp/  # OnlyOffice component library
│   │   └── lib/
│   │       ├── editor-manager.ts  # Editor manager (supports multi-instance)
│   │       ├── x2t.ts             # Document conversion module
│   │       ├── eventbus.ts        # Event bus
│   │       └── ...
│   └── components/       # Common components
├── public/               # Static resources
│   ├── web-apps/         # OnlyOffice Web application resources
│   ├── sdkjs/            # OnlyOffice SDK resources
│   └── wasm/             # WebAssembly converter
└── onlyoffice-x2t-wasm/  # x2t-wasm source code
```

### Page Route Description

- `/` - Home page, automatically redirects to `/excel/base`
- `/excel/base` - Excel spreadsheet editor (single-instance mode)
- `/docs/base` - Word document editor (single-instance mode)
- `/ppt/base` - PowerPoint presentation editor (single-instance mode)
- `/multi/base` - Multi-instance basic demo, showcasing multiple independent editor instances running simultaneously
- `/multi/tabs` - Multi-instance Tab demo, showcasing multi-tab editor implementation with LRU cache management

## 🔤 Font Configuration

### Font File Description

This project complies with open-source licensing requirements and **does not include** copyrighted commercial font files (such as Arial, Times New Roman, Microsoft YaHei, SimSun, etc.). These font names are still retained in the configuration to ensure document compatibility, but actual font files need to be added by users.

### Adding Font Files

To add fonts, follow these steps:

1. Check the `public/sdkjs/common/AllFonts.js` file
2. Find the target font's index number in the `__fonts_files` array
3. Place the font file in the `public/fonts/` directory
4. Rename the file to the corresponding index number (no extension needed)

**Example: Adding Arial Font**

- Arial regular font index is `223` → Place file as `public/fonts/223`
- Arial bold index is `226` → Place file as `public/fonts/226`
- Arial italic index is `224` → Place file as `public/fonts/224`
- Arial bold italic index is `225` → Place file as `public/fonts/225`

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
