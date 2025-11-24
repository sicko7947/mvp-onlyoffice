// 编辑器管理器，使用 Proxy 管理编辑器实例和静态资源
interface DocEditor {
  sendCommand: (params: {
    command: string;
    data: Record<string, any>;
  }) => void;
  destroyEditor: () => void;
}
import { ONLYOFFICE_RESOURCE, ONLYOFFICE_EVENT_KEYS, READONLY_TIMEOUT_CONFIG, ONLYOFFICE_CONTAINER_CONFIG } from './const';
import { getOnlyOfficeLang } from './document-state';
import { onlyofficeEventbus } from './eventbus';
import { createEditorInstance } from './x2t';
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


  // 切换只读/可编辑模式
  // 当从只读切换到可编辑时，先导出数据，然后重新加载编辑器实例
  async setReadOnly(readOnly: boolean): Promise<void> {
    
    onlyofficeEventbus.emit(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, { loading: true });
    await new Promise(resolve => setTimeout(resolve, READONLY_TIMEOUT_CONFIG.READONLY_SWITCH_MIN_DELAY));
    // 可编辑，先导出数据，然后重新加载编辑器
    if (this.readOnly && !readOnly) {
      console.log('Switching from read-only to edit mode, exporting and reloading editor...');
      
      const editor = this.get();
      if (!editor) {
        throw new Error('Editor not available for export');
      }

      // 先导出当前文档数据
      let exportedData = this.editorConfig;
      
      // 销毁当前编辑器
      if (this.editor) {
        try {
          this.editor.destroyEditor();
        } catch (error) {
          console.warn('Error destroying editor:', error);
        }
        this.editor = null;
      }
      
      // 使用导出的数据重新创建编辑器（可编辑模式）
      createEditorInstance({
        fileName: exportedData.fileName,
        fileType: exportedData.fileType,
        binData: exportedData.binData,
        media: this.editorConfig?.media,
        lang: getOnlyOfficeLang(),
        readOnly: false, // 明确设置为可编辑模式
        containerId: this.containerId, // 使用当前实例的容器ID
        editorManager: this, // 使用当前实例
      });
      onlyofficeEventbus.on(ONLYOFFICE_EVENT_KEYS.DOCUMENT_READY, () => {
        onlyofficeEventbus.emit(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, { loading: false });
      });
      this.readOnly = false;
      return;
    }
    
    // 如果从可编辑切换到只读，使用命令切换
    const editor = this.get();
    if (!editor) {
      console.warn('Editor not available, cannot set read-only mode');
      return;
    }
    
    try {
      const exportedData = await this.export();
      this.editorConfig = {
        ...this.editorConfig,
        fileName: exportedData.fileName,
        fileType: exportedData.fileType,
        binData: exportedData.binData,
      };
      const message = '文档已设置为只读模式';
      // rawEditor.processRightsChange(false, message);
      editor.sendCommand({
        command: 'processRightsChange',
        data: {
          enabled: false,
          message: message
        },
      });
      onlyofficeEventbus.emit(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, { loading: false });
      this.readOnly = true;
    } catch (error) {
      console.error('Failed to set read-only mode:', error);
      onlyofficeEventbus.emit(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, { loading: false });
      throw error;
    }
  }

  // 获取当前只读状态
  getReadOnly(): boolean {
    return this.readOnly;
  }

  // 打印文档
  print(): void {
    const editor = this.get();
    if (!editor) return;
    console.log('Printing document');
  }

  // 导出文档（通过保存事件触发下载）
  async export(): Promise<any> {
    // 如果处于只读模式，直接返回存储的 binData 数据
    if (this.readOnly) {
      if (!this.editorConfig) {
        throw new Error('Editor config not available in read-only mode');
      }
      return {
        binData: this.editorConfig.binData,
        fileName: this.editorConfig.fileName,
        fileType: this.editorConfig.fileType,
        media: this.editorConfig.media, // 包含媒体信息
      };
    }
    
    // 非只读模式，使用编辑器的导出功能
    const editor = this.get();
    if (!editor) {
      throw new Error('Editor not available for export');
    }
    
    // 触发保存
    try {
      
      console.log('Trying downloadAs method');
      (editor as any).downloadAs();
      
      // 等待保存事件，使用 onlyofficeEventbus.waitFor
      const result = await onlyofficeEventbus.waitFor(ONLYOFFICE_EVENT_KEYS.SAVE_DOCUMENT, READONLY_TIMEOUT_CONFIG.SAVE_DOCUMENT);
      
      // 添加媒体信息到结果中
      if (this.editorConfig?.media) {
        result.media = this.editorConfig.media;
        console.log('📷 [EditorManager] Including media files in export:', Object.keys(this.editorConfig.media).length);
      }
      
      // 触发 loading 结束事件
      
      return result;
    } catch (error) {
      // 发生错误时也要关闭 loading
      console.error('Failed to send asc_save command:', error);
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

