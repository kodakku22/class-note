import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// --------------------------------------------------------------------------
// Coverage targets for PDFViewer.tsx:
//   - Page navigation: next/prev page clicks
//   - Zoom: increase/decrease scale
//   - numPages display update after onLoadSuccess
//   - fetch error handling (catch branch)
//   - Page boundary clamping (can't go below 1 or above numPages)
// --------------------------------------------------------------------------

let onLoadSuccessCallback: ((args: { numPages: number }) => void) | null = null;

vi.mock('react-pdf', () => ({
  Document: ({ children, onLoadSuccess }: any) => {
    onLoadSuccessCallback = onLoadSuccess;
    // Auto-fire onLoadSuccess to simulate PDF loading
    Promise.resolve().then(() => onLoadSuccess?.({ numPages: 5 }));
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

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('../../src/utils/paths', () => ({
  toAppFileUrl: (p: string) => `file://${p}`,
}));

import { PDFViewer } from '../../src/components/PDFViewer';

describe('PDFViewer – additional branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onLoadSuccessCallback = null;
    mockFetch.mockResolvedValue({
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
    });
  });

  it('navigates to next page on forward button click', async () => {
    render(<PDFViewer filePath="/test.pdf" />);
    await waitFor(() => {
      expect(screen.getByTestId('pdf-doc')).toBeInTheDocument();
    });
    // Wait for numPages to be set
    await waitFor(() => {
      expect(screen.getByText(/1 \/ 5/)).toBeInTheDocument();
    });

    // Click next page
    fireEvent.click(screen.getByText('▶'));
    await waitFor(() => {
      const page = screen.getByTestId('pdf-page');
      expect(page.getAttribute('data-page')).toBe('2');
    });
  });

  it('navigates to previous page', async () => {
    render(<PDFViewer filePath="/test.pdf" />);
    await waitFor(() => {
      expect(screen.getByText(/1 \/ 5/)).toBeInTheDocument();
    });

    // Go forward then back
    fireEvent.click(screen.getByText('▶'));
    await waitFor(() => {
      const page = screen.getByTestId('pdf-page');
      expect(page.getAttribute('data-page')).toBe('2');
    });

    fireEvent.click(screen.getByText('◀'));
    await waitFor(() => {
      const page = screen.getByTestId('pdf-page');
      expect(page.getAttribute('data-page')).toBe('1');
    });
  });

  it('zooms in when + button is clicked', async () => {
    render(<PDFViewer filePath="/test.pdf" />);
    await waitFor(() => {
      expect(screen.getByTestId('pdf-doc')).toBeInTheDocument();
    });

    // Initial scale is 120%
    expect(screen.getByText('120%')).toBeInTheDocument();

    // Zoom in
    fireEvent.click(screen.getByText('＋'));
    await waitFor(() => {
      expect(screen.getByText('140%')).toBeInTheDocument();
    });
  });

  it('zooms out when - button is clicked', async () => {
    render(<PDFViewer filePath="/test.pdf" />);
    await waitFor(() => {
      expect(screen.getByTestId('pdf-doc')).toBeInTheDocument();
    });

    // Zoom out
    fireEvent.click(screen.getByText('－'));
    await waitFor(() => {
      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });

  it('handles fetch error gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));
    render(<PDFViewer filePath="/bad.pdf" />);

    // Should show loading state (data is never set due to error)
    await waitFor(() => {
      expect(screen.getByText('PDFを読み込み中...')).toBeInTheDocument();
    });
  });

  it('next button is disabled on last page', async () => {
    render(<PDFViewer filePath="/test.pdf" />);
    await waitFor(() => {
      expect(screen.getByText(/1 \/ 5/)).toBeInTheDocument();
    });

    // Navigate to page 5 (last page)
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByText('▶'));
    }

    await waitFor(() => {
      const page = screen.getByTestId('pdf-page');
      expect(page.getAttribute('data-page')).toBe('5');
    });

    expect(screen.getByText('▶')).toBeDisabled();
  });
});
