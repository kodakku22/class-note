// useCommandPalette — builds the PaletteCommand[] array that drives both the
// CommandPalette UI and the IconRail's pinned commands.
//
// Extracted from App.tsx where it was a 380-line useMemo embedded directly in
// the render path. Behaviour-preserving: every command id, label, subtitle,
// keyword set, and `run()` body is identical to the inline version.
import { useMemo, type RefObject } from 'react';
import type { PaletteCommand } from '../components/CommandPalette';
import type { FileEntry, LinkTarget, PluginManifest } from '../types';
import type { ViewMode } from '../state/appReducer';
import type { SubjectView } from '../components/FileList';
import { DEFAULT_TEMPLATES } from '../types/objectTypes';
import { basename } from '../utils/paths';

export type CommandPaletteOptions = {
  vaultPath: string | null;
  activeSubject: string | null;
  activeFile: FileEntry | null;
  plugins: PluginManifest[];
  linkTargetsRef: RefObject<LinkTarget[]>;
  // Actions
  handleNewNote: () => void;
  openFileByPath: (filePath: string) => Promise<void>;
  openPluginView: (pluginId: string, viewId: string) => void;
  setViewMode: (mode: ViewMode) => void;
  setSubjectView: (fn: (prev: SubjectView) => SubjectView) => void;
  bumpReload: () => void;
  // UI dialog setters
  setShowFAQ: (v: boolean) => void;
  setShowWebClip: (v: boolean) => void;
  setShowCitation: (v: boolean) => void;
  setShowSettings: (v: boolean) => void;
};

/**
 * Build the canonical PaletteCommand[] for the workspace. Memoised on the
 * dependencies App.tsx historically tracked plus the new dialog setters.
 */
