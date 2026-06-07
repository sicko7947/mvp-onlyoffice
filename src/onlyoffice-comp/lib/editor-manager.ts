// 编辑器管理器，使用 Proxy 管理编辑器实例和静态资源
interface DocEditor {
  sendCommand: (params: {
    command: string;
    data: Record<string, any>;
  }) => void;
  destroyEditor: () => void;
}
import { ONLYOFFICE_RESOURCE, ONLYOFFICE_EVENT_KEYS, READONLY_TIMEOUT_CONFIG, ONLYOFFICE_CONTAINER_CONFIG } from './const';
import { onlyofficeEventbus } from './eventbus';
import { nanoid } from 'nanoid';

// DocsAPI 类型定义
declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (id: string, config: any) => DocEditor;
    };
  }
}

// DocsAPI 类型定义在 document.d.ts 中

class EditorManager {
  private instanceId: string;
  private containerId: string;
  private editor: DocEditor | null = null;
  private apiLoaded = false;
  private apiLoadingPromise: Promise<void> | null = null;
  private editorConfig: {
    fileName: string;
    fileType: string;
    binData: ArrayBuffer | string;
    media?: any;
    readOnly?: boolean;
    events?: {
      onSave?: (event: any) => void;
    };
  } | null = null;
  private readOnly = false;
  
  constructor(containerId?: string) {
    // 生成唯一实例ID
    this.instanceId = nanoid();
    // 使用传入的容器ID或生成新的
    this.containerId = containerId || `onlyoffice-editor-${this.instanceId}`;
  }
  
  // 获取实例ID
  getInstanceId(): string {
    return this.instanceId;
  }
  
  // 获取容器 ID
  getContainerId(): string {
    return this.containerId;
  }
  
  // 获取容器父元素选择器
  getContainerParentSelector(): string {
    return ONLYOFFICE_CONTAINER_CONFIG.PARENT_SELECTOR;
  }
  
  // 获取容器样式配置
  getContainerStyle(): Record<string, string> {
    return ONLYOFFICE_CONTAINER_CONFIG.STYLE;
  }

  // 更新媒体文件
  updateMedia(mediaKey: string, mediaUrl: string): void {
    if (!this.editorConfig) {
      this.editorConfig = {
        fileName: '',
        fileType: '',
        binData: new ArrayBuffer(0),
        media: {},
      };
    }
    if (!this.editorConfig.media) {
      this.editorConfig.media = {};
    }
    this.editorConfig.media[mediaKey] = mediaUrl;
    console.log(`📷 [EditorManager ${this.instanceId}] Updated media: ${mediaKey}, total: ${Object.keys(this.editorConfig.media).length}`);
  }
  
  // 获取媒体文件映射
  getMedia(): Record<string, string> {
    return this.editorConfig?.media || {};
  }

  // 使用 Proxy 提供安全的访问接口
  private createProxy(): DocEditor {
    return new Proxy({} as DocEditor, {
      get: (_target, prop) => {
        if (prop === 'destroyEditor') {
          return () => this.destroy();
        }
        if (prop === 'sendCommand') {
          return (params: Parameters<DocEditor['sendCommand']>[0]) => {
            if (this.editor) {
              this.editor.sendCommand(params);
            }
          };
        }
        // 其他属性直接返回 editor 的对应属性（包括 processRightsChange, denyEditingRights 等）
        return this.editor ? (this.editor as any)[prop] : undefined;
      },
      set: () => {
        // Proxy 不允许直接设置属性
        return false;
      },
    });
  }

