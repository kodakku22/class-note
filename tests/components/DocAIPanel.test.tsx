import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { DocAIPanel } from '../../src/components/ai/DocAIPanel';
import type { DocAICitation, DocAISummaryResult } from '../../src/types';

// We track the subscribers registered through onChunk / onCitations / onDone /
// onError so individual tests can drive them directly.
let chunkCb: ((p: { text: string }) => void) | null = null;
let citationsCb: ((p: { citations: DocAICitation[] }) => void) | null = null;
let doneCb: ((p: { text: string; citations: DocAICitation[]; suggestedFollowUps?: string[] }) => void) | null = null;
let errorCb: ((p: { error: string }) => void) | null = null;

const summarizeMock = vi.fn();
const askMock = vi.fn();
const askMultiMock = vi.fn();
const multiAnalyzeMock = vi.fn();
const generateMock = vi.fn();
const listVaultFilesMock = vi.fn();

beforeEach(() => {
  chunkCb = null;
  citationsCb = null;
  doneCb = null;
  errorCb = null;
  summarizeMock.mockReset();
  askMock.mockReset();
  askMultiMock.mockReset();
  multiAnalyzeMock.mockReset();
  generateMock.mockReset();
  listVaultFilesMock.mockReset();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = {
    docai: {
      summarize: summarizeMock,
      ask: askMock,
      askMulti: askMultiMock,
      multiAnalyze: multiAnalyzeMock,
      generate: generateMock,
      listVaultFiles: listVaultFilesMock,
      onChunk: (cb: (p: { text: string }) => void) => {
        chunkCb = cb;
        return () => { chunkCb = null; };
      },
      onCitations: (cb: (p: { citations: DocAICitation[] }) => void) => {
        citationsCb = cb;
        return () => { citationsCb = null; };
      },
      onDone: (
        cb: (p: { text: string; citations: DocAICitation[]; suggestedFollowUps?: string[] }) => void
      ) => {
        doneCb = cb;
        return () => { doneCb = null; };
      },
      onError: (cb: (p: { error: string }) => void) => {
        errorCb = cb;
        return () => { errorCb = null; };
      },
    },
  };
});

