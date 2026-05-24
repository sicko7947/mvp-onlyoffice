'use client';

/**
 * v9 upgrade smoke harness.
 *
 * Exercises the three HIGH-risk integration surfaces identified in the v7→v9 audit:
 *   1. x2t round-trip:   DOCX/XLSX/PPTX → bin → DOCX/XLSX/PPTX
 *   2. asc_openDocument: editor mounts and signals onAppReady + onDocumentReady
 *   3. writeFile event:  inline image paste triggers asc_writeFileCallback
 *
 * Set NEXT_PUBLIC_ONLYOFFICE_VERSION=7 (default) for the v7 baseline; set =9 to
 * regression-test the v9 bundle once `./scripts/onlyoffice-build/build.sh` has populated
 * `public/packages/onlyoffice/9/`.
 */

import { useEffect, useRef, useState } from 'react';
import {
  ONLYOFFICE_ID,
  ONLYOFFICE_CONTAINER_CONFIG,
  ONLYOFFICE_EVENT_KEYS,
  editorManager,
  initializeOnlyOffice,
  setDocmentObj,
  createEditorView,
  convertBinToDocument,
  onlyofficeEventbus,
} from '@/onlyoffice-comp';
import { convertDocument } from '@/onlyoffice-comp/lib/x2t';

type Status = 'idle' | 'running' | 'pass' | 'fail';

interface TestRow {
  id: string;
  label: string;
  status: Status;
  detail?: string;
  durationMs?: number;
}

const INITIAL_TESTS: TestRow[] = [
  { id: 'x2t-roundtrip', label: '1. x2t round-trip (DOCX → bin → DOCX)', status: 'idle' },
  { id: 'editor-open', label: '2. asc_openDocument (editor reaches onDocumentReady)', status: 'idle' },
  { id: 'write-file', label: '3. writeFile (image paste → asc_writeFileCallback)', status: 'idle' },
];

function setRow(rows: TestRow[], id: string, patch: Partial<TestRow>): TestRow[] {
  return rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
}

const ONLYOFFICE_VERSION = process.env.NEXT_PUBLIC_ONLYOFFICE_VERSION ?? '7';

