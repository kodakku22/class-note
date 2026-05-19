import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { SkillsPanel } from '../../src/components/skills/SkillsPanel';

describe('SkillsPanel', () => {
  let detectMock: ReturnType<typeof vi.fn>;
  let redetectMock: ReturnType<typeof vi.fn>;
  let analyzeMock: ReturnType<typeof vi.fn>;
  let interopMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    detectMock = vi.fn().mockResolvedValue({ ok: true, path: '/usr/bin/obsidian', version: '2.0.1' });
    redetectMock = vi.fn().mockResolvedValue({ ok: true, path: '/usr/bin/obsidian', version: '2.0.1' });
    analyzeMock = vi.fn().mockResolvedValue({ ok: true, output: 'Analysis report text here' });
    interopMock = vi.fn().mockResolvedValue({
      ok: true,
      obsidian: {
        hasConfigDir: true,
        markdownFiles: 2,
        filesWithFrontmatter: 1,
        wikilinkCount: 3,
        tagCount: 4,
        notesMissingFrontmatter: [],
        brokenWikilinks: [],
        warnings: [],
      },
      zotero: {
        hasRefsBib: true,
        refsBibEntries: 1,
        paperFiles: 1,
        papersWithBibkey: 1,
        papersWithDoi: 1,
        papersMissingBibkey: [],
        papersMissingDoi: [],
        bibkeysMissingFromRefsBib: [],
        duplicateBibkeys: [],
        warnings: [],
      },
      repairActions: [],
      recommendations: ['Obsidian / Zotero 互換性の主要チェックは良好です'],
    });
    (window as any).api = {
      skills: {
        detectObsidian: detectMock,
        redetectObsidian: redetectMock,
        analyzeWithObsidianCLI: analyzeMock,
        interopReport: interopMock,
      },
    };
  });

  it('renders section label', async () => {
    await act(async () => {
      render(<SkillsPanel vaultPath="/vault" />);
    });
    expect(screen.getByText('Obsidian Skills 連携')).toBeInTheDocument();
  });

  it('shows detected state when CLI is found', async () => {
    await act(async () => {
      render(<SkillsPanel vaultPath="/vault" />);
    });
    await waitFor(() => {
      expect(screen.getByText(/検出済み/)).toBeInTheDocument();
      expect(screen.getByText('/usr/bin/obsidian')).toBeInTheDocument();
      expect(screen.getByText(/v2\.0\.1/)).toBeInTheDocument();
    });
  });

  it('shows missing state when CLI is not found', async () => {
    detectMock.mockResolvedValue({ ok: false });
    await act(async () => {
      render(<SkillsPanel vaultPath="/vault" />);
    });
    await waitFor(() => {
      expect(screen.getByText(/未検出/)).toBeInTheDocument();
    });
  });

  it('shows unknown/loading state initially', () => {
    detectMock.mockReturnValue(new Promise(() => {}));
    render(<SkillsPanel vaultPath="/vault" />);
    expect(screen.getByText(/検出中/)).toBeInTheDocument();
  });

  it('re-detects on redetect button click', async () => {
    await act(async () => {
      render(<SkillsPanel vaultPath="/vault" />);
    });
    await waitFor(() => {
      expect(screen.getByText(/検出済み/)).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText(/再検出/));
    });
    expect(redetectMock).toHaveBeenCalled();
  });

  it('updates status after redetect finds missing', async () => {
    await act(async () => {
      render(<SkillsPanel vaultPath="/vault" />);
    });
    await waitFor(() => {
      expect(screen.getByText(/検出済み/)).toBeInTheDocument();
    });
    redetectMock.mockResolvedValue({ ok: false });
    await act(async () => {
      fireEvent.click(screen.getByText(/再検出/));
    });
    await waitFor(() => {
      expect(screen.getByText(/未検出/)).toBeInTheDocument();
    });
  });

  it('shows analyze button when detected', async () => {
    await act(async () => {
      render(<SkillsPanel vaultPath="/vault" />);
    });
    await waitFor(() => {
      expect(screen.getByText(/Vault 分析を実行/)).toBeInTheDocument();
    });
  });

  it('does not show analyze button when missing', async () => {
    detectMock.mockResolvedValue({ ok: false });
    await act(async () => {
      render(<SkillsPanel vaultPath="/vault" />);
    });
    await waitFor(() => {
      expect(screen.getByText(/未検出/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Vault 分析を実行/)).not.toBeInTheDocument();
  });

  it('runs analysis and shows output', async () => {
    await act(async () => {
      render(<SkillsPanel vaultPath="/vault" />);
    });
    await waitFor(() => {
      expect(screen.getByText(/Vault 分析を実行/)).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText(/Vault 分析を実行/));
    });
    await waitFor(() => {
      expect(screen.getByText('Analysis report text here')).toBeInTheDocument();
    });
    expect(analyzeMock).toHaveBeenCalledWith('/vault');
  });

  it('shows error when analysis fails', async () => {
    analyzeMock.mockResolvedValue({ ok: false, error: 'CLI crashed' });
    await act(async () => {
      render(<SkillsPanel vaultPath="/vault" />);
    });
    await waitFor(() => {
      expect(screen.getByText(/Vault 分析を実行/)).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText(/Vault 分析を実行/));
    });
    await waitFor(() => {
      expect(screen.getByText(/CLI crashed/)).toBeInTheDocument();
    });
  });

  it('shows empty output as (空)', async () => {
    analyzeMock.mockResolvedValue({ ok: true, output: null });
    await act(async () => {
      render(<SkillsPanel vaultPath="/vault" />);
    });
    await waitFor(() => {
      expect(screen.getByText(/Vault 分析を実行/)).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText(/Vault 分析を実行/));
    });
    await waitFor(() => {
      expect(screen.getByText('(空)')).toBeInTheDocument();
    });
  });

  it('disables analyze button while analyzing', async () => {
    let resolveAnalyze: ((v: unknown) => void) | null = null;
    analyzeMock.mockImplementation(() => new Promise((r) => { resolveAnalyze = r; }));

    await act(async () => {
      render(<SkillsPanel vaultPath="/vault" />);
    });
    await waitFor(() => {
      expect(screen.getByText(/Vault 分析を実行/)).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText(/Vault 分析を実行/));
    });
    expect(screen.getByText(/分析中/)).toBeInTheDocument();
    const btn = screen.getByText(/分析中/).closest('button');
    expect(btn).toBeDisabled();

    await act(async () => {
      resolveAnalyze?.({ ok: true, output: 'done' });
    });
  });

  it('shows install instructions details', async () => {
    await act(async () => {
      render(<SkillsPanel vaultPath="/vault" />);
    });
    expect(screen.getByText(/インストール手順/)).toBeInTheDocument();
    expect(screen.getByText(/利用可能な 5 つのスキル/)).toBeInTheDocument();
  });

  it('shows help text about ClassNotes AI agents', async () => {
    await act(async () => {
      render(<SkillsPanel vaultPath="/vault" />);
    });
    expect(screen.getByText(/Obsidian Skills が無くても/)).toBeInTheDocument();
  });

  it('shows detected path without version', async () => {
    detectMock.mockResolvedValue({ ok: true, path: '/usr/bin/obsidian' });
    await act(async () => {
      render(<SkillsPanel vaultPath="/vault" />);
    });
    await waitFor(() => {
      expect(screen.getByText(/検出済み/)).toBeInTheDocument();
      expect(screen.getByText('/usr/bin/obsidian')).toBeInTheDocument();
    });
  });

  it('shows Zotero and Obsidian interoperability status', async () => {
    await act(async () => {
      render(<SkillsPanel vaultPath="/vault" />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Zotero \/ Obsidian 互換性チェック/)).toBeInTheDocument();
      expect(screen.getByText(/Obsidian: \.obsidianあり/)).toBeInTheDocument();
      expect(screen.getByText(/Zotero: refs\.bib あり/)).toBeInTheDocument();
    });
    expect(interopMock).toHaveBeenCalledWith('/vault');
  });

  it('shows interoperability warnings when Zotero metadata is incomplete', async () => {
    interopMock.mockResolvedValue({
      ok: true,
      obsidian: {
        hasConfigDir: false,
        markdownFiles: 3,
        filesWithFrontmatter: 0,
        wikilinkCount: 0,
        tagCount: 0,
        notesMissingFrontmatter: ['Math/notes/A.md'],
        brokenWikilinks: [],
        warnings: ['.obsidian が無いため、Obsidian 側でVaultとして未初期化の可能性があります'],
      },
      zotero: {
        hasRefsBib: false,
        refsBibEntries: 0,
        paperFiles: 2,
        papersWithBibkey: 1,
        papersWithDoi: 0,
        papersMissingBibkey: ['Papers/Missing.md'],
        papersMissingDoi: ['Papers/One.md', 'Papers/Missing.md'],
        bibkeysMissingFromRefsBib: [],
        duplicateBibkeys: ['smith2024'],
        warnings: ['Papers/refs.bib がありません。Zotero / Better BibTeX 連携用にexportしてください'],
      },
      repairActions: [
        {
          id: 'zotero-bibkey-Papers/Missing.md',
          severity: 'error',
          area: 'zotero',
          title: 'Paper noteにbibkeyを追加する',
          description: 'citation picker / BibTeX export / Zotero照合の安定性に必要です。',
          relPath: 'Papers/Missing.md',
          dryRunOnly: true,
          manualSteps: ['bibkeyを追加する'],
        },
      ],
      recommendations: [
        '.obsidian が無いため、Obsidian 側でVaultとして未初期化の可能性があります',
        'Papers/refs.bib がありません。Zotero / Better BibTeX 連携用にexportしてください',
      ],
    });

    await act(async () => {
      render(<SkillsPanel vaultPath="/vault" />);
    });

    await waitFor(() => {
      expect(screen.getByText(/refs\.bib がありません/)).toBeInTheDocument();
      expect(screen.getByText(/smith2024/)).toBeInTheDocument();
      expect(screen.getByText(/修復候補/)).toBeInTheDocument();
      expect(screen.getByText(/Paper noteにbibkeyを追加する/)).toBeInTheDocument();
    });
  });

  it('shows interoperability check errors', async () => {
    interopMock.mockResolvedValue({ ok: false, error: 'bad vault' });
    await act(async () => {
      render(<SkillsPanel vaultPath="/vault" />);
    });
    await waitFor(() => {
      expect(screen.getByText(/bad vault/)).toBeInTheDocument();
    });
  });

  it('shows default error when analysis error is undefined', async () => {
    analyzeMock.mockResolvedValue({ ok: false });
    await act(async () => {
      render(<SkillsPanel vaultPath="/vault" />);
    });
    await waitFor(() => {
      expect(screen.getByText(/Vault 分析を実行/)).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText(/Vault 分析を実行/));
    });
    await waitFor(() => {
      expect(screen.getByText(/失敗/)).toBeInTheDocument();
    });
  });
});
