import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// We mock react-pdf so we don't need a real PDF in the test environment.
// The mock exposes the current `pageNumber` prop as a data attribute so we
// can assert that PDFViewer responds correctly to signal changes.
const pageCalls: number[] = [];

vi.mock('react-pdf', () => ({
  pdfjs: { GlobalWorkerOptions: {} },
  Document: ({
    onLoadSuccess,
    children,
  }: {
    onLoadSuccess?: (info: { numPages: number }) => void;
    children: React.ReactNode;
  }) => {
    // Synchronously simulate a 10-page PDF having loaded.
    if (onLoadSuccess) setTimeout(() => onLoadSuccess({ numPages: 10 }), 0);
    return <div data-testid="pdf-document">{children}</div>;
  },
  Page: ({ pageNumber }: { pageNumber: number }) => {
    pageCalls.push(pageNumber);
    return <div data-testid="pdf-page" data-page={pageNumber} />;
  },
}));

vi.mock('react-pdf/dist/Page/TextLayer.css', () => ({}));
vi.mock('react-pdf/dist/Page/AnnotationLayer.css', () => ({}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'mock-worker.js' }));

// Stub fetch -> minimal ArrayBuffer so the PDFViewer mount succeeds.
beforeEach(() => {
  pageCalls.length = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).fetch = vi.fn().mockResolvedValue({
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = {};
});

import { PDFViewer } from '../../src/components/PDFViewer';

describe('PDFViewer / requestedPageSignal', () => {
  it('jumps to the requested page when signal is provided', async () => {
    const { rerender } = render(
      <PDFViewer filePath="C:\\v\\doc.pdf" requestedPageSignal={{ page: 3, seq: 1 }} />
    );
    await waitFor(() => {
      expect(screen.getByTestId('pdf-page')).toHaveAttribute('data-page', '3');
    });

    rerender(
      <PDFViewer filePath="C:\\v\\doc.pdf" requestedPageSignal={{ page: 7, seq: 2 }} />
    );
    await waitFor(() => {
      expect(screen.getByTestId('pdf-page')).toHaveAttribute('data-page', '7');
    });
  });

  it('re-triggers jump even when page is identical (seq changed)', async () => {
    const { rerender } = render(
      <PDFViewer filePath="C:\\v\\doc.pdf" requestedPageSignal={{ page: 5, seq: 1 }} />
    );
    await waitFor(() => expect(screen.getByTestId('pdf-page')).toHaveAttribute('data-page', '5'));
    const beforeCount = pageCalls.length;

    // Same page, new seq → should re-render with page 5 again.
    rerender(
      <PDFViewer filePath="C:\\v\\doc.pdf" requestedPageSignal={{ page: 5, seq: 2 }} />
    );

    await waitFor(() => {
      // We expect a new render call since the signal changed.
      expect(pageCalls.length).toBeGreaterThan(beforeCount);
    });
    expect(screen.getByTestId('pdf-page')).toHaveAttribute('data-page', '5');
  });

  it('clamps the requested page to [1, numPages]', async () => {
    render(
      <PDFViewer filePath="C:\\v\\doc.pdf" requestedPageSignal={{ page: 999, seq: 1 }} />
    );
    // 10-page PDF, request 999 → should land on 10.
    await waitFor(() => {
      expect(screen.getByTestId('pdf-page')).toHaveAttribute('data-page', '10');
    });
  });

  it('honors legacy requestedPage prop (declarative)', async () => {
    render(<PDFViewer filePath="C:\\v\\doc.pdf" requestedPage={4} />);
    await waitFor(() => {
      expect(screen.getByTestId('pdf-page')).toHaveAttribute('data-page', '4');
    });
  });
});