  // 创建编辑器实例
  create(editor: DocEditor, config?: {
    fileName: string;
    fileType: string;
    binData: ArrayBuffer | string;
    media?: any;
    readOnly?: boolean;
    events?: {
      onSave?: (event: any) => void;
    };
  }): DocEditor {
    // 先销毁旧的编辑器
    if (this.editor) {
      try {
        this.editor.destroyEditor();
      } catch (error) {
        console.warn(`[EditorManager ${this.instanceId}] Error destroying old editor:`, error);
      }
      this.editor = null;
    }
    
    // 确保容器元素存在（OnlyOffice 可能会删除它）
    let container = document.getElementById(this.containerId);
    
    // 如果容器不存在，尝试重新创建它
    if (!container) {
      // 优先查找带有 data-onlyoffice-container-id 属性的父元素（用于多实例场景）
      let parent = document.querySelector(`[data-onlyoffice-container-id="${this.containerId}"]`);
      
      // 如果没有找到，尝试查找带有 data-onlyoffice-container 属性的父元素
      if (!parent) {
        parent = document.querySelector(`[data-onlyoffice-container="${this.instanceId}"]`);
      }
      
      // 如果还是没有找到，使用通用的父元素选择器（单实例场景）
      if (!parent) {
        parent = document.querySelector(ONLYOFFICE_CONTAINER_CONFIG.PARENT_SELECTOR);
      }
      
      if (parent) {
        container = document.createElement('div');
        container.id = this.containerId;
        Object.assign(container.style, ONLYOFFICE_CONTAINER_CONFIG.STYLE);
        parent.appendChild(container);
        console.log(`[EditorManager ${this.instanceId}] Container element created for containerId: ${this.containerId}`);
      } else {
        // 降级方案：直接使用 body
        container = document.createElement('div');
        container.id = this.containerId;
        Object.assign(container.style, ONLYOFFICE_CONTAINER_CONFIG.STYLE);
        document.body.appendChild(container);
        console.warn(`[EditorManager ${this.instanceId}] Container element created in body as fallback for containerId: ${this.containerId}`);
      }
    } else {
      console.log(`[EditorManager ${this.instanceId}] Using existing container: ${this.containerId}`);
    }
    
    this.editor = editor;
    if (config) {
      this.editorConfig = config;
      // 同步只读状态
      this.readOnly = config.readOnly ?? false;
    }
    return this.createProxy();
  }

  // 销毁编辑器
  destroy(): void {
    if (this.editor) {
      try {
        this.editor.destroyEditor();
      } catch (error) {
        console.warn(`[EditorManager ${this.instanceId}] Error destroying editor:`, error);
      }
      this.editor = null;
    }
    // 清理配置
    this.editorConfig = null;
    this.readOnly = false;
  }

  // 获取编辑器实例（只读）
  get(): DocEditor | null {
    return this.editor ? this.createProxy() : null;
  }

  // 解析本实例 iframe 内的真实 OnlyOffice SDK api 句柄。
  // cryptpad 包装层（api.js）在容器内创建 iframe，真实 SDK 运行在其中：
  //   Word/PPT 暴露 w.editor，Excel 暴露 w.Asc.editor。
  // 必须按 containerId 限定，避免多实例时抓到第一个 iframe。
  private getInnerApi(): any | null {
    // cryptpad 把 iframe 挂在容器 div 的父级 .onlyoffice-container 里，
    // 而不是 id 容器 div 内部，因此按 .onlyoffice-container 作用域查找。
    //
    // 多实例陷阱：当页面预渲染了 `<div id={containerId}>` 占位符时，OnlyOffice 的
    // DocEditor 会在挂载 iframe 时**移除该占位符 div**（单实例下由 JS 动态创建的
    // 占位符则会作为 iframe 的兄弟节点保留）。因此 `getElementById(containerId)`
    // 在多实例页面会返回 null，scope 落空 → 抓不到本实例 iframe → 导出报
    // "Inner editor api not ready"。稳定锚点是 React 持有、永不被 OO 移除的
    // `[data-onlyoffice-container-id]` 容器（与 createEditor 的查找逻辑一致）。
    const container = document.getElementById(this.containerId);
    const scope =
      container?.closest(ONLYOFFICE_CONTAINER_CONFIG.PARENT_SELECTOR) ||
      document.querySelector(`[data-onlyoffice-container-id="${this.containerId}"]`) ||
      document.querySelector(`[data-onlyoffice-container="${this.instanceId}"]`) ||
      container?.parentElement ||
      container;
    const iframe = scope?.querySelector('iframe') as HTMLIFrameElement | null;
    const w = iframe?.contentWindow as any;
    if (!w) return null;
    return w.editor || (w.Asc && w.Asc.editor) || null;
  }

  // 检查编辑器是否存在
  exists(): boolean {
    return this.editor !== null;
  }

