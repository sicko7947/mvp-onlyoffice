'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { onlyOfficeServiceClient, EditorInstance, OnlyOfficeServiceClient } from '@/onlyoffice-comp/service-client';
import Loading from '@/components/Loading';

function ExcelPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const editorInstanceRef = useRef<EditorInstance | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  const initializedRef = useRef(false);
  const defaultFileLoadedRef = useRef(false);
  const [_, forceUpdate] = useState(0);
  const [currentLang, setCurrentLangState] = useState<'zh' | 'en'>(OnlyOfficeServiceClient.ONLYOFFICE_LANG_KEY.EN);

  // 监听 URL 参数变化，更新语言状态
  useEffect(() => {
    const lang = onlyOfficeServiceClient.getCurrentLang();
    setCurrentLangState(lang as 'zh' | 'en');
  }, [searchParams]);

  // 切换语言
  const handleLanguageSwitch = async () => {
    const newLang = currentLang === OnlyOfficeServiceClient.ONLYOFFICE_LANG_KEY.ZH 
      ? OnlyOfficeServiceClient.ONLYOFFICE_LANG_KEY.EN 
      : OnlyOfficeServiceClient.ONLYOFFICE_LANG_KEY.ZH;
    onlyOfficeServiceClient.setCurrentLang(newLang);
    setCurrentLangState(newLang);
    // 保留现有的 URL 参数，只更新 locale
    // 创建新的 URLSearchParams 对象，避免修改只读的 searchParams
    const currentParams = searchParams ? new URLSearchParams(searchParams.toString()) : new URLSearchParams();
    currentParams.set('locale', newLang);
    router.push(`${pathname}?${currentParams.toString()}`);
    
    // 如果编辑器已存在，重新创建以应用新语言
    if (editorInstanceRef.current) {
      const currentFileName = editorInstanceRef.current.containerId;
      // 重新加载当前文件（需要保存文件名）
      // 这里简化处理，实际应该保存文件名
      console.log('Language switched, editor will reload on next file operation');
    }
  };

  const handleView = async (fileName: string, file?: File) => {
    setError(null);
    try {
      setLoading(true);
      
      // 如果已有编辑器实例，先销毁
      if (editorInstanceRef.current) {
        await editorInstanceRef.current.destroy();
        editorInstanceRef.current = null;
        setEditorReady(false);
      }

      // 创建新编辑器实例
      const instance = await onlyOfficeServiceClient.createEditor({
        fileName,
        file,
        readOnly: readOnly,
        lang: currentLang,
      });

      editorInstanceRef.current = instance;
      
      // 强制更新UI，显示按钮
      forceUpdate((prev) => prev + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
      console.error('Document operation failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        // 等待容器元素准备好
        if (!containerRef.current) {
          // 如果容器还没准备好，稍后重试
          setTimeout(init, 100);
          return;
        }

        // 初始化 iframe（只初始化一次）
        if (!initializedRef.current) {
          // 创建 iframe 元素
          const iframe = document.createElement('iframe');
          iframe.style.width = '100%';
          iframe.style.height = '100%';
          iframe.style.border = 'none';
          iframe.style.display = 'block';
          containerRef.current.appendChild(iframe);
          iframeRef.current = iframe;
          
          // 传入 iframe 对象进行初始化（init 会设置 src URL）
          await onlyOfficeServiceClient.init(iframe);
          initializedRef.current = true;
        }

        // 监听事件
        const handleDocumentReady = () => {
          setEditorReady(true);
          setLoading(false);
          forceUpdate((prev) => prev + 1);
        };

        const handleLoadingChange = (data: { loading: boolean }) => {
          setLoading(data.loading);
        };

        onlyOfficeServiceClient.on('DOCUMENT_READY', handleDocumentReady);
        onlyOfficeServiceClient.on('LOADING_CHANGE', handleLoadingChange);

        // 默认加载 test.xlsx 文档（只在首次加载时执行）
        if (!defaultFileLoadedRef.current) {
          defaultFileLoadedRef.current = true;
          
          // 加载 public/test.xlsx 文件
          const response = await fetch('/test.xlsx');
          if (!response.ok) {
            throw new Error('无法加载 test.xlsx 文件');
          }
          const blob = await response.blob();
          const file = new File([blob], 'test.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          await handleView('test.xlsx', file);
        }

        return () => {
          onlyOfficeServiceClient.off('DOCUMENT_READY', handleDocumentReady);
          onlyOfficeServiceClient.off('LOADING_CHANGE', handleLoadingChange);
          if (editorInstanceRef.current) {
            editorInstanceRef.current.destroy();
          }
        };
      } catch (err) {
        console.error('Failed to initialize OnlyOffice:', err);
        setError('无法加载编辑器组件');
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* 控制栏 */}
      <div className="bg-gradient-to-r from-white to-gray-50 border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-5 py-4 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3 mr-auto">
            <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-green-700 rounded-lg flex items-center justify-center text-white font-bold">
              E
            </div>
            <h1 className="text-lg font-semibold text-gray-900">Excel</h1>
          </div>

          <div className="flex gap-3 flex-wrap">
            <button
              onClick={handleLanguageSwitch}
              className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm font-medium"
              title={currentLang === OnlyOfficeServiceClient.ONLYOFFICE_LANG_KEY.ZH ? 'Switch to English' : '切换到中文'}
            >
              {currentLang === OnlyOfficeServiceClient.ONLYOFFICE_LANG_KEY.ZH ? '点击切换EN' : '点击切换中文'}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              上传文档
            </button>
            <button
              onClick={() => handleView('New_Document.xlsx')}
              className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              新建 Excel
            </button>
            {editorInstanceRef.current && editorReady && (
              <>
                <button
                  onClick={async () => {
                    try {
                      setLoading(true);
                      // 使用 service-client 的导出方法，自动转换并下载
                      await editorInstanceRef.current!.export({
                        targetFileType: 'XLSX',
                        download: true,
                      });
                    } catch (err) {
                      setError('导出失败');
                      console.error('导出失败:', err);
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                >
                  💾 导出
                </button>
                <button
                  onClick={async () => {
                    const newReadOnly = !readOnly;
                    setReadOnly(newReadOnly);
                    try {
                      setLoading(true);
                      await editorInstanceRef.current!.setReadOnly(newReadOnly);
                    } catch (err) {
                      setError('切换模式失败');
                      console.error('Failed to toggle read-only mode:', err);
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className={`px-4 py-2 rounded-md transition-colors ${
                    readOnly
                      ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                      : 'bg-white border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {readOnly ? '🔒 只读模式' : '✏️ 编辑模式'}
                </button>
                
              </>
            )}
          </div>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mx-4 mt-4 rounded">
          <p className="font-medium">错误：{error}</p>
        </div>
      )}

      {/* 编辑器容器 */}
      <div className="flex-1 relative" ref={containerRef} style={{ display: loading ? 'none' : 'block' }} />

      {/* 加载遮罩 */}
      {loading && <Loading />}


      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleView(file.name, file);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }
        }}
      />
    </div>
  );
}

export default function ExcelPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen">加载中...</div>}>
      <ExcelPageContent />
    </Suspense>
  );
}
