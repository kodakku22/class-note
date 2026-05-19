import { useEffect, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { toAppFileUrl } from '../utils/paths';

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

export type PdfPageSignal = {
  /** 1-based target page. Clamped to [1, numPages]. */
  page: number;
  /** Monotonic id. Different `seq` triggers a re-jump even to the same page. */
  seq: number;
};

type PDFViewerProps = {
  filePath: string;
  /** Legacy declarative prop (kept for backwards compat). Prefer
   *  `requestedPageSignal` for repeat-jump-to-same-page support. */
  requestedPage?: number;
  /** Signal-based page request — Viewer.tsx should prefer this over
   *  `requestedPage`. The viewer re-jumps every time `seq` changes. */
  requestedPageSignal?: PdfPageSignal;
};

export function PDFViewer({ filePath, requestedPage, requestedPageSignal }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [data, setData] = useState<Uint8Array | null>(null);
  const requestedSignalPage = requestedPageSignal?.page;
  const requestedSignalSeq = requestedPageSignal?.seq;

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setPage(1);
    fetch(toAppFileUrl(filePath))
      .then((r) => r.arrayBuffer())
      .then((buf) => { if (!cancelled) setData(new Uint8Array(buf)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [filePath]);

  // Signal-driven jump (preferred): re-jump on every `seq` change, even when
  // the same `page` is requested twice in a row. Also re-clamp when `numPages`
  // becomes known (signal may arrive before the document finishes loading).
  useEffect(() => {
    if (requestedSignalPage == null) return;
    const target = Math.max(1, Math.floor(requestedSignalPage));
    if (numPages > 0) setPage(Math.min(numPages, target));
    else setPage(target);
  }, [requestedSignalSeq, requestedSignalPage, numPages]);

  // Legacy declarative prop: kept so existing callers continue to work.
  useEffect(() => {
    if (requestedPage == null || !Number.isFinite(requestedPage)) return;
    if (numPages > 0) {
      setPage(Math.max(1, Math.min(numPages, Math.floor(requestedPage))));
    } else {
      setPage(Math.max(1, Math.floor(requestedPage)));
    }
  }, [requestedPage, numPages]);

  if (!data) {
    return <div className="empty-state">PDFを読み込み中...</div>;
  }

  return (
    <div className="pdf-viewer">
      <div className="pdf-controls">
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>◀</button>
        <span>{page} / {numPages || '...'}</span>
        <button onClick={() => setPage((p) => Math.min(numPages, p + 1))} disabled={page >= numPages}>▶</button>
        <span style={{ marginLeft: 12 }}>表示倍率:</span>
        <button onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}>－</button>
        <span>{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale((s) => Math.min(3, s + 0.2))}>＋</button>
      </div>
      <Document
        file={{ data }}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        loading={<div className="empty-state">読み込み中...</div>}
        error={<div className="empty-state">PDFを開けませんでした</div>}
      >
        <Page
          pageNumber={page}
          scale={scale}
          renderTextLayer={true}
          renderAnnotationLayer={true}
          className="pdf-page-canvas"
        />
      </Document>
    </div>
  );
}