  // 加载 OnlyOffice API 脚本
  async loadAPI(): Promise<void> {
    // if (this.apiLoaded && window.DocsAPI) {
    //   return;
    // }

    // if (this.apiLoadingPromise) {
    //   return this.apiLoadingPromise;
    // }

    this.apiLoadingPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.id = 'onlyoffice-script-api';
      script.src = ONLYOFFICE_RESOURCE.DOCUMENTS;
      script.onload = () => {
        this.apiLoaded = true;
        this.apiLoadingPromise = null;
        resolve();
      };
      script.onerror = (error) => {
        this.apiLoadingPromise = null;
        console.error('Failed to load OnlyOffice API:', error);
        reject(new Error('无法加载编辑器组件。请确保已正确安装 OnlyOffice API。'));
      };
      document.head.appendChild(script);
    });

    return this.apiLoadingPromise;
  }


  // 切换只读/可编辑模式（原地切换，不销毁重建，保留未保存编辑）
  // 直接调用本实例 iframe 内 SDK 的 asc_setViewMode：
  //   asc_setViewMode(true)  -> 只读（canEdit:false, isViewMode:true）
  //   asc_setViewMode(false) -> 可编辑（canEdit:true, isViewMode:false）
  // 该方法在 Word/Excel/PPT 三种编辑器上均可逆往返。
  // 注意：cryptpad 包装层不转发 asc_setViewMode，必须直达 iframe contentWindow。
  async setReadOnly(readOnly: boolean): Promise<void> {
    onlyofficeEventbus.emit(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, { loading: true });
    await new Promise(resolve => setTimeout(resolve, READONLY_TIMEOUT_CONFIG.READONLY_SWITCH_MIN_DELAY));

    try {
      const api = this.getInnerApi();
      if (!api || typeof api.asc_setViewMode !== 'function') {
        throw new Error('Inner editor api not ready (asc_setViewMode unavailable)');
      }
      api.asc_setViewMode(readOnly);
      this.readOnly = readOnly;
      console.log(`[EditorManager ${this.instanceId}] setViewMode(${readOnly}) applied in-place`);
      onlyofficeEventbus.emit(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, { loading: false });
    } catch (error) {
      console.error(`[EditorManager ${this.instanceId}] Failed to set read-only mode:`, error);
      onlyofficeEventbus.emit(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, { loading: false });
      throw error;
    }
  }

  // 获取当前只读状态
  getReadOnly(): boolean {
    return this.readOnly;
  }

  // 获取文件名
  getFileName(): string {
    return this.editorConfig?.fileName || '';
  }

  // 打印文档
  print(): void {
    const editor = this.get();
    if (!editor) return;
    console.log('Printing document');
  }

  // 从 iframe 内 SDK 直接抓当前文档字节（含未保存编辑），返回 Uint8Array；
  // 内部 api 未就绪或读取失败返回 null（由调用方决定回退策略）。
  //
  // v9 mock 模式下 downloadAs()/asc_DownloadAs() 无服务端回调 → onSave 永不触发，
  // 旧的 bus 等待必然超时。改用 SDK 的 asc_nativeGetFile()，它同步返回当前内部 bin，
  // 格式为 "DOCY;v5;<size>;<base64>" 这类原生字符串。x2t 的 convertBinToDocument
  // 期望的 .bin 内容就是这个完整字符串的 ASCII 字节（base64 负载不解码）——已用
  // editorConfig.binData 验证："DOCY;v5;743;<992 个 base64 字符>" 共 1004 字节 =
  // 12 头部 + base64(743)。因此逐字符 charCode 拷贝原样保留，绝不 atob，也不能用
  // TextEncoder（全部字符 ≤ 0x7f，charCode 即字节）。
  private getCurrentBytes(): Uint8Array | null {
    const api = this.getInnerApi();
    if (!api || typeof api.asc_nativeGetFile !== 'function') {
      return null;
    }

    // 强制提交未确认的编辑，再抓字节。真实用户在单元格里输入后直接点“导出”
    // 而不按回车时，活动单元格编辑器仍未提交 → asc_nativeGetFile 抓不到该改动
    // （静默数据丢失）。Excel 用 asc_closeCellEditor 提交活动单元格；三种编辑器
    // 都用 End_CompositeInput 收尾可能未完成的 IME 组合输入。防御式调用，方法不
    // 存在则跳过，提交失败也不阻断导出。
    try {
      if (typeof api.asc_closeCellEditor === 'function') api.asc_closeCellEditor();
      if (typeof api.End_CompositeInput === 'function') api.End_CompositeInput();
    } catch (commitError) {
      console.warn(`[EditorManager ${this.instanceId}] pre-export commit failed (continuing):`, commitError);
    }

    const raw = api.asc_nativeGetFile();
    if (typeof raw !== 'string' || raw.length === 0) {
      return null;
    }

    const binData = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) binData[i] = raw.charCodeAt(i) & 0xff;
    return binData;
  }

  // 导出文档（通过保存事件触发下载）
  async export(): Promise<any> {
    // 只读模式同样要导出“当前文档”而非加载时的原始字节。asc_nativeGetFile 不依赖
    // view mode，且 setReadOnly() 原地切换保留未保存编辑，所以「编辑→切只读→导出」
    // 必须仍能拿到编辑后的字节。仅当内部 api 不可用时才回退到 editorConfig.binData。
    if (this.readOnly) {
      if (!this.editorConfig) {
        throw new Error('Editor config not available in read-only mode');
      }

      const liveBytes = this.getCurrentBytes();
      if (liveBytes) {
        console.log(`[EditorManager ${this.instanceId}] read-only export via asc_nativeGetFile: ${liveBytes.length} bytes`);
        return {
          binData: liveBytes,
          fileName: this.editorConfig.fileName,
          fileType: this.editorConfig.fileType,
          media: this.editorConfig.media || {},
          instanceId: this.instanceId,
        };
      }

      // 回退：内部 api 未就绪 → 退回加载时字节（仅在拿不到实时字节时发生）。
      console.warn(`[EditorManager ${this.instanceId}] read-only export: inner api unavailable, falling back to load-time binData`);
      const binData = this.editorConfig.binData instanceof Uint8Array
        ? this.editorConfig.binData
        : new Uint8Array(this.editorConfig.binData as ArrayBuffer);

      return {
        binData,
        fileName: this.editorConfig.fileName,
        fileType: this.editorConfig.fileType,
        media: this.editorConfig.media || {}, // 包含媒体信息
      };
    }

    // 非只读模式：从 iframe 内 SDK 直接抓当前文档字节。
    try {
      const currentInstanceId = this.instanceId;
      const binData = this.getCurrentBytes();
      if (!binData) {
        throw new Error(`Inner editor api not ready or returned no data for instance ${currentInstanceId}`);
      }

      console.log(`[EditorManager ${currentInstanceId}] export via asc_nativeGetFile: ${binData.length} bytes`);

      return {
        binData,
        fileName: this.editorConfig?.fileName,
        fileType: this.editorConfig?.fileType,
        media: this.editorConfig?.media || {},
        instanceId: currentInstanceId,
      };
    } catch (error) {
      console.error(`[EditorManager ${this.instanceId}] Failed to export:`, error);
      throw error;
    }
  }
}

