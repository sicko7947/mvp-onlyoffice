/**
 * 文档状态管理
 * 使用 Proxy 模式管理文档状态
 */
interface DocumentState {
  fileName: string;
  file?: File;
  url?: string | URL;
}

const DocumentStateProxy = new Proxy(
  {
    instance: {
      fileName: '',
      file: undefined,
      url: undefined,
    } as DocumentState,
  },
  {
    // 可以在这里添加拦截器逻辑，比如验证、日志等
  }
);

const getDocumentState = (): DocumentState => {
  return { ...DocumentStateProxy.instance };
};

const setDocumentState = (state: Partial<DocumentState>): void => {
  DocumentStateProxy.instance = {
    ...DocumentStateProxy.instance,
    ...state,
  };
};

// 为了保持向后兼容，导出旧的函数名（注意：getDocmentObj 拼写有误）
export const getDocmentObj = getDocumentState;
export const setDocmentObj = setDocumentState;

// 导出新的正确拼写的函数
export { getDocumentState, setDocumentState, DocumentStateProxy };

// 导出类型
export type { DocumentState };

