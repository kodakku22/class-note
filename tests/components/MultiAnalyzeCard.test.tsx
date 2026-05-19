import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MultiAnalyzeCard } from '../../src/components/ai/MultiAnalyzeCard';

const SAMPLE = {
  comparison: [
    {
      aspect: '手法',
      documents: [
        {
          source: 'A.pdf',
          position: '勾配法',
          citation: { id: 1, source: 'A.pdf', section: 'Page 1', excerpt: 'sample', pageNumber: 1 },
        },
        {
          source: 'B.pdf',
          position: 'モーメンタム',
          citation: { id: 2, source: 'B.pdf', section: 'Page 4', excerpt: 'sample', pageNumber: 4 },
        },
      ],
    },
  ],
  commonPoints: ['学習率の重要性'],
  differences: ['初期化方針'],
  synthesis: '両論文は最適化を扱うが、観点が異なる。',
  suggestedStructure: '1. 導入\n2. 比較\n3. 結論',
};

describe('MultiAnalyzeCard', () => {
  it('renders all sections from the analysis result', () => {
    render(<MultiAnalyzeCard analysis={SAMPLE} />);
    expect(screen.getByText('複数文書分析')).toBeInTheDocument();
    expect(screen.getByText('観点別比較')).toBeInTheDocument();
    expect(screen.getByText('手法')).toBeInTheDocument();
    expect(screen.getByText('共通点')).toBeInTheDocument();
    expect(screen.getByText('学習率の重要性')).toBeInTheDocument();
    expect(screen.getByText('違い')).toBeInTheDocument();
    expect(screen.getByText('初期化方針')).toBeInTheDocument();
    expect(screen.getByText('統合的結論')).toBeInTheDocument();
    expect(screen.getByText(/両論文は最適化を扱う/)).toBeInTheDocument();
    expect(screen.getByText('発表/レポート構成案')).toBeInTheDocument();
    expect(screen.getByText(/1. 導入/)).toBeInTheDocument();
  });

  it('skips optional sections when empty', () => {
    render(
      <MultiAnalyzeCard
        analysis={{
          comparison: [],
          commonPoints: [],
          differences: [],
          synthesis: 'ただ一文だけ',
        }}
      />
    );
    expect(screen.queryByText('観点別比較')).not.toBeInTheDocument();
    expect(screen.queryByText('共通点')).not.toBeInTheDocument();
    expect(screen.queryByText('違い')).not.toBeInTheDocument();
    expect(screen.queryByText('発表/レポート構成案')).not.toBeInTheDocument();
    expect(screen.getByText('ただ一文だけ')).toBeInTheDocument();
  });

  it('invokes onJump with citation payload on badge click', () => {
    const onJump = vi.fn();
    render(<MultiAnalyzeCard analysis={SAMPLE} onJump={onJump} />);
    const badges = screen.getAllByRole('button');
    fireEvent.click(badges[0]);
    expect(onJump).toHaveBeenCalled();
    expect(onJump.mock.calls[0][0]).toMatchObject({ source: 'A.pdf', pageNumber: 1 });
  });
});
