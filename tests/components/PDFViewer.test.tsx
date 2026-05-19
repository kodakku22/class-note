import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// Mock react-pdf
vi.mock('react-pdf', () => ({
  Document: ({ children, loading, error, onLoadSuccess }: any) => {
    // Simulate load success on mount
    setTimeout(() => onLoadSuccess?.({ numPages: 5 }), 0);
    return <div data-testid="pdf-doc">{children}</div>;
  },
  Page: ({ pageNumber, scale }: any) => (
    <div data-testid="pdf-page" data-page={pageNumber} data-scale={scale} />
  ),
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' } },
}));
vi.mock('react-pdf/dist/Page/TextLayer.css', () => ({}));
vi.mock('react-pdf/dist/Page/AnnotationLayer.css', () => ({}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '' }));

// Mock fetch for PDF data
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('../../src/utils/paths', () => ({
  toAppFileUrl: (p: string) => `file://${p}`,
}));

import { PDFViewer } from '../../src/components/PDFViewer';

describe('PDFViewer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockFetch.mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
    });
  });

  it('shows loading state initially', () => {
    // Make fetch never resolve
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<PDFViewer filePath="/test.pdf" />);
    expect(screen.getByText('PDFを読み込み中...')).toBeInTheDocument();
  });

  it('renders PDF controls after load', async () => {
    render(<PDFViewer filePath="/test.pdf" />);
    await waitFor(() => {
      expect(screen.getByTestId('pdf-doc')).toBeInTheDocument();
    });
    expect(screen.getByText('◀')).toBeInTheDocument();
    expect(screen.getByText('▶')).toBeInTheDocument();
    expect(screen.getByText('表示倍率:')).toBeInTheDocument();
  });

  it('shows page number', async () => {
    render(<PDFViewer filePath="/test.pdf" />);
    await waitFor(() => {
      expect(screen.getByTestId('pdf-doc')).toBeInTheDocument();
    });
    // Default page is 1
    await waitFor(() => {
      expect(screen.getByText(/1 \//)).toBeInTheDocument();
    });
  });

  it('shows zoom controls', async () => {
    render(<PDFViewer filePath="/test.pdf" />);
    await waitFor(() => {
      expect(screen.getByTestId('pdf-doc')).toBeInTheDocument();
    });
    expect(screen.getByText('－')).toBeInTheDocument();
    expect(screen.getByText('＋')).toBeInTheDocument();
    expect(screen.getByText('120%')).toBeInTheDocument();
  });

  it('prev button is disabled on first page', async () => {
    render(<PDFViewer filePath="/test.pdf" />);
    await waitFor(() => {
      expect(screen.getByTestId('pdf-doc')).toBeInTheDocument();
    });
    expect(screen.getByText('◀')).toBeDisabled();
  });

  it('renders Page component', async () => {
    render(<PDFViewer filePath="/test.pdf" />);
    await waitFor(() => {
      expect(screen.getByTestId('pdf-page')).toBeInTheDocument();
    });
  });

  it('fetches file URL', async () => {
    render(<PDFViewer filePath="/docs/test.pdf" />);
    expect(mockFetch).toHaveBeenCalledWith('file:///docs/test.pdf');
  });
});