export default function SmokePage() {
  const [tests, setTests] = useState<TestRow[]>(INITIAL_TESTS);
  const [file, setFile] = useState<File | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const log = (line: string) =>
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${line}`]);

  useEffect(() => {
    return () => {
      if (editorManager.exists()) editorManager.destroy();
    };
  }, []);

  // --------------------------------------------------------------------
  // Test 1: x2t round-trip
  // --------------------------------------------------------------------
  const runRoundTrip = async () => {
    if (!file) return;
    const id = 'x2t-roundtrip';
    setTests((t) => setRow(t, id, { status: 'running', detail: undefined }));
    const t0 = performance.now();
    try {
      log(`[1] convertDocument(${file.name}) — file → bin`);
      await initializeOnlyOffice();
      const forward = await convertDocument(file);
      const binBytes =
        forward.bin instanceof Uint8Array
          ? forward.bin
          : forward.bin instanceof ArrayBuffer
            ? new Uint8Array(forward.bin)
            : new Uint8Array(await new Blob([forward.bin]).arrayBuffer());
      log(`[1] bin size = ${binBytes.byteLength} bytes; type = ${forward.type}`);

      const ext = file.name.split('.').pop()?.toUpperCase() ?? 'DOCX';
      log(`[1] convertBinToDocument(bin → .${ext})`);
      const reverse = await convertBinToDocument(
        binBytes,
        `roundtrip-${file.name}`,
        ext,
        forward.media,
      );
      const outBlob = new Blob([reverse.data]);
      const dt = performance.now() - t0;
      const sizeRatio = ((outBlob.size / file.size) * 100).toFixed(1);
      setTests((t) =>
        setRow(t, id, {
          status: 'pass',
          detail: `round-trip ok — out ${outBlob.size}B (${sizeRatio}% of input)`,
          durationMs: Math.round(dt),
        })
      );
    } catch (err) {
      setTests((t) =>
        setRow(t, id, {
          status: 'fail',
          detail: err instanceof Error ? err.message : String(err),
          durationMs: Math.round(performance.now() - t0),
        })
      );
      log(`[1] FAIL: ${err}`);
    }
  };

  // --------------------------------------------------------------------
  // Test 2: editor opens via asc_openDocument and signals ready
  // --------------------------------------------------------------------
  const runEditorOpen = async () => {
    if (!file) return;
    const id = 'editor-open';
    setTests((t) => setRow(t, id, { status: 'running', detail: undefined }));
    const t0 = performance.now();
    try {
      log(`[2] mounting editor for ${file.name}`);
      await initializeOnlyOffice();
      setDocmentObj({ fileName: file.name, file });
      const readyPromise = onlyofficeEventbus.waitFor(
        ONLYOFFICE_EVENT_KEYS.DOCUMENT_READY,
        20000,
      );
      await createEditorView({
        file,
        fileName: file.name,
        isNew: false,
        readOnly: false,
      });
      await readyPromise;
      const dt = performance.now() - t0;
      setTests((t) =>
        setRow(t, id, {
          status: 'pass',
          detail: 'editor reached documentReady',
          durationMs: Math.round(dt),
        })
      );
      log('[2] documentReady fired');
    } catch (err) {
      setTests((t) =>
        setRow(t, id, {
          status: 'fail',
          detail: err instanceof Error ? err.message : String(err),
          durationMs: Math.round(performance.now() - t0),
        })
      );
      log(`[2] FAIL: ${err}`);
    }
  };

  // --------------------------------------------------------------------
  // Test 3: writeFile event fires when sdkjs requests an image upload
  // --------------------------------------------------------------------
  const runWriteFile = async () => {
    const id = 'write-file';
    setTests((t) => setRow(t, id, { status: 'running', detail: undefined }));
    const t0 = performance.now();
    try {
      if (!editorManager.exists()) {
        throw new Error('run test 2 first — editor must be mounted');
      }
      log('[3] waiting for writeFile event (paste an image into the editor within 30s)');
      const writePromise = new Promise<unknown>((resolve, reject) => {
        const handler = (payload: unknown) => {
          window.removeEventListener('message', listener);
          resolve(payload);
        };
        const listener = (ev: MessageEvent) => {
          let data: { event?: string } | undefined;
          try {
            data = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
          } catch {
            return;
          }
          if (data?.event === 'writeFile' || data?.event === 'onRequestSaveAs') {
            handler(data);
          }
        };
        window.addEventListener('message', listener);
        setTimeout(() => {
          window.removeEventListener('message', listener);
          reject(new Error('timeout — no writeFile/onRequestSaveAs event in 30s'));
        }, 30000);
      });
      const payload = await writePromise;
      const dt = performance.now() - t0;
      setTests((t) =>
        setRow(t, id, {
          status: 'pass',
          detail: `event received: ${JSON.stringify(payload).slice(0, 80)}`,
          durationMs: Math.round(dt),
        })
      );
      log('[3] writeFile event received');
    } catch (err) {
      setTests((t) =>
        setRow(t, id, {
          status: 'fail',
          detail: err instanceof Error ? err.message : String(err),
          durationMs: Math.round(performance.now() - t0),
        })
      );
      log(`[3] FAIL: ${err}`);
    }
  };

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 1100 }}>
      <h1 style={{ margin: 0 }}>OnlyOffice v9 upgrade smoke harness</h1>
      <p style={{ color: '#666' }}>
        Bundle in use: <strong>v{ONLYOFFICE_VERSION}</strong>
        {' — '}
        switch by setting <code>NEXT_PUBLIC_ONLYOFFICE_VERSION=9</code> and restarting{' '}
        <code>bun dev</code>.
      </p>

      <section style={{ marginTop: 16 }}>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
          Test document (DOCX / XLSX / PPTX)
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,.xlsx,.pptx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {file && (
          <span style={{ marginLeft: 12, color: '#666' }}>
            {file.name} — {file.size.toLocaleString()} B
          </span>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
              <th style={{ padding: 8 }}>Test</th>
              <th style={{ padding: 8, width: 100 }}>Status</th>
              <th style={{ padding: 8, width: 80 }}>Duration</th>
              <th style={{ padding: 8 }}>Detail</th>
              <th style={{ padding: 8, width: 100 }}>Run</th>
            </tr>
          </thead>
          <tbody>
            {tests.map((t) => (
              <tr key={t.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: 8 }}>{t.label}</td>
                <td style={{ padding: 8 }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 4,
                      background:
                        t.status === 'pass'
                          ? '#d4edda'
                          : t.status === 'fail'
                            ? '#f8d7da'
                            : t.status === 'running'
                              ? '#fff3cd'
                              : '#e9ecef',
                      color:
                        t.status === 'pass'
                          ? '#155724'
                          : t.status === 'fail'
                            ? '#721c24'
                            : t.status === 'running'
                              ? '#856404'
                              : '#495057',
                    }}
                  >
                    {t.status}
                  </span>
                </td>
                <td style={{ padding: 8, color: '#666' }}>
                  {t.durationMs != null ? `${t.durationMs}ms` : '—'}
                </td>
                <td style={{ padding: 8, color: '#666', fontFamily: 'monospace', fontSize: 12 }}>
                  {t.detail ?? '—'}
                </td>
                <td style={{ padding: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (t.id === 'x2t-roundtrip') void runRoundTrip();
                      if (t.id === 'editor-open') void runEditorOpen();
                      if (t.id === 'write-file') void runWriteFile();
                    }}
                    disabled={
                      (!file && t.id !== 'write-file') || t.status === 'running'
                    }
                  >
                    Run
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>Editor (test 2/3 mount here)</h3>
        <div
          className={ONLYOFFICE_CONTAINER_CONFIG.PARENT_CLASS_NAME}
          style={{ position: 'relative', width: '100%', height: 600, border: '1px solid #ddd' }}
        >
          <div id={ONLYOFFICE_ID} style={{ width: '100%', height: '100%' }} />
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <h3>Log</h3>
        <pre
          style={{
            background: '#1e1e1e',
            color: '#d4d4d4',
            padding: 12,
            borderRadius: 4,
            maxHeight: 200,
            overflow: 'auto',
            fontSize: 12,
          }}
        >
          {logs.length === 0 ? '(no events yet)' : logs.join('\n')}
        </pre>
      </section>
    </div>
  );
}