export function useCommandPalette(opts: CommandPaletteOptions): PaletteCommand[] {
  const {
    vaultPath,
    activeSubject,
    activeFile,
    plugins,
    linkTargetsRef,
    handleNewNote,
    openFileByPath,
    openPluginView,
    setViewMode,
    setSubjectView,
    bumpReload,
    setShowFAQ,
    setShowWebClip,
    setShowCitation,
    setShowSettings,
  } = opts;

  return useMemo<PaletteCommand[]>(() => {
    const builtInCommands: PaletteCommand[] = [
      {
        id: 'new-note',
        title: '新しいノート',
        subtitle: '種類を選んでMarkdownノートを作成',
        icon: '📝',
        keywords: ['create', 'note', 'new'],
        run: () => handleNewNote(),
      },
      {
        id: 'new-experiment',
        title: '実験ノートを作成',
        subtitle: activeSubject ? `${activeSubject} に構造化実験ログを作成` : '科目を選ぶと使えます',
        icon: '🧪',
        keywords: ['experiment', 'reproducibility', '研究', '実験'],
        run: async () => {
          if (!activeSubject) {
            setViewMode('subject');
            window.alert('実験ノートを作るには、先に科目を選んでください。');
            return;
          }
          const title = window.prompt('実験タイトル', `Experiment ${new Date().toISOString().slice(0, 10)}`);
          if (!title?.trim()) return;
          const r = await window.api.vault.createTypedNote(
            vaultPath!,
            activeSubject,
            'experiment',
            title.trim(),
            DEFAULT_TEMPLATES.experiment
          );
          setViewMode('subject');
          setSubjectView(() => 'list');
          bumpReload();
          openFileByPath(r.filePath);
        },
      },
      {
        id: 'faq-help',
        title: 'FAQ / ヘルプ',
        subtitle: 'トラブルシューティングとよくある質問',
        icon: '❓',
        keywords: ['faq', 'help', 'ヘルプ', 'トラブル', 'troubleshoot', '質問'],
        run: () => setShowFAQ(true),
      },
      {
        id: 'web-clip',
        title: 'Web Clip',
        subtitle: 'URLからMarkdownをVaultに保存',
        icon: '🌐',
        keywords: ['clip', 'web', 'url', 'second brain'],
        run: () => setShowWebClip(true),
      },
      {
        id: 'insert-citation',
        title: '引用を挿入',
        subtitle: 'Papersのbibkeyから [@key] を挿入',
        icon: '📎',
        keywords: ['citation', 'bibkey', 'papers'],
        run: () => setShowCitation(true),
      },
      {
        id: 'export-bibtex',
        title: 'BibTeXを書き出し',
        subtitle: 'Papersのfrontmatterから refs.bib を生成',
        icon: '📚',
        keywords: ['bibtex', 'citation', 'papers', 'export'],
        run: async () => {
          setViewMode('papers');
          const r = await window.api.papers.exportBibtex(vaultPath!);
          if (r.ok) {
            window.alert(`${r.count ?? 0} 件のBibTeXを書き出しました: ${r.filePath}`);
          } else {
            window.alert(`BibTeX書き出しに失敗しました: ${r.error ?? '不明なエラー'}`);
          }
        },
      },
      {
        id: 'export-latex',
        title: '開いているノートをLaTeX書き出し',
        subtitle: activeFile ? activeFile.name : 'Markdownノートを開くと使えます',
        icon: '📄',
        keywords: ['latex', 'paper', 'export'],
        run: async () => {
          if (!activeFile || activeFile.kind !== 'note') {
            window.alert('LaTeX書き出しには、先にMarkdownノートを開いてください。');
            return;
          }
          const r = await window.api.latex.exportNote(vaultPath!, activeFile.path, 'generic');
          if (r.ok) {
            setViewMode('outputs');
            bumpReload();
            window.alert(`LaTeXを書き出しました: ${r.texPath}`);
          } else {
            window.alert(`LaTeX書き出しに失敗しました: ${r.error ?? '不明なエラー'}`);
          }
        },
      },
      {
        id: 'open-research-progress',
        title: '研究進捗を開く',
        subtitle: '論文・本・授業ノート・締切のダッシュボード',
        icon: '📈',
        keywords: ['progress', 'research', 'dashboard', 'papers'],
        run: () => setViewMode('progress'),
      },
      {
        id: 'open-wiki',
        title: 'Wikiを開く',
        subtitle: 'AIで整理したSecond Brainページ',
        icon: '🧠',
        keywords: ['wiki', 'second brain'],
        run: () => setViewMode('wiki'),
      },
      {
        id: 'compile-wiki',
        title: 'Wikiを生成',
        subtitle: 'VaultのノートからWikiページをコンパイル',
        icon: '✨',
        keywords: ['compile', 'wiki', 'ai'],
        run: async () => {
          const ok = window.confirm('Vault全体からWikiを生成します。数分かかる場合があります。');
          if (!ok) return;
          setViewMode('wiki');
          const r = await window.api.wiki.compile(vaultPath!, 'all');
          if (r.ok) {
            bumpReload();
            window.alert(`Wiki生成が完了しました (${r.pageCount ?? 0} ページ)。`);
          } else {
            window.alert(`Wiki生成に失敗しました: ${r.error ?? r.message ?? '不明なエラー'}`);
          }
        },
      },
      {
        id: 'wiki-health',
        title: 'Wikiヘルスチェック',
        subtitle: 'リンク切れや構造の問題をOutputsに保存',
        icon: '🩺',
        keywords: ['health', 'wiki', 'check'],
        run: async () => {
          setViewMode('outputs');
          const r = await window.api.wiki.healthCheck(vaultPath!);
          if (r.ok) {
            bumpReload();
            window.alert(`ヘルスチェックを保存しました: ${r.reportPath}`);
          } else {
            window.alert(`ヘルスチェックに失敗しました: ${r.error ?? '不明なエラー'}`);
          }
        },
      },
      {
        id: 'epistemic-bootstrap',
        title: '認識論的CIを初期化',
        subtitle: 'raw/questions/Wiki/Outputs と CLAUDE.md をVaultへ追加',
        icon: '🧭',
        keywords: ['epistemic', 'cicd', 'claude', 'agents', 'bootstrap'],
        run: async () => {
          const r = await window.api.epistemic.bootstrap(vaultPath!);
          if (r.ok) {
            bumpReload();
            window.alert(
              r.created.length > 0
                ? `認識論的CIを初期化しました:\n- ${r.created.join('\n- ')}`
                : '認識論的CIはすでに初期化済みです。'
            );
          }
        },
      },
      {
        id: 'epistemic-review',
        title: '仮想査読を実行',
        subtitle: activeFile ? `${activeFile.name} をReviewer 2として批判的に読む` : 'ノートを開くと使えます',
        icon: '🧑‍⚖️',
        keywords: ['epistemic', 'review', 'peer', 'hypothesis', '査読'],
        run: async () => {
          if (!activeFile || activeFile.kind !== 'note') {
            window.alert('仮想査読を実行するには、先にMarkdownノートを開いてください。');
            return;
          }
          const ok = window.confirm('このノートを仮想査読します。AI利用料が発生する場合があります。');
          if (!ok) return;
          const r = await window.api.epistemic.peerReview(vaultPath!, activeFile.path);
          if (r.ok && r.filePath) {
            setViewMode('outputs');
            bumpReload();
            openFileByPath(r.filePath);
          } else {
            window.alert(`仮想査読に失敗しました: ${r.error ?? '不明なエラー'}`);
          }
        },
      },
      {
        id: 'epistemic-map',
        title: '構造的同型性を探す',
        subtitle: activeFile ? '開いているノートと別ノートの抽象構造を比較' : 'ノートを開くと使えます',
        icon: '🧩',
        keywords: ['epistemic', 'map', 'isomorphism', 'category', '圏論'],
        run: async () => {
          if (!activeFile || activeFile.kind !== 'note') {
            window.alert('構造マッピングを実行するには、先にMarkdownノートを開いてください。');
            return;
          }
          const query = window.prompt('比較先ノート名またはファイルパスを入力してください');
          if (!query?.trim()) return;
          const q = query.trim().toLowerCase();
          const targets = linkTargetsRef.current ?? [];
          const target = targets.find((t) => {
            const fileName = basename(t.filePath).replace(/\.md$/i, '').toLowerCase();
            return (
              t.filePath.toLowerCase() === q ||
              t.name.toLowerCase() === q ||
              fileName === q ||
              t.filePath.toLowerCase().endsWith(q)
            );
          });
          if (!target) {
            window.alert('比較先ノートが見つかりませんでした。コマンドパレットで検索できるノート名を入力してください。');
            return;
          }
          const ok = window.confirm(`${activeFile.name} と ${target.name} の構造的同型性を分析します。`);
          if (!ok) return;
          const r = await window.api.epistemic.mapIsomorphism(vaultPath!, activeFile.path, target.filePath);
          if (r.ok && r.filePath) {
            setViewMode('outputs');
            bumpReload();
            openFileByPath(r.filePath);
          } else {
            window.alert(`構造マッピングに失敗しました: ${r.error ?? '不明なエラー'}`);
          }
        },
      },
      {
        id: 'epistemic-consistency',
        title: '認識論的CIチェック',
        subtitle: 'epistemic_status・依存関係・矛盾・論理の孤島を検査',
        icon: '🧪',
        keywords: ['epistemic', 'consistency', 'cicd', 'health', 'contradicts'],
        run: async () => {
          setViewMode('outputs');
          const r = await window.api.epistemic.checkConsistency(vaultPath!);
          if (r.ok && r.filePath) {
            bumpReload();
            openFileByPath(r.filePath);
          } else {
            window.alert(`認識論的CIチェックに失敗しました: ${r.error ?? '不明なエラー'}`);
          }
        },
      },
      {
        id: 'analyze-vault',
        title: 'Vaultを分析',
        subtitle: '孤立ノート・タグ傾向・改善提案を確認',
        icon: '🔎',
        keywords: ['analyze', 'vault', 'agent', 'tags', 'orphans'],
        run: async () => {
          const ok = window.confirm('Vaultの構造を分析します。AI設定によっては少し時間がかかります。');
          if (!ok) return;
          const r = await window.api.ai.analyzeVault(vaultPath!);
          if (!r.ok) {
            window.alert(`Vault分析に失敗しました: ${r.error}`);
            return;
          }
          const topTags =
            r.result.topTags.slice(0, 5).map((t) => `${t.tag}(${t.count})`).join(', ') || 'なし';
          const suggestions = r.result.suggestions.slice(0, 3).join('\n- ') || 'AI提案はありません';
          window.alert(
            `孤立ノート: ${r.result.orphans.length} 件\nタグ上位: ${topTags}\n\n提案:\n- ${suggestions}`
          );
        },
      },
      {
        id: 'experiment-lineage',
        title: '実験系譜グラフを生成',
        subtitle: 'type: experiment のノートからMermaidレポートを作成',
        icon: '🧬',
        keywords: ['experiment', 'lineage', 'graph', 'reproducibility'],
        run: async () => {
          const r = await window.api.experiments.generateLineageReport(vaultPath!);
          if (r.ok && r.filePath) {
            setViewMode('outputs');
            bumpReload();
            openFileByPath(r.filePath);
          } else {
            window.alert(`実験系譜レポートの生成に失敗しました: ${r.error ?? '不明なエラー'}`);
          }
        },
      },
      {
        id: 'pdf-to-markdown',
        title: 'PDFをMarkdown化',
        subtitle: '選択したPDFをObsidian互換MarkdownとしてOutputsへ保存',
        icon: '📕',
        keywords: ['pdf', 'markdown', 'import', 'paper'],
        run: async () => {
          const ok = window.confirm('PDFをMarkdownへ変換します。API利用料が発生する場合があります。');
          if (!ok) return;
          const grant = await window.api.experiments.pickPDFFile();
          if (!grant) return;
          const r = await window.api.experiments.pdfToMarkdown(vaultPath!, grant.token);
          if (r.ok && r.filePath) {
            setViewMode('outputs');
            bumpReload();
            openFileByPath(r.filePath);
          } else {
            window.alert(`PDF→Markdownに失敗しました: ${r.error ?? '不明なエラー'}`);
          }
        },
      },
      {
        id: 'database-view',
        title: 'Database View',
        subtitle: activeSubject ? `${activeSubject} のfrontmatter表を表示` : '科目を選ぶと使えます',
        icon: '📊',
        keywords: ['database', 'bases', 'frontmatter', 'table'],
        run: () => {
          if (!activeSubject) {
            setViewMode('subject');
            window.alert('Database Viewを使うには、先に科目を選んでください。');
            return;
          }
          setViewMode('subject');
          setSubjectView(() => 'database');
        },
      },
      {
        id: 'canvas-view',
        title: 'Canvas Board',
        subtitle: activeSubject ? `${activeSubject} のノートをボード表示` : '科目を選ぶと使えます',
        icon: '🗂️',
        keywords: ['canvas', 'board', 'mindmap'],
        run: () => {
          if (!activeSubject) {
            setViewMode('subject');
            window.alert('Canvas Boardを使うには、先に科目を選んでください。');
            return;
          }
          setViewMode('subject');
          setSubjectView(() => 'board');
        },
      },
      {
        id: 'settings',
        title: '設定',
        subtitle: 'AIプロバイダー・Skills・テンプレート',
        icon: '⚙️',
        keywords: ['settings', 'skills', 'ai'],
        run: () => setShowSettings(true),
      },
    ];
    const pluginCommands: PaletteCommand[] = plugins.flatMap((plugin) =>
      plugin.commands.map((command) => ({
        id: `plugin:${plugin.id}:${command.id}`,
        title: command.title,
        subtitle: command.subtitle ?? `${plugin.name} plugin`,
        icon: command.icon ?? '🧩',
        keywords: ['plugin', plugin.name, plugin.id, command.id],
        railEligible: true,
        run: async () => {
          const result = await window.api.plugins.runCommand(vaultPath!, plugin.id, command.id);
          if (!result.ok) {
            window.alert(`Plugin command failed: ${result.error ?? 'unknown error'}`);
            return;
          }
          if (command.viewId) {
            openPluginView(plugin.id, command.viewId);
          } else {
            window.alert('このPluginコマンドはビューを持っていません。');
          }
        },
      }))
    );
    return [...builtInCommands, ...pluginCommands];
  }, [
    activeFile,
    activeSubject,
    handleNewNote,
    openFileByPath,
    openPluginView,
    plugins,
    setViewMode,
    setSubjectView,
    bumpReload,
    setShowFAQ,
    setShowWebClip,
    setShowCitation,
    setShowSettings,
    vaultPath,
    linkTargetsRef,
  ]);
}
