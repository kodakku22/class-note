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

import { WikiCompilePanel } from '../../src/components/WikiCompilePanel';

describe('WikiCompilePanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (window as any).api.vault = {
      listSubjects: vi.fn().mockResolvedValue(['Math', 'Physics']),
    };
    (window as any).api.wiki = {
      getSchema: vi.fn().mockResolvedValue('# Schema\nTopic pages...'),
      compile: vi.fn().mockResolvedValue({ ok: true, pageCount: 5 }),
      setSchema: vi.fn().mockResolvedValue({ ok: true }),
      onCompileProgress: vi.fn().mockReturnValue(() => {}),
    };
  });

  it('renders heading', async () => {
    await act(async () => {
      render(<WikiCompilePanel vaultPath="/vault" />);
    });
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Wiki をコンパイル');
  });

  it('renders scope selector with subjects', async () => {
    await act(async () => {
      render(<WikiCompilePanel vaultPath="/vault" />);
    });

    await waitFor(() => {
      expect(screen.getByText('Math のみ')).toBeInTheDocument();
      expect(screen.getByText('Physics のみ')).toBeInTheDocument();
    });
  });

  it('renders "all" scope option', async () => {
    await act(async () => {
      render(<WikiCompilePanel vaultPath="/vault" />);
    });

    expect(screen.getByText(/すべて/)).toBeInTheDocument();
  });

  it('shows schema edit button', async () => {
    await act(async () => {
      render(<WikiCompilePanel vaultPath="/vault" />);
    });

    expect(screen.getByText('編集')).toBeInTheDocument();
  });

  it('toggles schema editor on button click', async () => {
    await act(async () => {
      render(<WikiCompilePanel vaultPath="/vault" />);
    });

    // Initially no textarea
    expect(screen.queryByRole('textbox')).toBeNull();

    // Click edit
    await act(async () => {
      fireEvent.click(screen.getByText('編集'));
    });

    // Should show textarea
    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeInTheDocument();

    // Button text changes to "折りたたむ"
    expect(screen.getByText('折りたたむ')).toBeInTheDocument();
  });

  it('compiles wiki successfully', async () => {
    const onComplete = vi.fn();

    await act(async () => {
      render(<WikiCompilePanel vaultPath="/vault" onComplete={onComplete} />);
    });

    // Click compile button
    const compileBtn = screen.getByRole('button', { name: /Wiki をコンパイル/ });
    await act(async () => {
      fireEvent.click(compileBtn);
    });

    await waitFor(() => {
      expect(screen.getByText(/5 ページの Wiki を生成しました/)).toBeInTheDocument();
    });

    expect(onComplete).toHaveBeenCalled();
    expect((window as any).api.wiki.compile).toHaveBeenCalledWith('/vault', 'all', false);
  });

  it('shows error result on failure', async () => {
    (window as any).api.wiki.compile = vi.fn().mockResolvedValue({ ok: false, error: 'AI service unavailable' });

    await act(async () => {
      render(<WikiCompilePanel vaultPath="/vault" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Wiki をコンパイル/ }));
    });

    await waitFor(() => {
      expect(screen.getByText(/AI service unavailable/)).toBeInTheDocument();
    });
  });

  it('shows unknown error when no error message', async () => {
    (window as any).api.wiki.compile = vi.fn().mockResolvedValue({ ok: false });

    await act(async () => {
      render(<WikiCompilePanel vaultPath="/vault" />);
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Wiki をコンパイル/ }));
    });

    await waitFor(() => {
      expect(screen.getByText(/不明なエラー/)).toBeInTheDocument();
    });
  });

  it('loads subjects and schema on mount', async () => {
    await act(async () => {
      render(<WikiCompilePanel vaultPath="/vault" />);
    });

    expect((window as any).api.vault.listSubjects).toHaveBeenCalledWith('/vault');
    expect((window as any).api.wiki.getSchema).toHaveBeenCalledWith('/vault');
  });

  it('subscribes to compile progress events', async () => {
    await act(async () => {
      render(<WikiCompilePanel vaultPath="/vault" />);
    });

    expect((window as any).api.wiki.onCompileProgress).toHaveBeenCalled();
  });

  it('persists schema on textarea blur', async () => {
    await act(async () => {
      render(<WikiCompilePanel vaultPath="/vault" />);
    });

    // Open schema editor
    await act(async () => {
      fireEvent.click(screen.getByText('編集'));
    });

    const textarea = screen.getByRole('textbox');

    // Change content
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'updated schema' } });
    });

    // Blur to trigger save
    await act(async () => {
      fireEvent.blur(textarea);
    });

    expect((window as any).api.wiki.setSchema).toHaveBeenCalledWith('/vault', 'updated schema');
  });

  it('compiles with selected scope', async () => {
    await act(async () => {
      render(<WikiCompilePanel vaultPath="/vault" />);
    });

    await waitFor(() => {
      expect(screen.getByText('Math のみ')).toBeInTheDocument();
    });

    // Change scope to Math
    const select = screen.getByRole('combobox');
    await act(async () => {
      fireEvent.change(select, { target: { value: 'Math' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Wiki をコンパイル/ }));
    });

    await waitFor(() => {
      expect((window as any).api.wiki.compile).toHaveBeenCalledWith('/vault', 'Math', false);
    });
  });
});
