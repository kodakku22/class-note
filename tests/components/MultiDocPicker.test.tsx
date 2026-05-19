import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MultiDocPicker } from '../../src/components/ai/MultiDocPicker';

const listVaultFilesMock = vi.fn();

beforeEach(() => {
  listVaultFilesMock.mockReset();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).api = {
    docai: { listVaultFiles: listVaultFilesMock },
  };
});

const SAMPLE_FILES = [
  { relPath: 'Math/notes/Ch1.md', absPath: '/v/Math/notes/Ch1.md', title: '第1章', kind: 'note' as const, mtimeMs: 3, tags: ['math'] },
  { relPath: 'Papers/paper.pdf', absPath: '/v/Papers/paper.pdf', title: 'paper', kind: 'pdf' as const, mtimeMs: 2, tags: ['ml'] },
  { relPath: 'Memos/idea.md', absPath: '/v/Memos/idea.md', title: 'idea', kind: 'note' as const, mtimeMs: 1, tags: [] },
];

describe('MultiDocPicker', () => {
  it('shows loading state then renders the list', async () => {
    listVaultFilesMock.mockResolvedValueOnce({ ok: true, files: SAMPLE_FILES });
    render(
      <MultiDocPicker
        vaultPath="/v"
        initialSelected={[]}
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(screen.getByText('読み込み中…')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('読み込み中…')).not.toBeInTheDocument());
    expect(screen.getByText('第1章')).toBeInTheDocument();
    expect(screen.getByText('paper')).toBeInTheDocument();
    expect(screen.getByText('idea')).toBeInTheDocument();
  });

  it('filters by search query (case-insensitive, title + path + tags)', async () => {
    listVaultFilesMock.mockResolvedValueOnce({ ok: true, files: SAMPLE_FILES });
    render(
      <MultiDocPicker vaultPath="/v" initialSelected={[]} onCancel={() => {}} onConfirm={() => {}} />
    );
    await screen.findByText('第1章');
    fireEvent.change(screen.getByLabelText('ファイル検索'), { target: { value: 'ml' } });
    expect(screen.getByText('paper')).toBeInTheDocument();
    expect(screen.queryByText('第1章')).not.toBeInTheDocument();
  });

  it('filters by kind (PDF only)', async () => {
    listVaultFilesMock.mockResolvedValueOnce({ ok: true, files: SAMPLE_FILES });
    render(
      <MultiDocPicker vaultPath="/v" initialSelected={[]} onCancel={() => {}} onConfirm={() => {}} />
    );
    await screen.findByText('第1章');
    fireEvent.click(screen.getByRole('radio', { name: '📕 PDF' }));
    expect(screen.getByText('paper')).toBeInTheDocument();
    expect(screen.queryByText('第1章')).not.toBeInTheDocument();
  });

  it('enforces maxSelectable', async () => {
    listVaultFilesMock.mockResolvedValueOnce({ ok: true, files: SAMPLE_FILES });
    render(
      <MultiDocPicker
        vaultPath="/v"
        initialSelected={[]}
        maxSelectable={2}
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    );
    await screen.findByText('第1章');
    const rows = screen.getAllByTestId('docai-picker-row');
    fireEvent.click(rows[0]);
    fireEvent.click(rows[1]);
    expect(screen.getByText('2 / 2 選択中')).toBeInTheDocument();
    // Third one should be disabled now.
    expect(rows[2]).toBeDisabled();
  });

  it('prevents deselecting the primary file', async () => {
    listVaultFilesMock.mockResolvedValueOnce({ ok: true, files: SAMPLE_FILES });
    render(
      <MultiDocPicker
        vaultPath="/v"
        initialSelected={['/v/Math/notes/Ch1.md']}
        primaryFilePath="/v/Math/notes/Ch1.md"
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    );
    await screen.findByText('第1章');
    const rows = screen.getAllByTestId('docai-picker-row');
    // Click on the primary file row — should remain selected.
    fireEvent.click(rows[0]);
    expect(rows[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('invokes onConfirm with selected paths', async () => {
    listVaultFilesMock.mockResolvedValueOnce({ ok: true, files: SAMPLE_FILES });
    const onConfirm = vi.fn();
    render(
      <MultiDocPicker vaultPath="/v" initialSelected={[]} onCancel={() => {}} onConfirm={onConfirm} />
    );
    await screen.findByText('第1章');
    fireEvent.click(screen.getAllByTestId('docai-picker-row')[1]);
    fireEvent.click(screen.getByText('決定'));
    expect(onConfirm).toHaveBeenCalledWith(['/v/Papers/paper.pdf']);
  });

  it('shows error when listVaultFiles fails', async () => {
    listVaultFilesMock.mockResolvedValueOnce({ ok: false, error: '取得に失敗' });
    render(
      <MultiDocPicker vaultPath="/v" initialSelected={[]} onCancel={() => {}} onConfirm={() => {}} />
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('取得に失敗');
  });

  it('cancels when the backdrop is clicked', async () => {
    listVaultFilesMock.mockResolvedValueOnce({ ok: true, files: SAMPLE_FILES });
    const onCancel = vi.fn();
    render(
      <MultiDocPicker vaultPath="/v" initialSelected={[]} onCancel={onCancel} onConfirm={() => {}} />
    );
    await screen.findByText('第1章');
    fireEvent.click(screen.getByRole('dialog'));
    expect(onCancel).toHaveBeenCalled();
  });
});
