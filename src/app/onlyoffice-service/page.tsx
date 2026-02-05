'use client'

import { useEffect, useRef } from 'react'
import {
  createEditorView,
  initializeOnlyOffice,
  setDocmentObj,
  getDocmentObj,
  getOnlyOfficeLang,
  setCurrentLang,
  editorManagerFactory,
  ONLYOFFICE_EVENT_KEYS,
  ONLYOFFICE_ID,
  onlyofficeEventbus,
} from '@/onlyoffice-comp'

export default function OnlyOfficeServicePage() {
  const initializedRef = useRef(false);
  const instanceMapRef = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    const initOnlyOffice = async () => {
      if (!initializedRef.current) {
        await initializeOnlyOffice();
        initializedRef.current = true;
      }
    };

    initOnlyOffice();

    const handleMessage = async (event: MessageEvent) => {
      const { type, requestId, data } = event.data || {};
      if (!type) return;

      try {
        switch (type) {
          case 'CREATE_EDITOR': {
            await initOnlyOffice();
            const { fileName, fileData, isNew, readOnly, lang, containerId } = data;
            
            let file: File | undefined;
            if (fileData && !isNew) {
              const uint8Array = new Uint8Array(fileData);
              const blob = new Blob([uint8Array]);
              const ext = fileName.split('.').pop()?.toLowerCase() || '';
              const mimeTypes: Record<string, string> = {
                'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'xls': 'application/vnd.ms-excel',
                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'doc': 'application/msword',
                'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'ppt': 'application/vnd.ms-powerpoint',
              };
              file = new File([blob], fileName, { type: mimeTypes[ext] || 'application/octet-stream' });
            }

            setDocmentObj({ fileName, file });
            const { fileName: currentFileName, file: currentFile } = getDocmentObj();
            if (lang) setCurrentLang(lang);

            const containerId_actual = containerId || ONLYOFFICE_ID;
            let manager = editorManagerFactory.get(containerId_actual);
            if (!manager) manager = editorManagerFactory.create(containerId_actual);

            const editorManager = await createEditorView({
              file: currentFile,
              fileName: currentFileName,
              isNew: !currentFile,
              readOnly: readOnly ?? false,
              lang: lang || getOnlyOfficeLang(),
              containerId: containerId_actual,
              editorManager: manager,
            });

            const instanceId = editorManager.getInstanceId();
            instanceMapRef.current.set(instanceId, editorManager);

            onlyofficeEventbus.on(ONLYOFFICE_EVENT_KEYS.DOCUMENT_READY, () => {
              window.parent.postMessage({
                type: 'DOCUMENT_READY',
                data: { instanceId, containerId: editorManager.getContainerId() },
              }, '*');
            });

            onlyofficeEventbus.on(ONLYOFFICE_EVENT_KEYS.LOADING_CHANGE, (loadingData: { loading: boolean }) => {
              window.parent.postMessage({
                type: 'LOADING_CHANGE',
                data: { instanceId, loading: Boolean(loadingData?.loading) },
              }, '*');
            });

            window.parent.postMessage({
              type: 'RESPONSE',
              requestId,
              data: { instanceId, containerId: editorManager.getContainerId() },
            }, '*');
            break;
          }

          case 'SET_READ_ONLY': {
            const manager = instanceMapRef.current.get(data.instanceId);
            if (!manager) throw new Error(`Editor instance not found: ${data.instanceId}`);
            await manager.setReadOnly(data.readOnly);
            window.parent.postMessage({ type: 'RESPONSE', requestId, data: { success: true } }, '*');
            break;
          }

          case 'EXPORT': {
            const manager = instanceMapRef.current.get(data.instanceId);
            if (!manager) throw new Error(`Editor instance not found: ${data.instanceId}`);
            const exportData = await manager.export();
            const binData = exportData.binData instanceof Uint8Array
              ? Array.from(exportData.binData)
              : Array.from(new Uint8Array(exportData.binData));
            window.parent.postMessage({
              type: 'RESPONSE',
              requestId,
              data: { fileName: exportData.fileName, fileType: exportData.fileType, binData, media: exportData.media },
            }, '*');
            break;
          }

          case 'DESTROY': {
            const manager = instanceMapRef.current.get(data.instanceId);
            if (manager) {
              manager.destroy();
              instanceMapRef.current.delete(data.instanceId);
            }
            window.parent.postMessage({ type: 'RESPONSE', requestId, data: { success: true } }, '*');
            break;
          }
        }
      } catch (error) {
        window.parent.postMessage({
          type: 'RESPONSE',
          requestId,
          error: error instanceof Error ? error.message : 'Unknown error',
        }, '*');
      }
    };

    window.addEventListener('message', handleMessage);
    
    const sendReady = () => window.parent.postMessage({ type: 'SERVICE_READY' }, '*');
    if (document.readyState === 'complete') {
      setTimeout(sendReady, 100);
    } else {
      window.addEventListener('load', () => setTimeout(sendReady, 100), { once: true });
      setTimeout(sendReady, 500);
    }

    return () => {
      window.removeEventListener('message', handleMessage);
      instanceMapRef.current.forEach(manager => manager.destroy());
      instanceMapRef.current.clear();
    };
  }, []);

  return (
    <div
      className="onlyoffice-container"
      style={{
        width: '100%',
        height: '100%',
        margin: 0,
        padding: 0,
        overflow: 'hidden',
        backgroundColor: '#fff',
        position: 'relative',
      }}
    />
  );
}
