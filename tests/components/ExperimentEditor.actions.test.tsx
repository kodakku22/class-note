import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Controllable Dialog mock
const mockAlert = vi.fn().mockResolvedValue(undefined);
vi.mock('../../src/components/common/Dialog', () => ({
  useDialog: () => [
    { alert: mockAlert, confirm: vi.fn().mockResolvedValue(true), prompt: vi.fn().mockResolvedValue(null) },
    null,
  ],
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

describe('ExperimentEditor actions', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockAlert.mockResolvedValue(undefined);
    (window as any).api = {
      vault: {
        readNoteWithMtime: vi.fn().mockResolvedValue({ content: SAMPLE_CONTENT, mtime: 1000 }),
        writeNote: vi.fn().mockResolvedValue({ ok: true, currentMtime: 2000 }),
      },
      experiments: {
        generateReproPackage: vi.fn().mockResolvedValue({
          ok: true, files: ['experiment.json', 'Makefile'], outputDir: '/vault/_outputs',
        }),
      },
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('generates repro package on button click', async () => {
    await act(async () => { render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />); });
    await waitFor(() => { expect(screen.getByText(/再現性パッケージを生成/)).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText(/再現性パッケージを生成/)); });
    expect((window as any).api.experiments.generateReproPackage).toHaveBeenCalledWith('/vault', '/vault/exp.md');
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({
      title: '再現性パッケージを生成しました',
    }));
  });

  it('shows error when repro package generation fails', async () => {
    (window as any).api.experiments.generateReproPackage = vi.fn().mockResolvedValue({
      ok: false, error: 'gen err',
    });
    await act(async () => { render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />); });
    await waitFor(() => { expect(screen.getByText(/再現性パッケージを生成/)).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText(/再現性パッケージを生成/)); });
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({
      title: '生成に失敗しました',
    }));
  });

  it('shows default error message when repro error is undefined', async () => {
    (window as any).api.experiments.generateReproPackage = vi.fn().mockResolvedValue({ ok: false });
    await act(async () => { render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />); });
    await waitFor(() => { expect(screen.getByText(/再現性パッケージを生成/)).toBeInTheDocument(); });
    await act(async () => { fireEvent.click(screen.getByText(/再現性パッケージを生成/)); });
    expect(mockAlert).toHaveBeenCalledWith(expect.objectContaining({
      message: '不明なエラー',
    }));
  });

  it('auto-saves on status change', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => { render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />); });
    await waitFor(() => { expect(screen.getByRole('combobox')).toBeInTheDocument(); });
    const select = screen.getByRole('combobox');
    await act(async () => { fireEvent.change(select, { target: { value: 'success' } }); });
    await act(async () => { vi.advanceTimersByTime(700); });
    expect((window as any).api.vault.writeNote).toHaveBeenCalled();
  });

  it('auto-saves on dataset change', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => { render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />); });
    await waitFor(() => { expect(screen.getByPlaceholderText(/WMT-14/)).toBeInTheDocument(); });
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/WMT-14/), { target: { value: 'CIFAR-10' } });
    });
    await act(async () => { vi.advanceTimersByTime(700); });
    expect((window as any).api.vault.writeNote).toHaveBeenCalled();
  });

  it('auto-saves on model change', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => { render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />); });
    await waitFor(() => { expect(screen.getByPlaceholderText(/Transformer/)).toBeInTheDocument(); });
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/Transformer/), { target: { value: 'BERT' } });
    });
    await act(async () => { vi.advanceTimersByTime(700); });
    expect((window as any).api.vault.writeNote).toHaveBeenCalled();
  });

  it('auto-saves on seed change', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => { render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />); });
    await waitFor(() => { expect(screen.getByPlaceholderText('42')).toBeInTheDocument(); });
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('42'), { target: { value: '123' } });
    });
    await act(async () => { vi.advanceTimersByTime(700); });
    expect((window as any).api.vault.writeNote).toHaveBeenCalled();
  });

  it('clears seed when value is empty', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => { render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />); });
    await waitFor(() => { expect(screen.getByPlaceholderText('42')).toBeInTheDocument(); });
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('42'), { target: { value: '' } });
    });
    await act(async () => { vi.advanceTimersByTime(700); });
    const call = (window as any).api.vault.writeNote.mock.calls[0];
    expect(call).toBeTruthy();
  });

  it('auto-saves on git_sha change', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => { render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />); });
    await waitFor(() => { expect(screen.getByPlaceholderText(/a1b2c3d/)).toBeInTheDocument(); });
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/a1b2c3d/), { target: { value: 'def456' } });
    });
    await act(async () => { vi.advanceTimersByTime(700); });
    expect((window as any).api.vault.writeNote).toHaveBeenCalled();
  });

  it('auto-saves on hardware change', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => { render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />); });
    await waitFor(() => { expect(screen.getByPlaceholderText(/8x A100/)).toBeInTheDocument(); });
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText(/8x A100/), { target: { value: '4x V100' } });
    });
    await act(async () => { vi.advanceTimersByTime(700); });
    expect((window as any).api.vault.writeNote).toHaveBeenCalled();
  });

  it('auto-saves on body change', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => { render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />); });
    await waitFor(() => { expect(screen.getByTestId('block-editor')).toBeInTheDocument(); });
    await act(async () => {
      fireEvent.change(screen.getByTestId('block-editor'), { target: { value: 'New notes' } });
    });
    await act(async () => { vi.advanceTimersByTime(700); });
    expect((window as any).api.vault.writeNote).toHaveBeenCalled();
  });

  it('adds a hyperparameter row', async () => {
    await act(async () => { render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />); });
    await waitFor(() => { expect(screen.getByText('+ 追加')).toBeInTheDocument(); });
    const rows = document.querySelectorAll('.experiment-hp-row');
    const initialCount = rows.length;
    await act(async () => { fireEvent.click(screen.getByText('+ 追加')); });
    const newRows = document.querySelectorAll('.experiment-hp-row');
    expect(newRows.length).toBe(initialCount + 1);
  });

  it('removes a hyperparameter row', async () => {
    await act(async () => { render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />); });
    await waitFor(() => { expect(screen.getByText('Hyperparameters')).toBeInTheDocument(); });
    const removeBtns = screen.getAllByLabelText('削除');
    const initialCount = removeBtns.length;
    await act(async () => { fireEvent.click(removeBtns[0]); });
    const remaining = screen.queryAllByLabelText('削除');
    expect(remaining.length).toBe(initialCount - 1);
  });

  it('edits hyperparameter key', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => { render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />); });
    await waitFor(() => { expect(screen.getByText('Hyperparameters')).toBeInTheDocument(); });
    const rows = document.querySelectorAll('.experiment-hp-row');
    const keyInput = rows[0].querySelectorAll('input')[0];
    await act(async () => {
      fireEvent.change(keyInput, { target: { value: 'lr' } });
    });
    await act(async () => { vi.advanceTimersByTime(700); });
    expect((window as any).api.vault.writeNote).toHaveBeenCalled();
  });

  it('edits hyperparameter value (numeric)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => { render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />); });
    await waitFor(() => { expect(screen.getByText('Hyperparameters')).toBeInTheDocument(); });
    const rows = document.querySelectorAll('.experiment-hp-row');
    const valInput = rows[0].querySelectorAll('input')[1];
    await act(async () => {
      fireEvent.change(valInput, { target: { value: '0.01' } });
    });
    await act(async () => { vi.advanceTimersByTime(700); });
    expect((window as any).api.vault.writeNote).toHaveBeenCalled();
  });

  it('edits hyperparameter value (string)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => { render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />); });
    await waitFor(() => { expect(screen.getByText('Hyperparameters')).toBeInTheDocument(); });
    const rows = document.querySelectorAll('.experiment-hp-row');
    const valInput = rows[0].querySelectorAll('input')[1];
    await act(async () => {
      fireEvent.change(valInput, { target: { value: 'adam' } });
    });
    await act(async () => { vi.advanceTimersByTime(700); });
    expect((window as any).api.vault.writeNote).toHaveBeenCalled();
  });

  it('auto-saves on startedAt change', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => { render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />); });
    await waitFor(() => { expect(screen.getByText('Started at')).toBeInTheDocument(); });
    const dateInputs = document.querySelectorAll('input[type="date"]');
    await act(async () => {
      fireEvent.change(dateInputs[0], { target: { value: '2026-02-01' } });
    });
    await act(async () => { vi.advanceTimersByTime(700); });
    expect((window as any).api.vault.writeNote).toHaveBeenCalled();
  });

  it('auto-saves on finishedAt change', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => { render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />); });
    await waitFor(() => { expect(screen.getByText('Finished at')).toBeInTheDocument(); });
    const dateInputs = document.querySelectorAll('input[type="date"]');
    await act(async () => {
      fireEvent.change(dateInputs[1], { target: { value: '2026-03-01' } });
    });
    await act(async () => { vi.advanceTimersByTime(700); });
    expect((window as any).api.vault.writeNote).toHaveBeenCalled();
  });

  it('clears startedAt when value is empty', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => { render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />); });
    await waitFor(() => { expect(screen.getByText('Started at')).toBeInTheDocument(); });
    const dateInputs = document.querySelectorAll('input[type="date"]');
    await act(async () => {
      fireEvent.change(dateInputs[0], { target: { value: '' } });
    });
    await act(async () => { vi.advanceTimersByTime(700); });
    expect((window as any).api.vault.writeNote).toHaveBeenCalled();
  });

  it('shows saved timestamp after save', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => { render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />); });
    await waitFor(() => { expect(screen.getByPlaceholderText('実験タイトル')).toBeInTheDocument(); });
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('実験タイトル'), { target: { value: 'X' } });
    });
    await act(async () => { vi.advanceTimersByTime(700); });
    // After the save completes, the component should show a status
    // It may show "保存中…" briefly then "✓ time". Check for the status element.
    await act(async () => { vi.advanceTimersByTime(100); });
    const statusEl = document.querySelector('.experiment-status');
    expect(statusEl).toBeTruthy();
  });

  it('debounces multiple rapid changes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await act(async () => { render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />); });
    await waitFor(() => { expect(screen.getByPlaceholderText('実験タイトル')).toBeInTheDocument(); });
    const title = screen.getByPlaceholderText('実験タイトル');
    await act(async () => {
      fireEvent.change(title, { target: { value: 'A' } });
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await act(async () => {
      fireEvent.change(title, { target: { value: 'AB' } });
    });
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await act(async () => {
      fireEvent.change(title, { target: { value: 'ABC' } });
    });
    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    // Only 1 save due to debouncing
    expect((window as any).api.vault.writeNote).toHaveBeenCalledTimes(1);
  });

  it('renders repro package help text', async () => {
    await act(async () => { render(<ExperimentEditor filePath="/vault/exp.md" vaultPath="/vault" />); });
    await waitFor(() => {
      expect(screen.getByText(/experiment\.json \+ requirements\.txt \+ Makefile/)).toBeInTheDocument();
    });
  });
});
