'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  convertBinToDocument,
  createEditorView,
  initializeOnlyOffice,
  getOnlyOfficeLang,
  getCurrentLang,
  setCurrentLang,
  editorManagerFactory,
  EditorManager,
  ONLYOFFICE_EVENT_KEYS,
  FILE_TYPE,
  ONLYOFFICE_LANG_KEY,
  onlyofficeEventbus,
} from '@/onlyoffice-comp';
import Loading from '@/components/Loading';

function MultiInstancePageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fileInputRef1 = useRef<HTMLInputElement>(null);
  const fileInputRef2 = useRef<HTMLInputElement>(null);
  const fileInputRef3 = useRef<HTMLInputElement>(null);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [managers, setManagers] = useState<{
    manager1: EditorManager | null;
    manager2: EditorManager | null;
    manager3: EditorManager | null;
  }>({
    manager1: null,
    manager2: null,
    manager3: null,
  });
  const [readOnlyStates, setReadOnlyStates] = useState({
    editor1: false,
    editor2: false,
    editor3: false,
  });
  
  // 保存每个编辑器实例的文档信息，用于语言切换时重新创建
  const [editorDocuments, setEditorDocuments] = useState<{
    manager1: { fileName: string; file?: File } | null;
    manager2: { fileName: string; file?: File } | null;
    manager3: { fileName: string; file?: File } | null;
  }>({
    manager1: null,
    manager2: null,
    manager3: null,
  });
  
  const initializedRef = useRef(false);
  const [_, forceUpdate] = useState(0);
  const [currentLang, setCurrentLangState] = useState<'zh' | 'en'>(ONLYOFFICE_LANG_KEY.EN);

  // 监听 URL 参数变化，更新语言状态
  useEffect(() => {
    const lang = getCurrentLang();
    setCurrentLangState(lang);
  }, [searchParams]);

  // 切换语言
  const handleLanguageSwitch = async () => {
    const newLang = currentLang === ONLYOFFICE_LANG_KEY.ZH ? ONLYOFFICE_LANG_KEY.EN : ONLYOFFICE_LANG_KEY.ZH;
    setCurrentLang(newLang);
    setCurrentLangState(newLang);
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.set('locale', newLang);
    router.push(`${pathname}?${params.toString()}`);
    
    // 重新创建所有已存在的编辑器以应用新语言
    try {
      // 重新创建 manager1
      if (managers.manager1 && editorDocuments.manager1) {
        const doc = editorDocuments.manager1;
        await handleView('manager1', doc.fileName, doc.file);
      }
      
      // 重新创建 manager2
      if (managers.manager2 && editorDocuments.manager2) {
        const doc = editorDocuments.manager2;
        await handleView('manager2', doc.fileName, doc.file);
      }
      
      // 重新创建 manager3
      if (managers.manager3 && editorDocuments.manager3) {
        const doc = editorDocuments.manager3;
        await handleView('manager3', doc.fileName, doc.file);
      }
      
      forceUpdate((prev) => prev + 1);
    } catch (err) {
      console.error('Failed to reload editors with new language:', err);
      setError('切换语言失败');
    }
  };

  const handleView = async (editorKey: 'manager1' | 'manager2' | 'manager3', fileName: string, file?: File) => {
    setError(null);
    try {
      await initializeOnlyOffice();
      
      const containerId = `editor-${editorKey.replace('manager', '')}`;
      console.log(`[MultiInstance] handleView for ${editorKey}, containerId: ${containerId}, fileName: ${fileName}`);
      
      // 如果该编辑器实例已存在，先销毁它
      const existingManager = managers[editorKey];
      if (existingManager) {
        try {
          console.log(`[MultiInstance] Destroying existing manager for ${editorKey}`);
          existingManager.destroy();
        } catch (err) {
          console.warn(`Failed to destroy existing editor ${editorKey}:`, err);
        }
      }
      
      // 从工厂中销毁旧实例（如果存在）
      const factoryInstance = editorManagerFactory.get(containerId);
      if (factoryInstance && factoryInstance !== existingManager) {
        try {
          console.log(`[MultiInstance] Destroying factory instance for ${containerId}`);
          factoryInstance.destroy();
          editorManagerFactory.destroy(containerId);
        } catch (err) {
          console.warn(`Failed to destroy factory instance ${containerId}:`, err);
        }
      }
      
      // 确保容器元素存在
      let container = document.getElementById(containerId);
      if (!container) {
        // 如果容器不存在，尝试从父元素创建（使用 data-onlyoffice-container-id 精确查找）
        const parent = document.querySelector(`[data-onlyoffice-container-id="${containerId}"]`);
        if (parent) {
          container = document.createElement('div');
          container.id = containerId;
          container.className = 'absolute inset-0';
          parent.appendChild(container);
          console.log(`[MultiInstance] Created container ${containerId} in parent with data-onlyoffice-container-id`);
        } else {
          console.warn(`[MultiInstance] Parent element with data-onlyoffice-container-id="${containerId}" not found`);
        }
      } else {
        // 如果容器已存在，清空它以确保干净的状态
        container.innerHTML = '';
        console.log(`[MultiInstance] Cleared container ${containerId}`);
      }
      
      const manager = await createEditorView({
        file,
        fileName,
        isNew: !file,
        readOnly: readOnlyStates[editorKey.replace('manager', 'editor') as keyof typeof readOnlyStates],
        lang: getOnlyOfficeLang(),
        containerId, // 明确指定容器ID
      });
      
      console.log(`[MultiInstance] Created editor for ${editorKey}, manager instanceId: ${manager.getInstanceId()}, containerId: ${manager.getContainerId()}`);
      
      setManagers(prev => ({
        ...prev,
        [editorKey]: manager,
      }));
      
      // 保存文档信息，用于语言切换时重新创建
      setEditorDocuments(prev => ({
        ...prev,
        [editorKey]: { fileName, file: file || undefined },
      }));
      
      // 强制更新UI
      forceUpdate((prev) => prev + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
      console.error('Document operation failed:', err);
    }
  };

  const handleExport = async (manager: EditorManager | null) => {
    if (!manager) {
      setError('编辑器未初始化');
      return;
    }
    
    try {
      const binData = await manager.export();
      
      // 从文件名或文件类型中提取扩展名
      const fileExt = binData.fileName.split('.').pop()?.toLowerCase() || 
                      binData.fileType?.toLowerCase() || 
                      'docx';
      
      // 根据扩展名确定 FILE_TYPE
      let actualFileType: typeof FILE_TYPE[keyof typeof FILE_TYPE];
      if (fileExt === 'xlsx' || fileExt === 'xls' || fileExt === 'csv') {
        actualFileType = FILE_TYPE.XLSX;
      } else if (fileExt === 'pptx' || fileExt === 'ppt') {
        actualFileType = FILE_TYPE.PPTX;
      } else {
        actualFileType = FILE_TYPE.DOCX; // 默认为 DOCX
      }
      
      const buffer = await convertBinToDocument(
        binData.binData, 
        binData.fileName, 
        actualFileType, 
        binData.media
      );
      
      const mimeTypes: Record<string, string> = {
        [FILE_TYPE.XLSX]: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        [FILE_TYPE.DOCX]: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        [FILE_TYPE.PPTX]: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      };
      
      const blob = new Blob([buffer.data], {
        type: mimeTypes[actualFileType] || 'application/octet-stream'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = binData.fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('导出失败:', err);
      setError('导出失败');
    }
  };

  const handleToggleReadOnly = async (editorKey: 'editor1' | 'editor2' | 'editor3') => {
    const managerKey = editorKey.replace('editor', 'manager') as keyof typeof managers;
    const manager = managers[managerKey];
    
    if (!manager) {
      setError('编辑器未初始化');
      return;
    }
    
    const newReadOnly = !readOnlyStates[editorKey];
    setReadOnlyStates(prev => ({
      ...prev,
      [editorKey]: newReadOnly,
    }));
    
    try {
      await manager.setReadOnly(newReadOnly);
    } catch (err) {
      setError('切换模式失败');
      console.error('Failed to toggle read-only mode:', err);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        await initializeOnlyOffice();
        
        if (!initializedRef.current) {
          initializedRef.current = true;
          
          // 初始化三个编辑器：Word, Excel, PowerPoint
          await handleView('manager1', 'New_Document.docx');
          await handleView('manager2', 'New_Spreadsheet.xlsx');
          await handleView('manager3', 'New_Presentation.pptx');
        }
      } catch (err) {
        console.error('Failed to initialize OnlyOffice:', err);
        setError('无法加载编辑器组件');
      }
    };

    init();

    onlyofficeEventbus.on(ONLYOFFICE_EVENT_KEYS.DOCUMENT_READY, (data) => {
      forceUpdate((prev) => prev + 1);
    });

    const handleLoadingChange = (data: { loading: boolean }) => {
      setLoading(data.loading);
    };
    onlyofficeEventbus.on(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, handleLoadingChange);

    return () => {
      onlyofficeEventbus.off(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, handleLoadingChange);
      // 清理所有编辑器实例
      editorManagerFactory.destroyAll();
    };
  }, []);

  const renderEditorPanel = (
    editorKey: 'manager1' | 'manager2' | 'manager3',
    editorName: string,
    fileInputRef: React.RefObject<HTMLInputElement>,
    defaultFileType: typeof FILE_TYPE[keyof typeof FILE_TYPE],
    accept: string
  ) => {
    const manager = managers[editorKey];
    const editorNum = editorKey.replace('manager', 'editor') as keyof typeof readOnlyStates;
    const readOnly = readOnlyStates[editorNum];
    const containerId = `editor-${editorKey.replace('manager', '')}`;

    return (
      <div className="flex flex-col h-full min-h-[400px] md:min-h-0 border border-gray-200 rounded-lg overflow-hidden bg-white">
        {/* 控制栏 */}
        <div className="bg-gradient-to-r from-white to-gray-50 border-b border-gray-200 px-2 py-2 md:px-4 md:py-3 flex items-center gap-2 md:gap-3 flex-wrap flex-shrink-0">
          <div className="flex items-center gap-1 md:gap-2 mr-auto">
            <div className="w-5 h-5 md:w-6 md:h-6 bg-gradient-to-br rounded flex items-center justify-center text-xs font-bold">
              {editorKey.replace('manager', '')}
            </div>
            <h2 className="text-xs md:text-sm font-semibold text-gray-900">{editorName}</h2>
          </div>

          <div className="flex gap-1 md:gap-2 flex-wrap">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-2 py-1 md:px-3 md:py-1.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 transition-colors"
            >
              上传
            </button>
            <button
              onClick={() => handleView(editorKey, `New_Document.${defaultFileType.toLowerCase()}`)}
              className="px-2 py-1 md:px-3 md:py-1.5 bg-white border border-gray-300 rounded text-xs hover:bg-gray-50 transition-colors"
            >
              新建
            </button>
            {manager && (
              <>
                <button
                  onClick={() => handleExport(manager)}
                  className="px-2 py-1 md:px-3 md:py-1.5 bg-white border border-gray-300 rounded text-xs hover:bg-gray-50 transition-colors"
                >
                  💾
                </button>
                <button
                  onClick={() => handleToggleReadOnly(editorNum)}
                  className={`px-2 py-1 md:px-3 md:py-1.5 rounded text-xs transition-colors ${
                    readOnly
                      ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                      : 'bg-white border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {readOnly ? '🔒' : '✏️'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* 编辑器容器 */}
        <div className="flex-1 relative min-h-[350px] md:min-h-0">
          <div className="onlyoffice-container absolute inset-0" data-onlyoffice-container-id={containerId}>
            <div id={containerId} className="absolute inset-0" />
          </div>
        </div>

        {/* 隐藏的文件输入 */}
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              handleView(editorKey, file.name, file);
              if (fileInputRef.current) fileInputRef.current.value = '';
            }
          }}
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-screen md:min-h-0">
      {/* 顶部控制栏 */}
      <div className="bg-gradient-to-r from-white to-gray-50 border-b border-gray-200 shadow-sm flex-shrink-0">
        <div className="max-w-full mx-auto px-3 py-2 md:px-5 md:py-4 flex items-center gap-2 md:gap-4 flex-wrap">
          <div className="flex items-center gap-2 md:gap-3 mr-auto">
            <div className="w-6 h-6 md:w-8 md:h-8 bg-gradient-to-br from-purple-500 to-purple-700 rounded-lg flex items-center justify-center text-white font-bold text-xs md:text-base">
              M
            </div>
            <h1 className="text-sm md:text-lg font-semibold text-gray-900">muli instance编辑器演示</h1>
          </div>

          <div className="flex gap-2 md:gap-3 flex-wrap">
            <button
              onClick={handleLanguageSwitch}
              className="px-2 py-1 md:px-3 md:py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-xs md:text-sm font-medium"
              title={currentLang === ONLYOFFICE_LANG_KEY.ZH ? 'Switch to English' : '切换到中文'}
            >
              {currentLang === ONLYOFFICE_LANG_KEY.ZH ? 'EN' : '中文'}
            </button>
            <button
              onClick={() => {
                editorManagerFactory.destroyAll();
                setManagers({ manager1: null, manager2: null, manager3: null });
                setEditorDocuments({ manager1: null, manager2: null, manager3: null });
                forceUpdate((prev) => prev + 1);
              }}
              className="px-2 py-1 md:px-4 md:py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors text-xs md:text-sm"
            >
              清空
            </button>
          </div>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 md:p-4 mx-2 md:mx-4 mt-2 md:mt-4 rounded flex-shrink-0">
          <p className="font-medium text-sm md:text-base">错误：{error}</p>
        </div>
      )}

      {/* 多编辑器网格布局 */}
      <div className="flex-1 min-h-0 p-2 md:p-4 overflow-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 md:gap-4 h-full min-h-[500px] md:min-h-0">
          {renderEditorPanel('manager1', 'Word 编辑器', fileInputRef1, FILE_TYPE.DOCX, '.docx,.doc')}
          {renderEditorPanel('manager2', 'Excel 编辑器', fileInputRef2, FILE_TYPE.XLSX, '.xlsx,.xls,.csv')}
          {renderEditorPanel('manager3', 'PowerPoint 编辑器', fileInputRef3, FILE_TYPE.PPTX, '.pptx,.ppt')}
        </div>
      </div>

      {/* 加载遮罩 */}
      {loading && <Loading />}
    </div>
  );
}

export default function MultiInstancePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen">加载中...</div>}>
      <MultiInstancePageContent />
    </Suspense>
  );
}

