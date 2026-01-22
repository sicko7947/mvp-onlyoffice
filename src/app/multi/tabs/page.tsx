'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import {
  createEditorView,
  convertBinToDocument,
  initializeOnlyOffice,
  getOnlyOfficeLang,
  editorManagerFactory,
  EditorManager,
  FILE_TYPE,
  ONLYOFFICE_LANG_KEY,
} from '@/onlyoffice-comp';
import Loading from '@/components/Loading';

interface TabCacheItem {
  id: string;
  lastAccessed: number;
  renderProps: {
    fileName: string;
    file?: File;
    containerId: string;
    manager?: EditorManager;
  };
}

/**
 * useTabCache - Tab 缓存管理 Hook
 * 实现 LRU 缓存策略，管理多个编辑器实例
 */
function useTabCache(options: { maxCacheSize?: number; enableCache?: boolean } = {}) {
  const { maxCacheSize = 5, enableCache = true } = options;
  const cacheRef = useRef<Map<string, TabCacheItem>>(new Map());
  const [cachedTabIds, setCachedTabIds] = useState<string[]>([]);

  const updateCachedTabIds = useCallback(() => {
    setCachedTabIds(Array.from(cacheRef.current.keys()));
  }, []);

  const addToCache = useCallback(
    (tabId: string, renderProps: TabCacheItem['renderProps']) => {
      if (!enableCache) return;

      const cache = cacheRef.current;
      const now = Date.now();

      cache.set(tabId, {
        id: tabId,
        lastAccessed: now,
        renderProps,
      });

      // LRU: 如果缓存超过大小限制，移除最久未使用的项
      while (cache.size > maxCacheSize) {
        let oldestKey = '';
        let oldestTime = Number.MAX_SAFE_INTEGER;

        for (const [key, item] of cache.entries()) {
          if (item.lastAccessed < oldestTime) {
            oldestTime = item.lastAccessed;
            oldestKey = key;
          }
        }

        if (oldestKey) {
          const oldItem = cache.get(oldestKey);
          // 销毁旧的编辑器实例
          if (oldItem?.renderProps.manager) {
            try {
              oldItem.renderProps.manager.destroy();
            } catch (err) {
              console.warn('Failed to destroy old editor:', err);
            }
          }
          cache.delete(oldestKey);
        } else {
          break;
        }
      }

      updateCachedTabIds();
    },
    [enableCache, maxCacheSize, updateCachedTabIds]
  );

  const getFromCache = useCallback(
    (tabId: string) => {
      if (!enableCache) return null;

      const cache = cacheRef.current;
      const item = cache.get(tabId);

      if (item) {
        item.lastAccessed = Date.now();
        return item.renderProps;
      }

      return null;
    },
    [enableCache]
  );

  const removeFromCache = useCallback(
    (tabId: string) => {
      const item = cacheRef.current.get(tabId);
      if (item?.renderProps.manager) {
        try {
          item.renderProps.manager.destroy();
        } catch (err) {
          console.warn('Failed to destroy editor:', err);
        }
      }
      cacheRef.current.delete(tabId);
      updateCachedTabIds();
    },
    [updateCachedTabIds]
  );

  const clearCache = useCallback(() => {
    cacheRef.current.forEach((item) => {
      if (item.renderProps.manager) {
        try {
          item.renderProps.manager.destroy();
        } catch (err) {
          console.warn('Failed to destroy editor:', err);
        }
      }
    });
    cacheRef.current.clear();
    updateCachedTabIds();
  }, [updateCachedTabIds]);

  const getCacheStats = useCallback(() => {
    const cache = cacheRef.current;
    return {
      size: cache.size,
      maxSize: maxCacheSize,
      keys: Array.from(cache.keys()),
    };
  }, [maxCacheSize]);

  const isCached = useCallback((tabId: string) => {
    return cacheRef.current.has(tabId);
  }, []);

  return {
    addToCache,
    getFromCache,
    removeFromCache,
    clearCache,
    getCacheStats,
    isCached,
    cachedTabIds,
  };
}

