import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ContentGenerator } from '../../src/components/ai/ContentGenerator';

const generateMock = vi.fn();

beforeEach(() => {
  generateMock.mockReset();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = {
    docai: { generate: generateMock },
  };
});

describe('ContentGenerator', () => {
  it('renders all format options + instruction box', () => {
    render(<ContentGenerator filePath="/v/a.md" onClose={() => {}} />);
    expect(screen.getByText('✉️ コンテンツ生成')).toBeInTheDocument();
    expect(screen.getByText('メール文面')).toBeInTheDocument();
    expect(screen.getByText('発表原稿')).toBeInTheDocument();
    expect(screen.getByText('レポート構成案')).toBeInTheDocument();
    expect(screen.getByText('議事録 / メモ')).toBeInTheDocument();
    expect(screen.getByText('自由入力')).toBeInTheDocument();
  });

  it('switches the active format on click', () => {
    render(<ContentGenerator filePath="/v/a.md" onClose={() => {}} />);
    const reportBtn = screen.getByRole('radio', { name: /レポート構成案/ });
    fireEvent.click(reportBtn);
    expect(reportBtn).toHaveAttribute('aria-checked', 'true');
  });

  it('disables 生成 until an instruction is entered', () => {
    render(<ContentGenerator filePath="/v/a.md" onClose={() => {}} />);
    expect(screen.getByText('生成')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('生成指示'), { target: { value: 'メールを書いて' } });
    expect(screen.getByText('生成')).not.toBeDisabled();
  });

  it('calls docai.generate with the correct args and renders the result', async () => {
    generateMock.mockResolvedValueOnce({
      ok: true,
      result: {
        content: 'こんにちは。進捗報告します。',
        format: 'email',
        citations: [],
        wordCount: 5,
      },
    });
    render(<ContentGenerator filePath="/v/a.md" onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('生成指示'), { target: { value: 'メール書いて' } });
    fireEvent.click(screen.getByText('生成'));
    await waitFor(() => expect(generateMock).toHaveBeenCalledWith('/v/a.md', 'email', 'メール書いて'));
    expect(await screen.findByText(/こんにちは/)).toBeInTheDocument();
    expect(screen.getByText('📋 コピー')).toBeInTheDocument();
  });

  it('surfaces errors from docai.generate', async () => {
    generateMock.mockResolvedValueOnce({ ok: false, error: 'AI 失敗' });
    render(<ContentGenerator filePath="/v/a.md" onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('生成指示'), { target: { value: 'x' } });
    fireEvent.click(screen.getByText('生成'));
    expect(await screen.findByRole('alert')).toHaveTextContent('AI 失敗');
  });

  it('closes when 閉じる is clicked', () => {
    const onClose = vi.fn();
    render(<ContentGenerator filePath="/v/a.md" onClose={onClose} />);
    fireEvent.click(screen.getByText('閉じる'));
    expect(onClose).toHaveBeenCalled();
  });
});
