# MVP OnlyOffice

> 📖 [English](README.md) | 中文

🌐 **在线演示**: https://mvp-onlyoffice.vercel.app/

基于 OnlyOffice 技术栈构建的浏览器端文档处理解决方案，支持在客户端完成文档的查看、编辑与转换，所有操作均在用户设备上执行，无需依赖后端服务。

## 🎯 核心优势

- 🛡️ **数据安全**: 文档处理流程完全在浏览器内完成，数据不会离开本地环境
- 📄 **格式兼容**: 全面支持 Word、Excel、PowerPoint 等主流办公文档格式
- 🔄 **即时响应**: 提供流畅的文档编辑交互体验
- 💻 **零部署成本**: 采用客户端架构，无需搭建服务器环境
- ⚡ **快速启动**: 访问页面即可立即使用，无需额外配置
- 🌏 **国际化**: 内置多语言界面，可自由切换显示语言
- 🎯 **多实例支持**: 支持同时运行多个独立编辑器实例，资源完全隔离

## 📘 使用指南

### 快速开始

1. 访问 [在线编辑器](https://mvp-onlyoffice.vercel.app/)
2. 选择编辑器类型：
   - `/excel/base` - Excel 电子表格编辑器
   - `/docs/base` - Word 文档编辑器
   - `/ppt/base` - PowerPoint 演示文稿编辑器
   - `/multi/base` - 多实例基础演示（同时运行多个编辑器）
   - `/multi/tabs` - 多实例 Tab 演示（带缓存管理）
3. 上传本地文件
4. 在浏览器中直接编辑文档内容
5. 完成编辑后导出保存文档

### URL 参数配置

| 参数名   | 功能说明         | 可选值     | 优先级 |
| -------- | ---------------- | ---------- | ------ |
| `locale` | 指定界面显示语言 | `en`, `zh` | -      |

**使用示例：**

```bash
# 设置中文界面
?locale=zh
```

## 🔌 API 接口说明

### 编辑器管理器 (EditorManager & EditorManagerFactory)

编辑器管理器提供了完整的文档操作接口，支持创建、销毁、导出等核心功能。支持单实例和多实例两种模式。

#### 单实例模式（向后兼容）

```typescript
import { editorManagerFactory } from '@/onlyoffice-comp/lib/editor-manager';

// 获取默认实例
const editorManager = editorManagerFactory.getDefault();

// 检查编辑器是否已创建
const exists = editorManager.exists();

// 获取编辑器实例
const editor = editorManager.get();

// 销毁编辑器
editorManager.destroy();
```

#### 多实例模式

```typescript
import { editorManagerFactory } from '@/onlyoffice-comp/lib/editor-manager';

// 创建或获取指定容器ID的实例
const manager1 = editorManagerFactory.create('editor-1');
const manager2 = editorManagerFactory.create('editor-2');

// 获取指定容器ID的实例
const manager = editorManagerFactory.get('editor-1');

// 获取所有实例
const allManagers = editorManagerFactory.getAll();

// 销毁指定实例
editorManagerFactory.destroy('editor-1');

// 销毁所有实例
editorManagerFactory.destroyAll();
```

#### 文档导出

文档导出采用事件驱动机制，通过 EventBus 进行异步通信。

**导出流程：**

1. **触发保存**: 调用 `editorManager.export()` 方法
2. **等待事件**: 系统监听 `saveDocument` 事件
3. **获取数据**: 事件触发后返回文档二进制数据

**代码示例：**

```typescript
// 单实例模式
const editorManager = editorManagerFactory.getDefault();
const result = await editorManager.export();
// result 包含: { fileName, fileType, binData, instanceId, media }

// 多实例模式
const manager1 = editorManagerFactory.get('editor-1');
const result1 = await manager1.export();
// result1.instanceId 会匹配 manager1.getInstanceId()

// 处理导出数据
const blob = new Blob([result.binData], {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
});
const url = window.URL.createObjectURL(blob);
// 执行下载或其他操作
```

**多实例导出机制：**

在多实例模式下，每个 `EditorManager` 实例的 `export()` 方法会自动过滤 `SAVE_DOCUMENT` 事件，只接收属于当前实例的保存事件（通过 `instanceId` 字段匹配）。这确保了即使多个实例同时调用 `export()`，也不会出现事件混乱或数据错位的问题。

#### 只读模式控制

```typescript
// 设置为只读模式
await editorManager.setReadOnly(true);

// 切换为可编辑模式
await editorManager.setReadOnly(false);

// 查询当前模式
const isReadOnly = editorManager.getReadOnly();
```

### 事件总线 (EventBus)

项目使用事件总线机制处理编辑器状态变化和文档操作事件。

#### 支持的事件类型

- `saveDocument` - 文档保存完成事件
- `documentReady` - 文档加载就绪事件
- `loadingChange` - 加载状态变化事件

#### 事件监听

```typescript
import { onlyofficeEventbus } from '@/onlyoffice-comp/lib/eventbus';
import { ONLYOFFICE_EVENT_KEYS } from '@/onlyoffice-comp/lib/const';

// 监听文档保存事件
onlyofficeEventbus.on(ONLYOFFICE_EVENT_KEYS.SAVE_DOCUMENT, (data) => {
  console.log('文档已保存:', data);
});

// 监听文档就绪事件
onlyofficeEventbus.on(ONLYOFFICE_EVENT_KEYS.DOCUMENT_READY, (data) => {
  console.log('文档已就绪:', data);
});

// 移除事件监听
onlyofficeEventbus.off(ONLYOFFICE_EVENT_KEYS.SAVE_DOCUMENT, callback);

// 等待事件触发（返回 Promise）
const saveData = await onlyofficeEventbus.waitFor(
  ONLYOFFICE_EVENT_KEYS.SAVE_DOCUMENT, 
  3000 // 超时时间（毫秒）
);
```

### 文档转换 (X2T Converter)

文档转换功能基于 WebAssembly 实现，支持多种格式之间的相互转换。

```typescript
import { convertBinToDocument, createEditorView } from '@/onlyoffice-comp/lib/x2t';

// 单实例模式：创建编辑器视图（使用默认容器）
await createEditorView({
  file: fileObject,        // File 对象（可选）
  fileName: 'document.xlsx', // 文件名
  isNew: false,            // 是否新建文档
  readOnly: false,        // 是否只读
  lang: 'zh',             // 界面语言
});

// 多实例模式：创建编辑器视图（指定容器ID）
const manager1 = await createEditorView({
  file: fileObject,
  fileName: 'document.xlsx',
  isNew: false,
  readOnly: false,
  lang: 'zh',
  containerId: 'editor-1', // 指定容器ID
});

// 转换文档格式
const result = await convertBinToDocument(
  binData,      // 二进制数据
  fileName,      // 文件名
  FILE_TYPE.XLSX, // 目标格式
  media         // 媒体文件（可选）
);
```

### 数据类型定义

```typescript
// 文档保存数据
type SaveDocumentData = {
  fileName: string;      // 文件名
  fileType: string;      // 文件类型（如 'xlsx', 'docx'）
  binData: Uint8Array;   // 二进制数据
  instanceId: string;    // 实例ID（多实例模式下用于事件匹配）
  media?: Record<string, string>; // 媒体文件映射
}

// 文档就绪数据
type DocumentReadyData = {
  fileName: string;      // 文件名
  fileType: string;      // 文件类型
}
```

## 🏗️ 技术实现

- **OnlyOffice SDK**: 集成 OnlyOffice 官方 JavaScript SDK，提供文档编辑核心能力
- **WebAssembly**: 利用 x2t-wasm 模块实现文档格式转换功能
- **客户端架构**: 所有功能模块均在浏览器环境中运行，不依赖服务端

## 🚀 部署方案

### Vercel 部署

项目已配置静态导出，可直接部署到 Vercel：

```bash
# 安装依赖
npm install
# 或
pnpm install

# 构建项目
npm run build

# Vercel 会自动检测并部署
```

访问地址：https://mvp-onlyoffice.vercel.app/

### 静态文件部署

项目支持静态导出，构建后的文件可部署到任何静态托管服务：

```bash
# 构建静态文件
npm run build

# 输出目录: out/
# 可直接部署到 GitHub Pages、Netlify、Nginx 等
```

### 本地开发

```bash
# 克隆仓库
git clone <repository-url>
cd mvp-onlyoffice

# 安装依赖
npm install
# 或
pnpm install

# 启动开发服务器
npm run dev

# 访问 http://localhost:3001
```

## 🛠️ 构建工具

### 文件压缩脚本 (`scripts/minify.js`)

用于压缩文件夹中文件的工具脚本（排除 WASM 文件），可有效减少打包体积。该脚本会递归处理目录，压缩 JavaScript、HTML、CSS 等文本类文件。

#### 功能特性

- **多格式支持**: 压缩 `.js`、`.html`、`.mjs`、`.cjs`、`.ts`、`.jsx`、`.tsx`、`.css` 文件
- **智能压缩**:
  - JavaScript/TypeScript: 使用 `terser` 进行压缩（不混淆变量名，避免破坏代码）
  - CSS: 使用 `postcss` + `cssnano` 进行优化
  - HTML: 使用 `html-minifier-terser` 进行压缩
- **安全处理**: 压缩失败时自动回退为复制原文件
- **详细统计**: 提供完整的压缩统计信息，包括文件数量和体积减少百分比
- **保留 WASM 文件**: 自动跳过 WASM 文件，防止文件损坏

#### 使用方法

```bash
# 使用默认路径（从版本 7 压缩到 7-minify）
node scripts/minify.js

# 指定自定义源目录和目标目录
node scripts/minify.js <源目录> <目标目录>

# 示例：将文件从一个目录压缩到另一个目录
node scripts/minify.js ./public/packages/onlyoffice/7 ./public/packages/onlyoffice/7-minify
```

#### 默认路径

- **源目录**: `public/packages/onlyoffice/7`
- **目标目录**: `public/packages/onlyoffice/7-minify`

#### 压缩配置

- **JavaScript/TypeScript**: 
  - 移除注释
  - 保留 console/debugger 语句
  - 不混淆变量名（确保 OnlyOffice SDK 安全）
- **CSS**: 
  - 通过 cssnano 进行完整 CSS 优化
- **HTML**: 
  - 移除注释
  - 压缩空白字符
  - 保留属性引号和结构

#### 输出信息

脚本会提供实时进度更新和最终统计摘要，包括：
- 处理的总文件数
- 压缩的文件数量
- 复制的文件数量
- 原始总大小
- 压缩后总大小
- 总体体积减少百分比

## 📝 项目结构

```
mvp-onlyoffice/
├── src/
│   ├── app/              # Next.js 应用页面
│   │   ├── excel/
│   │   │   └── base/     # Excel 编辑器页面 (/excel/base)
│   │   ├── docs/
│   │   │   └── base/     # Word 编辑器页面 (/docs/base)
│   │   ├── ppt/
│   │   │   └── base/     # PowerPoint 编辑器页面 (/ppt/base)
│   │   ├── multi/
│   │   │   ├── base/     # 多实例基础演示页面 (/multi/base)
│   │   │   └── tabs/     # 多实例 Tab 演示页面 (/multi/tabs)
│   │   └── page.tsx      # 首页（重定向到 /excel/base）
│   ├── onlyoffice-comp/  # OnlyOffice 组件库
│   │   └── lib/
│   │       ├── editor-manager.ts  # 编辑器管理器（支持多实例）
│   │       ├── x2t.ts             # 文档转换模块
│   │       ├── eventbus.ts        # 事件总线
│   │       └── ...
│   └── components/       # 通用组件
├── public/               # 静态资源
│   ├── web-apps/         # OnlyOffice Web 应用资源
│   ├── sdkjs/            # OnlyOffice SDK 资源
│   └── wasm/             # WebAssembly 转换器
└── onlyoffice-x2t-wasm/  # x2t-wasm 源码
```

### 页面路由说明

- `/` - 首页，自动重定向到 `/excel/base`
- `/excel/base` - Excel 电子表格编辑器（单实例模式）
- `/docs/base` - Word 文档编辑器（单实例模式）
- `/ppt/base` - PowerPoint 演示文稿编辑器（单实例模式）
- `/multi/base` - 多实例基础演示，展示同时运行多个独立编辑器实例
- `/multi/tabs` - 多实例 Tab 演示，展示带 LRU 缓存管理的多 Tab 编辑器实现

## 🔤 字体配置

### 字体文件说明

本项目遵循开源许可要求，**不包含**受版权保护的商业字体文件（如 Arial、Times New Roman、微软雅黑、宋体等）。这些字体名称仍保留在配置中以确保文档兼容性，但实际字体文件需用户自行添加。

### 添加字体文件

如需添加字体，请按以下步骤操作：

1. 查看 `public/sdkjs/common/AllFonts.js` 文件
2. 在 `__fonts_files` 数组中查找目标字体的索引号
3. 将字体文件放置到 `public/fonts/` 目录
4. 将文件重命名为对应的索引号（无需扩展名）

**示例：添加 Arial 字体**

- Arial 常规字体索引为 `223` → 放置文件为 `public/fonts/223`
- Arial 粗体索引为 `226` → 放置文件为 `public/fonts/226`
- Arial 斜体索引为 `224` → 放置文件为 `public/fonts/224`
- Arial 粗斜体索引为 `225` → 放置文件为 `public/fonts/225`

**重要提示**: 请确保使用的字体文件符合相关许可协议，仅使用开源字体或已获得授权的字体。

## 📚 相关资源

- [OnlyOffice API 文档](https://api.onlyoffice.com/zh-CN/docs/docs-api/usage-api/config/document/) - OnlyOffice 官方 API 参考
- [ranuts/document](https://github.com/ranuts/document) - 参考静态资源实现
- [OnlyOffice Web Apps](https://github.com/ONLYOFFICE/web-apps) - OnlyOffice 网页应用源码
- [OnlyOffice SDK](https://github.com/ONLYOFFICE/sdkjs) - OnlyOffice JavaScript SDK
- [x2t-wasm](https://github.com/cryptpad/onlyoffice-x2t-wasm) - WebAssembly 文档转换器

## 🤝 参与贡献

欢迎提交 Issue 和 Pull Request 来帮助改进项目！

## 📄 开源许可

项目采用开源许可证，详情请查看 [LICENSE](LICENSE) 文件。

## 📌 注意事项


### 浏览器兼容性

建议使用现代浏览器（Chrome、Firefox、Edge、Safari 最新版本）以获得最佳体验。



