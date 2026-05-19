import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
vi.mock('../../src/components/editor/BlockEditor', () => ({
  BlockEditor: ({ content, onChange, placeholder }: any) => (
    <textarea
      data-testid="block-editor"
      value={content}
      onChange={(e: any) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  ),
}));

import { ExperimentEditor } from '../../src/components/experiment/ExperimentEditor';

const SAMPLE_CONTENT = `---
title: BLEU Experiment
type: experiment
dataset: WMT-14
model: Transformer
seed: 42
git_sha: abc123
hardware: 8x A100
status: running
startedAt: '2026-01-01'
finishedAt: ''
hyperparams:
  learning_rate: 0.001
  batch_size: 32
---
Some experiment notes here.`;

describe('ExperimentEditor', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (window as any).api.vault = {
      readNoteWithMtime: vi.fn().mockResolvedValue({ content: SAMPLE_CONTENT, mtime: 1000 }),
      writeNote: vi.fn().mockResolvedValue({ ok: true, currentMtime: 2000 }),
    };
    (window as any).api.experiments = {
      generateReproPackage: vi.fn().mockResolvedValue({ ok: true, files: ['a.json'], outputDir: '/out' }),
    };
  });

  it('shows loading state before content loads', () => {
    (window as any).api.vault.readNoteWithMtime = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />);
    expect(screen.getByText('読み込み中…')).toBeInTheDocument();
  });

  it('loads and renders experiment title', async () => {
    await act(async () => {
      render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />);
    });

    await waitFor(() => {
      const titleInput = screen.getByPlaceholderText('実験タイトル') as HTMLInputElement;
      expect(titleInput.value).toBe('BLEU Experiment');
    });
  });

  it('renders dataset field', async () => {
    await act(async () => {
      render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />);
    });

    await waitFor(() => {
      const dsInput = screen.getByPlaceholderText(/WMT-14/) as HTMLInputElement;
      expect(dsInput.value).toBe('WMT-14');
    });
  });

  it('renders model field', async () => {
    await act(async () => {
      render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />);
    });

    await waitFor(() => {
      const input = screen.getByPlaceholderText(/Transformer/) as HTMLInputElement;
      expect(input.value).toBe('Transformer');
    });
  });

  it('renders seed field', async () => {
    await act(async () => {
      render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />);
    });

    await waitFor(() => {
      const input = screen.getByPlaceholderText('42') as HTMLInputElement;
      expect(input.value).toBe('42');
    });
  });

  it('renders status selector with current status', async () => {
    await act(async () => {
      render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />);
    });

    await waitFor(() => {
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      expect(select.value).toBe('running');
    });
  });

  it('renders hyperparameters heading', async () => {
    await act(async () => {
      render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />);
    });

    await waitFor(() => {
      expect(screen.getByText('Hyperparameters')).toBeInTheDocument();
    });
  });

  it('renders block editor with body content', async () => {
    await act(async () => {
      render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />);
    });

    await waitFor(() => {
      const editor = screen.getByTestId('block-editor') as HTMLTextAreaElement;
      expect(editor.value).toContain('Some experiment notes here.');
    });
  });

  it('renders repro package button', async () => {
    await act(async () => {
      render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />);
    });

    await waitFor(() => {
      expect(screen.getByText(/再現性パッケージを生成/)).toBeInTheDocument();
    });
  });

  it('auto-saves on title change', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    await act(async () => {
      render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />);
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('実験タイトル')).toBeInTheDocument();
    });

    const titleInput = screen.getByPlaceholderText('実験タイトル');
    await act(async () => {
      fireEvent.change(titleInput, { target: { value: 'Updated Title' } });
    });

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    expect((window as any).api.vault.writeNote).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('has status options: planning, running, success, failed', async () => {
    await act(async () => {
      render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />);
    });

    await waitFor(() => {
      const options = screen.getAllByRole('option');
      const values = options.map((o) => (o as HTMLOptionElement).value);
      expect(values).toContain('planning');
      expect(values).toContain('running');
      expect(values).toContain('success');
      expect(values).toContain('failed');
    });
  });

  it('shows add hyperparameter button', async () => {
    await act(async () => {
      render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />);
    });

    await waitFor(() => {
      expect(screen.getByText('+ 追加')).toBeInTheDocument();
    });
  });

  it('shows empty hyperparams message when none exist', async () => {
    const contentNoHP = `---
title: Test
type: experiment
---
body`;
    (window as any).api.vault.readNoteWithMtime = vi.fn().mockResolvedValue({ content: contentNoHP, mtime: 1000 });

    await act(async () => {
      render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />);
    });

    await waitFor(() => {
      expect(screen.getByText(/「\+ 追加」で hyperparameter を登録/)).toBeInTheDocument();
    });
  });

  it('renders notes section heading', async () => {
    await act(async () => {
      render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />);
    });

    await waitFor(() => {
      expect(screen.getByText(/ノート/)).toBeInTheDocument();
    });
  });
});
