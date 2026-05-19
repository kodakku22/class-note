import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

vi.mock('../../src/components/common/Dialog', () => ({
  useDialog: () => {
    const dlg = {
      prompt: vi.fn().mockResolvedValue(null),
      confirm: vi.fn().mockResolvedValue(false),
      alert: vi.fn().mockResolvedValue(undefined),
    };
    return [dlg, null];
  },
}));

import { LearningAgentPanel } from '../../src/components/LearningAgentPanel';
import type { LearningCoachResult } from '../../src/types';

const SAMPLE_RESULT: LearningCoachResult = {
  diagnosis: 'Good understanding of basics',
  keyConcepts: [
    { term: 'Integration', explanation: 'Finding area under curve', confidence: 'high' },
    { term: 'Derivative', explanation: 'Rate of change' },
  ],
  misconceptions: ['Integral is not the opposite of derivative in all cases'],
  quiz: [
    { question: 'What is the fundamental theorem?', answer: 'Connects differentiation and integration' },
  ],
  nextActions: ['Practice more integration problems'],
  suggestedNotes: [
    { title: 'Integration Techniques', reason: 'Deepen understanding' },
  ],
};

describe('LearningAgentPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (window as any).api.ai = {
      learningCoach: vi.fn().mockResolvedValue({ ok: true, result: SAMPLE_RESULT }),
      learningCoachAndSave: vi.fn().mockResolvedValue({ ok: true, result: SAMPLE_RESULT }),
    };
  });

  it('renders trigger button', () => {
    render(<LearningAgentPanel filePath="/vault/note.md" />);
    expect(screen.getByText('AI理解')).toBeInTheDocument();
  });

  it('renders custom label', () => {
    render(<LearningAgentPanel filePath="/vault/note.md" label="読書AI" />);
    expect(screen.getByText('読書AI')).toBeInTheDocument();
  });

  it('shows result modal after clicking trigger', async () => {
    await act(async () => {
      render(<LearningAgentPanel filePath="/vault/note.md" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('AI理解'));
    });

    await waitFor(() => {
      expect(screen.getByText('診断')).toBeInTheDocument();
      expect(screen.getByText('Good understanding of basics')).toBeInTheDocument();
    });
  });

  it('displays key concepts', async () => {
    await act(async () => {
      render(<LearningAgentPanel filePath="/vault/note.md" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('AI理解'));
    });

    await waitFor(() => {
      expect(screen.getByText('重要概念')).toBeInTheDocument();
      expect(screen.getByText('Integration')).toBeInTheDocument();
      expect(screen.getByText('Derivative')).toBeInTheDocument();
    });
  });

  it('displays confidence when present', async () => {
    await act(async () => {
      render(<LearningAgentPanel filePath="/vault/note.md" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('AI理解'));
    });

    await waitFor(() => {
      expect(screen.getByText('high')).toBeInTheDocument();
    });
  });

  it('displays misconceptions', async () => {
    await act(async () => {
      render(<LearningAgentPanel filePath="/vault/note.md" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('AI理解'));
    });

    await waitFor(() => {
      expect(screen.getByText('誤解しやすい点')).toBeInTheDocument();
    });
  });

  it('displays quiz', async () => {
    await act(async () => {
      render(<LearningAgentPanel filePath="/vault/note.md" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('AI理解'));
    });

    await waitFor(() => {
      expect(screen.getByText('理解確認クイズ')).toBeInTheDocument();
      expect(screen.getByText('What is the fundamental theorem?')).toBeInTheDocument();
    });
  });

  it('displays next actions', async () => {
    await act(async () => {
      render(<LearningAgentPanel filePath="/vault/note.md" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('AI理解'));
    });

    await waitFor(() => {
      expect(screen.getByText('次にやること')).toBeInTheDocument();
      expect(screen.getByText('Practice more integration problems')).toBeInTheDocument();
    });
  });

  it('displays suggested notes', async () => {
    await act(async () => {
      render(<LearningAgentPanel filePath="/vault/note.md" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('AI理解'));
    });

    await waitFor(() => {
      expect(screen.getByText('作るとよい関連ノート')).toBeInTheDocument();
      expect(screen.getByText('Integration Techniques')).toBeInTheDocument();
    });
  });

  it('closes modal on close button', async () => {
    await act(async () => {
      render(<LearningAgentPanel filePath="/vault/note.md" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('AI理解'));
    });

    await waitFor(() => {
      expect(screen.getByText('診断')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('閉じる'));
    });

    expect(screen.queryByText('診断')).not.toBeInTheDocument();
  });

  it('shows kind-specific title for book', async () => {
    await act(async () => {
      render(<LearningAgentPanel filePath="/vault/note.md" kind="book" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('AI理解'));
    });

    await waitFor(() => {
      expect(screen.getByText('本向けAI理解支援')).toBeInTheDocument();
    });
  });

  it('calls learningCoach without save', async () => {
    await act(async () => {
      render(<LearningAgentPanel filePath="/vault/note.md" kind="lecture" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('AI理解'));
    });

    await waitFor(() => {
      expect((window as any).api.ai.learningCoach).toHaveBeenCalledWith('/vault/note.md', 'lecture');
    });
  });

  it('saves to note when clicking save button', async () => {
    const onSaved = vi.fn();
    await act(async () => {
      render(<LearningAgentPanel filePath="/vault/note.md" onSaved={onSaved} />);
    });

    // First, run analysis
    await act(async () => {
      fireEvent.click(screen.getByText('AI理解'));
    });

    await waitFor(() => {
      expect(screen.getByText('ノートへ保存')).toBeInTheDocument();
    });

    // Click save
    await act(async () => {
      fireEvent.click(screen.getByText('ノートへ保存'));
    });

    await waitFor(() => {
      expect((window as any).api.ai.learningCoachAndSave).toHaveBeenCalled();
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it('shows busy state during analysis', async () => {
    // Make the API call take a long time
    (window as any).api.ai.learningCoach = vi.fn().mockReturnValue(new Promise(() => {}));

    await act(async () => {
      render(<LearningAgentPanel filePath="/vault/note.md" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('AI理解'));
    });

    expect(screen.getByText('分析中…')).toBeInTheDocument();
  });
});