describe('DocAIPanel', () => {
  it('renders the header with the file name', () => {
    render(<DocAIPanel filePath="/abs/paper.pdf" onClose={() => {}} />);
    expect(screen.getByText('🤖 AIアシスタント')).toBeInTheDocument();
    expect(screen.getByText('paper.pdf')).toBeInTheDocument();
  });

  it('invokes onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<DocAIPanel filePath="/abs/paper.pdf" onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('AI パネルを閉じる'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows quick action buttons', () => {
    render(<DocAIPanel filePath="/abs/paper.pdf" onClose={() => {}} />);
    expect(screen.getByText('⚡ 要約')).toBeInTheDocument();
    expect(screen.getByText('📝 試験対策')).toBeInTheDocument();
    expect(screen.getByText('📌 1行要約')).toBeInTheDocument();
  });

  it('calls docai.summarize when ⚡要約 is clicked and renders the result', async () => {
    const summary: DocAISummaryResult = {
      headline: 'one-liner',
      keyPoints: [
        {
          point: 'key point body',
          citation: { id: 1, source: 'paper.pdf', section: 'Page 1', excerpt: '', pageNumber: 1 },
          importance: 'critical',
        },
      ],
      structure: '',
      actionItems: ['act one'],
      suggestedQuestions: [],
    };
    summarizeMock.mockResolvedValueOnce({ ok: true, result: summary });

    render(<DocAIPanel filePath="/abs/paper.pdf" onClose={() => {}} />);
    fireEvent.click(screen.getByText('⚡ 要約'));

    await waitFor(() => {
      expect(summarizeMock).toHaveBeenCalledWith('/abs/paper.pdf', { mode: 'keypoints' });
    });
    expect(await screen.findByText('one-liner')).toBeInTheDocument();
    expect(screen.getByText('key point body')).toBeInTheDocument();
    expect(screen.getByText('act one')).toBeInTheDocument();
  });

  it('surfaces summarize errors', async () => {
    summarizeMock.mockResolvedValueOnce({ ok: false, error: 'AI 機能が無効です' });
    render(<DocAIPanel filePath="/abs/paper.pdf" onClose={() => {}} />);
    fireEvent.click(screen.getByText('⚡ 要約'));
    expect(await screen.findByRole('alert')).toHaveTextContent('AI 機能が無効です');
  });

  it('submits a question and streams chunks into the panel', async () => {
    askMock.mockResolvedValueOnce({ ok: true });
    render(<DocAIPanel filePath="/abs/paper.pdf" onClose={() => {}} />);

    const input = screen.getByPlaceholderText('この文書について質問...');
    fireEvent.change(input, { target: { value: 'なぜ?' } });
    fireEvent.click(screen.getByText('送信'));

    await waitFor(() => expect(askMock).toHaveBeenCalledWith('/abs/paper.pdf', 'なぜ?'));

    // Simulate streaming chunks
    act(() => {
      citationsCb?.({
        citations: [{ id: 1, source: 'paper.pdf', section: 'Page 1', excerpt: 'src', pageNumber: 1 }],
      });
      chunkCb?.({ text: 'Because [出典 1] this.' });
      doneCb?.({
        text: 'Because [出典 1] this.',
        citations: [{ id: 1, source: 'paper.pdf', section: 'Page 1', excerpt: 'src', pageNumber: 1 }],
        suggestedFollowUps: ['次の質問1', '次の質問2'],
      });
    });

    expect(await screen.findByText(/Because/)).toBeInTheDocument();
    // Citation badge rendered
    expect(screen.getByText('[1]')).toBeInTheDocument();
    // Follow-up suggestions rendered
    expect(screen.getByText('次の質問1')).toBeInTheDocument();
  });

  it('shows an error when the streaming pipeline reports an error', async () => {
    askMock.mockResolvedValueOnce({ ok: true });
    render(<DocAIPanel filePath="/abs/paper.pdf" onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('この文書について質問...'), {
      target: { value: 'q?' },
    });
    fireEvent.click(screen.getByText('送信'));

    act(() => {
      errorCb?.({ error: 'タイムアウト' });
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('タイムアウト');
  });

  it('renders the 📎+ button only when vaultPath is provided', () => {
    const { rerender } = render(<DocAIPanel filePath="/abs/a.pdf" onClose={() => {}} />);
    expect(screen.queryByLabelText('複数文書を選択')).not.toBeInTheDocument();
    rerender(<DocAIPanel filePath="/abs/a.pdf" vaultPath="/v" onClose={() => {}} />);
    expect(screen.getByLabelText('複数文書を選択')).toBeInTheDocument();
  });

  it('opens the MultiDocPicker when 📎+ is clicked', async () => {
    listVaultFilesMock.mockResolvedValueOnce({ ok: true, files: [] });
    render(<DocAIPanel filePath="/v/a.md" vaultPath="/v" onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText('複数文書を選択'));
    expect(await screen.findByText('📎 複数文書を選択')).toBeInTheDocument();
  });

  it('opens the ContentGenerator when ✉ 生成 is clicked', async () => {
    render(<DocAIPanel filePath="/v/a.md" onClose={() => {}} />);
    fireEvent.click(screen.getByText('✉ 生成'));
    expect(await screen.findByText('✉️ コンテンツ生成')).toBeInTheDocument();
  });

  it('disables 📊 比較 unless extra docs are attached', () => {
    render(<DocAIPanel filePath="/v/a.md" onClose={() => {}} />);
    expect(screen.getByText('📊 比較')).toBeDisabled();
  });

  it('clears state when the filePath prop changes', async () => {
    const { rerender } = render(<DocAIPanel filePath="/abs/a.pdf" onClose={() => {}} />);
    summarizeMock.mockResolvedValueOnce({
      ok: true,
      result: {
        headline: 'A summary',
        keyPoints: [],
        structure: '',
        actionItems: [],
        suggestedQuestions: [],
      } as DocAISummaryResult,
    });
    fireEvent.click(screen.getByText('⚡ 要約'));
    expect(await screen.findByText('A summary')).toBeInTheDocument();

    rerender(<DocAIPanel filePath="/abs/b.pdf" onClose={() => {}} />);
    expect(screen.queryByText('A summary')).not.toBeInTheDocument();
    expect(screen.getByText('b.pdf')).toBeInTheDocument();
  });
});
