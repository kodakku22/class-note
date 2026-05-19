import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// Controllable Dialog mock
const mockConfirm = vi.fn().mockResolvedValue(true);
vi.mock('../../src/components/common/Dialog', () => ({
  useDialog: () => [
    { alert: vi.fn(), confirm: mockConfirm, prompt: vi.fn() },
    null,
  ],
}));

import { WikiCompilePanel } from '../../src/components/WikiCompilePanel';

describe('WikiCompilePanel actions', () => {
  const onComplete = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    mockConfirm.mockResolvedValue(true);
    onComplete.mockClear();
    (window as any).api = {
      vault: {
        listSubjects: vi.fn().mockResolvedValue(['math', 'physics']),
      },
      wiki: {
        getSchema: vi.fn().mockResolvedValue('# Schema\nRules here.'),
        setSchema: vi.fn().mockResolvedValue(undefined),
        compile: vi.fn().mockResolvedValue({ ok: true, pageCount: 5 }),
        onCompileProgress: vi.fn().mockReturnValue(() => {}),
      },
    };
  });

  it('handles manual edit conflict with overwrite', async () => {
    (window as any).api.wiki.compile = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        conflict: true,
        message: 'manual edits detected',
        manuallyEdited: ['page1.md', 'page2.md'],
      })
      .mockResolvedValueOnce({ ok: true, pageCount: 3 });
    mockConfirm.mockResolvedValue(true);
    await act(async () => { render(<WikiCompilePanel vaultPath="/vault" onComplete={onComplete} />); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Wiki をコンパイル/ })); });
    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ title: '手動編集の可能性があります' })
      );
    });
    await waitFor(() => { expect((window as any).api.wiki.compile).toHaveBeenCalledTimes(2); });
    expect((window as any).api.wiki.compile).toHaveBeenLastCalledWith('/vault', 'all', true);
  });

  it('cancels compile on manual edit conflict decline', async () => {
    (window as any).api.wiki.compile = vi.fn().mockResolvedValue({
      ok: false,
      conflict: true,
      message: 'conflict!',
      manuallyEdited: ['page1.md'],
    });
    mockConfirm.mockResolvedValue(false);
    await act(async () => { render(<WikiCompilePanel vaultPath="/vault" />); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Wiki をコンパイル/ })); });
    await waitFor(() => { expect(screen.getByText(/キャンセルしました/)).toBeInTheDocument(); });
  });

  it('truncates list when >10 manually edited pages', async () => {
    const pages = Array.from({ length: 15 }, (_, i) => `page-${i}.md`);
    (window as any).api.wiki.compile = vi.fn().mockResolvedValue({
      ok: false,
      conflict: true,
      manuallyEdited: pages,
    });
    mockConfirm.mockResolvedValue(false);
    await act(async () => { render(<WikiCompilePanel vaultPath="/vault" />); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Wiki をコンパイル/ })); });
    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('他 5 ページ'),
        })
      );
    });
  });

  it('shows progress during compilation', async () => {
    let progressCb: any;
    (window as any).api.wiki.onCompileProgress = vi.fn().mockImplementation((cb: any) => {
      progressCb = cb;
      return () => {};
    });
    let resolveCompile: any;
    (window as any).api.wiki.compile = vi.fn().mockImplementation(() =>
      new Promise(r => { resolveCompile = r; })
    );
    await act(async () => { render(<WikiCompilePanel vaultPath="/vault" />); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Wiki をコンパイル/ })); });
    // Collecting stage shown initially
    expect(screen.getByRole('status')).toBeInTheDocument();
    // Simulate streaming progress
    await act(async () => { progressCb({ stage: 'streaming', message: 'AI応答中' }); });
    expect(screen.getByText('AI応答中')).toBeInTheDocument();
    // Simulate writing stage (no message → uses stage label)
    await act(async () => { progressCb({ stage: 'writing' }); });
    expect(screen.getByText('Wiki ページを書き出し中…')).toBeInTheDocument();
    // Resolve
    await act(async () => { resolveCompile({ ok: true, pageCount: 2 }); });
    await waitFor(() => { expect(screen.getByText(/2 ページの Wiki/)).toBeInTheDocument(); });
  });

  it('shows 0 page count when not returned', async () => {
    (window as any).api.wiki.compile = vi.fn().mockResolvedValue({ ok: true });
    await act(async () => { render(<WikiCompilePanel vaultPath="/vault" />); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Wiki をコンパイル/ })); });
    await waitFor(() => { expect(screen.getByText(/0 ページの Wiki/)).toBeInTheDocument(); });
  });

  it('uses unknown stage name as fallback', async () => {
    let progressCb: any;
    (window as any).api.wiki.onCompileProgress = vi.fn().mockImplementation((cb: any) => {
      progressCb = cb;
      return () => {};
    });
    let resolveCompile: any;
    (window as any).api.wiki.compile = vi.fn().mockImplementation(() =>
      new Promise(r => { resolveCompile = r; })
    );
    await act(async () => { render(<WikiCompilePanel vaultPath="/vault" />); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Wiki をコンパイル/ })); });
    // Unknown stage
    await act(async () => { progressCb({ stage: 'unknown_stage' }); });
    expect(screen.getByText('unknown_stage')).toBeInTheDocument();
    await act(async () => { resolveCompile({ ok: true, pageCount: 1 }); });
  });

  it('disables controls during compilation', async () => {
    let resolveCompile: any;
    (window as any).api.wiki.compile = vi.fn().mockImplementation(() =>
      new Promise(r => { resolveCompile = r; })
    );
    await act(async () => { render(<WikiCompilePanel vaultPath="/vault" />); });
    const compileBtn = screen.getByRole('button', { name: /Wiki をコンパイル/ });
    await act(async () => { fireEvent.click(compileBtn); });
    // Button should be disabled and show loading text
    expect(screen.getByText(/生成中/)).toBeInTheDocument();
    // Scope select should be disabled
    expect(screen.getByRole('combobox')).toBeDisabled();
    await act(async () => { resolveCompile({ ok: true, pageCount: 1 }); });
  });
});