// 编辑器管理器工厂类，用于管理多个编辑器实例
class EditorManagerFactory {
  private instances: Map<string, EditorManager> = new Map();
  private defaultInstance: EditorManager | null = null;

  /**
   * 创建或获取编辑器管理器实例
   * @param containerId 容器ID，如果不提供则创建新实例
   * @returns EditorManager 实例
   */
  create(containerId?: string): EditorManager {
    if (containerId) {
      // 如果提供了容器ID，检查是否已存在
      let instance = this.instances.get(containerId);
      if (!instance) {
        instance = new EditorManager(containerId);
        this.instances.set(containerId, instance);
      }
      return instance;
    } else {
      // 创建新实例
      const instance = new EditorManager();
      this.instances.set(instance.getContainerId(), instance);
      return instance;
    }
  }

  /**
   * 获取编辑器管理器实例
   * @param containerId 容器ID
   * @returns EditorManager 实例或 null
   */
  get(containerId: string): EditorManager | null {
    return this.instances.get(containerId) || null;
  }

  /**
   * 销毁编辑器管理器实例
   * @param containerId 容器ID
   */
  destroy(containerId: string): void {
    const instance = this.instances.get(containerId);
    if (instance) {
      instance.destroy();
      this.instances.delete(containerId);
      // 清理映射（需要在 x2t.ts 中导入并清理，这里先保留）
    }
  }

  /**
   * 销毁所有编辑器实例
   */
  destroyAll(): void {
    this.instances.forEach((instance) => {
      instance.destroy();
    });
    this.instances.clear();
    this.defaultInstance = null;
  }

  /**
   * 获取默认实例（向后兼容）
   */
  getDefault(): EditorManager {
    if (!this.defaultInstance) {
      this.defaultInstance = new EditorManager();
      this.instances.set(this.defaultInstance.getContainerId(), this.defaultInstance);
    }
    return this.defaultInstance;
  }

  /**
   * 获取所有实例
   */
  getAll(): EditorManager[] {
    return Array.from(this.instances.values());
  }
}

// 导出工厂单例
export const editorManagerFactory = new EditorManagerFactory();

// 导出默认实例（向后兼容）
export const editorManager = editorManagerFactory.getDefault();

if (typeof window !== 'undefined') {
  (window as any).editorManagerFactory = editorManagerFactory;
  (window as any).editorManager = editorManager; // 向后兼容
}

// 导出类型
export type { DocEditor };
export { EditorManager };