export default function TabsPage() {
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Array<{ id: string; name: string; fileName: string }>>([]);
  const tabCounterRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tabFileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingTabs, setPendingTabs] = useState<Array<{ tabId: string; fileName: string; file?: File }>>([]);
  const [readOnlyStates, setReadOnlyStates] = useState<Map<string, boolean>>(new Map());

  const {
    addToCache,
    getFromCache,
    removeFromCache,
    clearCache,
    getCacheStats,
    isCached,
    cachedTabIds,
  } = useTabCache({ maxCacheSize: 5, enableCache: true });

  // 初始化 OnlyOffice
  useEffect(() => {
    initializeOnlyOffice().catch((err) => {
      console.error('Failed to initialize OnlyOffice:', err);
      setError('无法加载编辑器组件');
    });
  }, []);

  // 处理待创建的 Tab（确保 DOM 已更新）
  useEffect(() => {
    if (pendingTabs.length === 0) {
      setLoading(false);
      return;
    }

    const processPendingTab = async () => {
      const pending = pendingTabs[0];
      if (!pending) {
        setLoading(false);
        return;
      }

      const { tabId, fileName, file } = pending;
      const containerId = `editor-${tabId}`;

      try {
        // 等待容器元素渲染（最多等待 2 秒）
        let containerFound = false;
        for (let i = 0; i < 40; i++) {
          const container = document.getElementById(containerId);
          if (container) {
            containerFound = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        if (!containerFound) {
          throw new Error(`容器元素 ${containerId} 未找到`);
        }

        console.log(`[TabCache] Creating editor for tab ${tabId}, containerId: ${containerId}`);

        // 创建编辑器实例
        const manager = await createEditorView({
          file,
          fileName,
          isNew: !file,
          readOnly: false,
          lang: getOnlyOfficeLang(),
          containerId,
        });

        // 添加到缓存
        addToCache(tabId, {
          fileName,
          file,
          containerId,
          manager,
        });

        console.log(`[TabCache] Tab ${tabId} created successfully`);

        // 移除已处理的待创建项
        setPendingTabs((prev) => prev.slice(1));
        setLoading(false);
      } catch (err) {
        console.error('Failed to create tab:', err);
        setError(err instanceof Error ? err.message : '创建 Tab 失败');
        // 移除失败的 tab
        setTabs((prev) => prev.filter((tab) => tab.id !== tabId));
        setPendingTabs((prev) => prev.slice(1));
        setLoading(false);
      }
    };

    processPendingTab();
  }, [pendingTabs, addToCache]);

  // 创建新 Tab
  const createTab = useCallback((fileName: string, file?: File) => {
    const tabId = `tab-${++tabCounterRef.current}`;

    // 检查缓存
    const cached = getFromCache(tabId);
    if (cached) {
      console.log(`[TabCache] Using cached tab: ${tabId}`);
      setActiveTabId(tabId);
      return;
    }

    setLoading(true);
    setError(null);

    // 先添加到 tabs 列表，确保容器会被渲染
    setTabs((prev) => [...prev, { id: tabId, name: fileName, fileName }]);
    setActiveTabId(tabId);

    // 添加到待创建队列，由 useEffect 处理
    setPendingTabs((prev) => [...prev, { tabId, fileName, file }]);
  }, [getFromCache]);

  // 切换 Tab
  const switchTab = useCallback(
    (tabId: string) => {
      const cached = getFromCache(tabId);
      if (cached) {
        console.log(`[TabCache] Switching to cached tab: ${tabId}`);
        setActiveTabId(tabId);
      } else {
        console.warn(`[TabCache] Tab not found in cache: ${tabId}`);
      }
    },
    [getFromCache]
  );

  // 关闭 Tab
  const closeTab = useCallback(
    (tabId: string) => {
      removeFromCache(tabId);
      setTabs((prev) => prev.filter((tab) => tab.id !== tabId));
      setReadOnlyStates((prev) => {
        const newMap = new Map(prev);
        newMap.delete(tabId);
        return newMap;
      });
      tabFileInputRefs.current.delete(tabId);
      if (activeTabId === tabId) {
        const remainingTabs = tabs.filter((tab) => tab.id !== tabId);
        setActiveTabId(remainingTabs.length > 0 ? remainingTabs[0].id : null);
      }
    },
    [activeTabId, tabs, removeFromCache]
  );

  // 导出文档
  const handleExport = useCallback(async (tabId: string) => {
    const cached = getFromCache(tabId);
    if (!cached || !cached.manager) {
      setError('编辑器未初始化');
      return;
    }

    try {
      setLoading(true);
      const binData = await cached.manager.export();

      // 从文件名或文件类型中提取扩展名
      const fileExt = binData.fileName.split('.').pop()?.toLowerCase() || 
                      binData.fileType?.toLowerCase() || 
                      'xlsx';

      // 根据扩展名确定 FILE_TYPE
      let actualFileType: typeof FILE_TYPE[keyof typeof FILE_TYPE];
      if (fileExt === 'xlsx' || fileExt === 'xls' || fileExt === 'csv') {
        actualFileType = FILE_TYPE.XLSX;
      } else if (fileExt === 'pptx' || fileExt === 'ppt') {
        actualFileType = FILE_TYPE.PPTX;
      } else {
        actualFileType = FILE_TYPE.DOCX;
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
    } finally {
      setLoading(false);
    }
  }, [getFromCache]);

  // 切换只读模式
  const handleToggleReadOnly = useCallback(async (tabId: string) => {
    const cached = getFromCache(tabId);
    if (!cached || !cached.manager) {
      setError('编辑器未初始化');
      return;
    }

    const currentReadOnly = readOnlyStates.get(tabId) || false;
    const newReadOnly = !currentReadOnly;

    try {
      setLoading(true);
      
      // 如果 tab 不是当前激活的，先切换到它，确保容器可见
      const wasNotActive = activeTabId !== tabId;
      if (wasNotActive) {
        setActiveTabId(tabId);
        // 等待 tab 切换完成，容器显示
        await new Promise((resolve) => setTimeout(resolve, 150));
      }

      // 确保容器元素可见
      const containerId = cached.containerId;
      const parentContainer = document.querySelector(
        `[data-onlyoffice-container-id="${containerId}"]`
      ) as HTMLElement;

      if (parentContainer) {
        // 临时显示容器，确保编辑器可以正确创建
        const originalDisplay = parentContainer.style.display;
        const originalVisibility = parentContainer.style.visibility;
        const originalZIndex = parentContainer.style.zIndex;
        
        parentContainer.style.display = 'block';
        parentContainer.style.visibility = 'visible';
        parentContainer.style.zIndex = '999';

        try {
          // 如果从只读切换到可编辑，需要先导出最新数据
          if (currentReadOnly && !newReadOnly) {
            // 先导出当前文档数据，确保使用最新内容
            try {
              const binData = await cached.manager.export();
              // 更新缓存中的文档信息
              addToCache(tabId, {
                ...cached,
                fileName: binData.fileName,
                file: cached.file, // 保留原始文件引用
              });
            } catch (exportErr) {
              console.warn('Failed to export before switching to edit mode:', exportErr);
              // 继续执行，使用现有配置
            }
          }

          // 执行切换
          await cached.manager.setReadOnly(newReadOnly);
          
          // 更新状态
          setReadOnlyStates((prev) => {
            const newMap = new Map(prev);
            newMap.set(tabId, newReadOnly);
            return newMap;
          });

          // 恢复容器样式
          if (activeTabId === tabId) {
            parentContainer.style.display = 'block';
            parentContainer.style.zIndex = '1';
            parentContainer.style.visibility = 'visible';
          } else {
            parentContainer.style.display = originalDisplay || 'none';
            parentContainer.style.zIndex = originalZIndex || '0';
            parentContainer.style.visibility = originalVisibility || 'hidden';
          }
        } catch (err) {
          // 恢复容器样式
          parentContainer.style.display = originalDisplay || 'none';
          parentContainer.style.zIndex = originalZIndex || '0';
          parentContainer.style.visibility = originalVisibility || 'hidden';
          throw err;
        }
      } else {
        // 如果找不到容器，直接执行切换
        await cached.manager.setReadOnly(newReadOnly);
        setReadOnlyStates((prev) => {
          const newMap = new Map(prev);
          newMap.set(tabId, newReadOnly);
          return newMap;
        });
      }
    } catch (err) {
      setError('切换模式失败');
      console.error('Failed to toggle read-only mode:', err);
    } finally {
      setLoading(false);
    }
  }, [getFromCache, readOnlyStates, activeTabId, addToCache]);

  // 更新 Tab 内容（导入文件到现有 Tab）
  const handleUpdateTab = useCallback(async (tabId: string, file: File) => {
    setLoading(true);
    setError(null);

    try {
      // 获取现有缓存
      const cached = getFromCache(tabId);
      const containerId = `editor-${tabId}`;

      // 如果存在旧实例，先销毁
      if (cached && cached.manager) {
        try {
          cached.manager.destroy();
        } catch (err) {
          console.warn('Failed to destroy old editor:', err);
        }
        removeFromCache(tabId);
      }

      // 更新 tab 名称
      setTabs((prev) =>
        prev.map((tab) => (tab.id === tabId ? { ...tab, name: file.name, fileName: file.name } : tab))
      );

      // 等待容器元素存在
      let containerFound = false;
      for (let i = 0; i < 40; i++) {
        const container = document.getElementById(containerId);
        if (container) {
          containerFound = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      if (!containerFound) {
        throw new Error(`容器元素 ${containerId} 未找到`);
      }

      // 创建新的编辑器实例
      const manager = await createEditorView({
        file,
        fileName: file.name,
        isNew: false,
        readOnly: readOnlyStates.get(tabId) || false,
        lang: getOnlyOfficeLang(),
        containerId,
      });

      // 更新缓存
      addToCache(tabId, {
        fileName: file.name,
        file,
        containerId,
        manager,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新 Tab 失败');
      console.error('Failed to update tab:', err);
    } finally {
      setLoading(false);
    }
  }, [getFromCache, removeFromCache, addToCache, readOnlyStates]);

  // 清空所有
  const handleClearAll = useCallback(() => {
    clearCache();
    setTabs([]);
    setActiveTabId(null);
  }, [clearCache]);

  const stats = getCacheStats();

  return (
    <div className="flex flex-col h-screen">
      {/* 顶部控制栏 */}
      <div className="bg-gradient-to-r from-white to-gray-50 border-b border-gray-200 shadow-sm">
        <div className="max-w-full mx-auto px-5 py-4 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3 mr-auto">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center text-white font-bold">
              T
            </div>
            <h1 className="text-lg font-semibold text-gray-900">Tab 缓存演示</h1>
          </div>

          <div className="flex gap-3 flex-wrap items-center">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors text-sm"
            >
              上传文件
            </button>
            <button
              onClick={() => createTab(`New_Spreadsheet_${Date.now()}.xlsx`)}
              className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-sm"
            >
              新建 Excel
            </button>
            <button
              onClick={() => createTab(`New_Document_${Date.now()}.docx`)}
              className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-sm"
            >
              新建 Word
            </button>
            <button
              onClick={() => createTab(`New_Presentation_${Date.now()}.pptx`)}
              className="px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-sm"
            >
              新建 PPT
            </button>
            <button
              onClick={handleClearAll}
              className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors text-sm"
            >
              清空所有
            </button>
            <div className="text-xs text-gray-600 px-2 py-1 bg-gray-100 rounded">
              缓存: {stats.size}/{stats.maxSize}
            </div>
          </div>
        </div>
      </div>

      {/* Tab 标签栏 */}
      {tabs.length > 0 && (
        <div className="bg-white border-b border-gray-200">
          <div className="flex items-center gap-1 overflow-x-auto px-2">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`flex items-center gap-2 px-3 py-2 border-b-2 transition-colors cursor-pointer ${
                  activeTabId === tab.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-transparent hover:bg-gray-50'
                }`}
                onClick={() => switchTab(tab.id)}
              >
                <span className="text-sm font-medium text-gray-700">{tab.name}</span>
                {isCached(tab.id) && (
                  <span className="text-xs text-green-600" title="已缓存">
                    💾
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                  }}
                  className="text-gray-400 hover:text-gray-600 text-xs"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          
          {/* Tab 操作栏（仅显示当前激活的 Tab） */}
          {activeTabId && (() => {
            const cached = getFromCache(activeTabId);
            const isReadOnly = readOnlyStates.get(activeTabId) || false;
            if (!cached) return null;
            
            return (
              <div className="bg-gray-50 border-t border-gray-200 px-4 py-2 flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => {
                    const input = tabFileInputRefs.current.get(activeTabId);
                    input?.click();
                  }}
                  className="px-3 py-1.5 bg-blue-500 text-white rounded text-xs hover:bg-blue-600 transition-colors"
                >
                  📤 导入文件
                </button>
                <button
                  onClick={() => handleExport(activeTabId)}
                  className="px-3 py-1.5 bg-white border border-gray-300 rounded text-xs hover:bg-gray-50 transition-colors"
                >
                  💾 导出
                </button>
                <button
                  onClick={() => handleToggleReadOnly(activeTabId)}
                  className={`px-3 py-1.5 rounded text-xs transition-colors ${
                    isReadOnly
                      ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                      : 'bg-white border border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {isReadOnly ? '🔒 只读' : '✏️ 编辑'}
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mx-4 mt-4 rounded">
          <p className="font-medium">错误：{error}</p>
        </div>
      )}

      {/* 编辑器容器 */}
      <div className="flex-1 relative overflow-hidden" id="tabs-editor-area">
        {tabs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <p className="text-lg mb-2">暂无打开的 Tab</p>
              <p className="text-sm">点击"新建 Excel"或"上传文件"开始</p>
            </div>
          </div>
        ) : (
          <div className="absolute inset-0">
            {tabs.map((tab) => {
              const containerId = `editor-${tab.id}`;
              const isActive = activeTabId === tab.id;
              const tabCached = getFromCache(tab.id);
              
              return (
                <div
                  key={tab.id}
                  className="onlyoffice-container absolute inset-0"
                  data-onlyoffice-container-id={containerId}
                  style={{ display: isActive ? 'block' : 'none', zIndex: isActive ? 1 : 0 }}
                >
                  <div id={containerId} className="absolute inset-0" />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 隐藏的文件输入 - 用于创建新 Tab */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv,.docx,.doc,.pptx,.ppt"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            createTab(file.name, file);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }
        }}
      />

      {/* 隐藏的文件输入 - 用于每个 Tab 的导入 */}
      {tabs.map((tab) => (
        <input
          key={`file-input-${tab.id}`}
          ref={(el) => {
            if (el) {
              tabFileInputRefs.current.set(tab.id, el);
            } else {
              tabFileInputRefs.current.delete(tab.id);
            }
          }}
          type="file"
          accept=".xlsx,.xls,.csv,.docx,.doc,.pptx,.ppt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              handleUpdateTab(tab.id, file);
              // 清空文件输入
              const input = tabFileInputRefs.current.get(tab.id);
              if (input) input.value = '';
            }
          }}
        />
      ))}

      {/* 加载遮罩 */}
      {loading && <Loading />}
    </div>
  );
}

