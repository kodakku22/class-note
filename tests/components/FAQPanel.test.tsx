import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FAQPanel } from '../../src/components/help/FAQPanel';

describe('FAQPanel', () => {
  const onClose = vi.fn();

  it('renders with title and search input', () => {
    render(<FAQPanel onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: 'FAQ' })).toBeInTheDocument();
    expect(screen.getByText('FAQ / トラブルシューティング')).toBeInTheDocument();
    expect(screen.getByLabelText('FAQ 検索')).toBeInTheDocument();
  });

  it('shows all category tabs', () => {
    render(<FAQPanel onClose={onClose} />);
    expect(screen.getByText('すべて')).toBeInTheDocument();
    expect(screen.getByText('セットアップ')).toBeInTheDocument();
    expect(screen.getByText('AI 機能')).toBeInTheDocument();
    expect(screen.getByText('Vault / データ')).toBeInTheDocument();
    expect(screen.getByText('パフォーマンス')).toBeInTheDocument();
    expect(screen.getByText('エディタ')).toBeInTheDocument();
    expect(screen.getByText('同期 / ファイル監視')).toBeInTheDocument();
  });

  it('filters entries by search query', () => {
    render(<FAQPanel onClose={onClose} />);
    const input = screen.getByLabelText('FAQ 検索');
    fireEvent.change(input, { target: { value: 'API キー' } });
    // Should show API key related entries
    expect(screen.getByText(/API キーの設定方法/)).toBeInTheDocument();
    // Should not show unrelated entries
    expect(screen.queryByText(/Windows にインストール/)).not.toBeInTheDocument();
  });

  it('filters entries by category', () => {
    render(<FAQPanel onClose={onClose} />);
    fireEvent.click(screen.getByText('エディタ'));
    // Should show editor entries
    expect(screen.getByText(/Markdown 記法/)).toBeInTheDocument();
    // Should not show setup entries
    expect(screen.queryByText(/Windows にインストール/)).not.toBeInTheDocument();
  });

  it('expands and collapses answers on click', () => {
    render(<FAQPanel onClose={onClose} />);
    const question = screen.getByText(/Windows にインストール/);
    // Answer should not be visible initially
    expect(screen.queryByText(/Setup.exe/)).not.toBeInTheDocument();
    // Click to expand
    fireEvent.click(question);
    expect(screen.getByText(/Setup.exe/)).toBeInTheDocument();
    // Click again to collapse
    fireEvent.click(question);
    expect(screen.queryByText(/Setup.exe/)).not.toBeInTheDocument();
  });

  it('calls onClose when close button is clicked', () => {
    render(<FAQPanel onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('閉じる'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when backdrop is clicked', () => {
    render(<FAQPanel onClose={onClose} />);
    // Click the backdrop (the outer element)
    const backdrop = screen.getByRole('dialog').parentElement!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows empty state when no results match', () => {
    render(<FAQPanel onClose={onClose} />);
    const input = screen.getByLabelText('FAQ 検索');
    fireEvent.change(input, { target: { value: 'xyznonexistent' } });
    expect(screen.getByText('該当する項目が見つかりません')).toBeInTheDocument();
  });
});
