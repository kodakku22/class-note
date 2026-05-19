import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { TemplateEditor } from '../../src/components/TemplateEditor';

const SAMPLE_TEMPLATES = [
  { name: 'lecture', filePath: '/vault/_templates/lecture.md' },
  { name: 'summary', filePath: '/vault/_templates/summary.md' },
];

describe('TemplateEditor', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    onClose.mockClear();
    (window as any).api.vault = {
      listTemplates: vi.fn().mockResolvedValue(SAMPLE_TEMPLATES),
      readTemplate: vi.fn().mockResolvedValue('# {{title}}\n\nBody here'),
      writeTemplate: vi.fn().mockResolvedValue({ ok: true }),
      deleteTemplate: vi.fn().mockResolvedValue({ ok: true }),
    };
    // mock confirm for delete tests
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('renders dialog title', async () => {
    await act(async () => {
      render(<TemplateEditor vaultPath="/vault" onClose={onClose} />);
    });

    expect(screen.getByText(/テンプレート管理/)).toBeInTheDocument();
  });

  it('loads and shows template list', async () => {
    await act(async () => {
      render(<TemplateEditor vaultPath="/vault" onClose={onClose} />);
    });

    await waitFor(() => {
      const items = document.querySelectorAll('.file-item .name');
      const names = Array.from(items).map((el) => el.textContent);
      expect(names).toContain('lecture');
      expect(names).toContain('summary');
    });
  });

  it('selects first template automatically', async () => {
    await act(async () => {
      render(<TemplateEditor vaultPath="/vault" onClose={onClose} />);
    });

    await waitFor(() => {
      expect((window as any).api.vault.readTemplate).toHaveBeenCalledWith('/vault', 'lecture');
    });
  });

  it('shows template content in textarea', async () => {
    await act(async () => {
      render(<TemplateEditor vaultPath="/vault" onClose={onClose} />);
    });

    await waitFor(() => {
      const textarea = document.querySelector('.template-textarea') as HTMLTextAreaElement;
      expect(textarea).toBeInTheDocument();
      expect(textarea?.value).toContain('Body here');
    });
  });

  it('switches selected template on click', async () => {
    await act(async () => {
      render(<TemplateEditor vaultPath="/vault" onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText('summary')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('summary'));
    });

    expect((window as any).api.vault.readTemplate).toHaveBeenCalledWith('/vault', 'summary');
  });

  it('saves template on save button click', async () => {
    await act(async () => {
      render(<TemplateEditor vaultPath="/vault" onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText('保存')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('保存'));
    });

    expect((window as any).api.vault.writeTemplate).toHaveBeenCalled();
  });

  it('shows saved hint after save', async () => {
    await act(async () => {
      render(<TemplateEditor vaultPath="/vault" onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText('保存')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('保存'));
    });

    await waitFor(() => {
      expect(screen.getByText('保存しました')).toBeInTheDocument();
    });
  });

  it('creates new template', async () => {
    await act(async () => {
      render(<TemplateEditor vaultPath="/vault" onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('新規テンプレート名')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('新規テンプレート名');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'daily' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText('追加'));
    });

    expect((window as any).api.vault.writeTemplate).toHaveBeenCalledWith(
      '/vault',
      'daily',
      expect.stringContaining('# {{title}}'),
    );
  });

  it('creates template on Enter key', async () => {
    await act(async () => {
      render(<TemplateEditor vaultPath="/vault" onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByPlaceholderText('新規テンプレート名')).toBeInTheDocument();
    });

    const input = screen.getByPlaceholderText('新規テンプレート名');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'review' } });
    });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    expect((window as any).api.vault.writeTemplate).toHaveBeenCalled();
  });

  it('disables add button when name is empty', async () => {
    await act(async () => {
      render(<TemplateEditor vaultPath="/vault" onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText('追加')).toBeDisabled();
    });
  });

  it('deletes template with confirmation', async () => {
    await act(async () => {
      render(<TemplateEditor vaultPath="/vault" onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText('削除')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('削除'));
    });

    expect(window.confirm).toHaveBeenCalled();
    expect((window as any).api.vault.deleteTemplate).toHaveBeenCalledWith('/vault', 'lecture');
  });

  it('does not delete when confirm is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await act(async () => {
      render(<TemplateEditor vaultPath="/vault" onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText('削除')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('削除'));
    });

    expect((window as any).api.vault.deleteTemplate).not.toHaveBeenCalled();
  });

  it('closes dialog on close button', async () => {
    await act(async () => {
      render(<TemplateEditor vaultPath="/vault" onClose={onClose} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByText('閉じる'));
    });

    expect(onClose).toHaveBeenCalled();
  });

  it('closes on overlay click', async () => {
    const { container } = await act(async () => {
      return render(<TemplateEditor vaultPath="/vault" onClose={onClose} />);
    });

    const overlay = container.querySelector('.modal-overlay');
    if (overlay) {
      await act(async () => {
        fireEvent.click(overlay);
      });
    }

    expect(onClose).toHaveBeenCalled();
  });

  it('shows empty state when no templates', async () => {
    (window as any).api.vault.listTemplates = vi.fn().mockResolvedValue([]);

    await act(async () => {
      render(<TemplateEditor vaultPath="/vault" onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText('まだありません')).toBeInTheDocument();
    });
  });

  it('shows placeholder hint when no template selected', async () => {
    (window as any).api.vault.listTemplates = vi.fn().mockResolvedValue([]);

    await act(async () => {
      render(<TemplateEditor vaultPath="/vault" onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/左から選択/)).toBeInTheDocument();
    });
  });

  it('shows variable placeholder info', async () => {
    await act(async () => {
      render(<TemplateEditor vaultPath="/vault" onClose={onClose} />);
    });

    await waitFor(() => {
      expect(screen.getByText(/\{\{date\}\}/)).toBeInTheDocument();
    });
  });
});
