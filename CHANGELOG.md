# Changelog

All notable changes to ClassNotes are documented in this file.

## [Unreleased] — Phase 3 高度な研究者向け機能

### Added (PDF / 実験 / LaTeX / Canvas を統合した差別化レイヤー)

- **TipTap 直接引用挿入** — `Ctrl+Shift+@` で開く CitationPicker が active editor のカーソル位置に直接 `[@bibkey]` を挿入。Phase 2 の clipboard fallback は active editor が無い時だけ動く
  - `src/state/activeEditor.ts`: 単一スロットのグローバル inserter registry
  - `BlockEditor.tsx`: focus/blur で TipTap chain を register / unregister
- **PDF → Markdown AI 取込** (`papers:importFromPDF`)
  - Anthropic API の document content block で PDF (≤30 MB) を Claude vision に直接渡す
  - 構造化抽出: title / authors / year / venue / DOI / arXiv ID / abstract / 主要貢献 / 手法 / 限界
  - PDF を `<vault>/.attachments/papers/` にコピー、ノートから参照
  - `papers:pickPDFFile` で OS ファイルダイアログ統合
  - PaperImportDialog にタブ切替 (arXiv/DOI ↔ ローカル PDF)
- **AI Provider 文書サポート** (`runPrompt({ documents: [...] })`)
  - `anthropic-api` のみ対応、CLI モードは明示的にエラー
  - base64 + media_type 構造化ブロックで送信、システムプロンプト併用可
- **実験ログ専用エディタ** (`type: experiment` 自動ルーティング)
  - 構造化フィールド: dataset / model / seed / git_sha / hardware / hyperparams / status / startedAt / finishedAt / metrics
  - hyperparams は動的キーバリュー、数値自動コーセラ
  - status: planning / running / success / failed の 4 状態
  - `experiment` ObjectType + テンプレート追加 → TypeSelector から作成可能
- **再現性パッケージ生成** — 実験ノート 1 つから 3 ファイルを Outputs/ に書出:
  - `experiment.json` (frontmatter ダンプ)
  - `requirements.txt` (テンプレート)
  - `Makefile` (setup / run / report ターゲット)
- **LaTeX / Pandoc エクスポート** (`latex:exportNote`, `latex:detectPandoc`)
  - 学会別テンプレート 4 種: NeurIPS / ACL / IEEE / generic
  - Pandoc 検出 → 真の Markdown→TeX 変換、未検出 → 内蔵フォールバック (見出し・リスト・bold/italic/code/link/citation)
  - `Outputs/<date>_<title>_<style>/` に main.tex + refs.bib + README.md を書出
  - Pandoc 引用 (`[@bibkey]`) → `\cite{bibkey}` 自動変換
  - ユーザーカスタムテンプレート: `<vault>/_templates/latex/<style>.tex` を `%%TITLE%%` `%%AUTHORS%%` `%%DATE%%` `%%CONTENT%%` プレースホルダで配置可能
  - FileList 右クリック → 「📐 LaTeX (NeurIPS) で書出」
- **Canvas AI 生成 UI 統合** — CanvasView 内の「🤖 AI で生成」ボタンで科目概要から ReactFlow ノードを直接生成
  - level ベースのレイアウト (root 中心 / 1 階層下 / 2 階層下) で X×Y 配置
  - 既存の `addMemo` / `addGroup` と同じ memo node に変換、edge も AI 出力をそのまま反映

### Changed
- `objectTypes.ts`: `experiment` ObjectType + テンプレート追加 (8 種類 → 9 種類)
- Viewer.tsx: type=experiment 自動検出して ExperimentEditor にルーティング
- ai/provider.ts: `documents` パラメータ追加、structured content block 構築

### Tests (131 → 148 件、+17)
- `tests/ipc/latex.test.ts` 11 件 — 内蔵 Markdown→TeX フォールバック
- `tests/state/activeEditor.test.ts` 6 件 — inserter registry セマンティクス

## [Pre-Phase 3] — Phase 2 差別化機能

### Added (論文執筆ライフサイクル支援)

- **arXiv / DOI 自動取込** (`papers:importFromArxiv`, `papers:importFromDOI`)
  - arXiv API から Atom XML を取得し、メタデータ (title / authors / year / category / summary) を抽出
  - Crossref REST API から JSON を取得し、abstract (JATS タグ除去) + container-title + DOI を抽出
  - bibkey 自動生成 (`<firstAuthor><year><firstWord>` 形式、Pandoc 互換)
  - **AI 要約とのチェーン**: 取込後に `summarizeAndApply` を自動実行 (オプトイン) → 3 パス読法要約まで一気通貫
  - PaperImportDialog: arXiv ID / DOI を 1 つの入力欄で自動判別
- **BibTeX 出力** (`papers:exportBibtex`)
  - 全 Papers の frontmatter を `<vault>/Papers/refs.bib` に集約
  - Pandoc / LaTeX で直接 `\bibliography{refs}` できる形式
  - 学会名から `@inproceedings` / `@article` / `@misc` を自動推定 (NeurIPS/ICLR/ACL/Nature 等のヒューリスティクス)
  - Pandoc-style キーマッピング: doi / archivePrefix:arXiv / eprint / url
  - 特殊文字エスケープ ({ } \\) で TeX レンダリング崩れを防止
- **引用挿入 UI** — `Ctrl+Shift+@` で `[@bibkey]` 形式の Pandoc 引用を挿入
  - `papers:listForCitation` で軽量リストを取得 (bibkey 付きのみ)
  - 検索・矢印キー選択・Enter 確定の Anytype 風 picker
  - 結果はクリップボードにコピー (v1。v2 で TipTap 直接挿入予定)
- **研究進捗ダッシュボード v1** (`Ctrl+9`、IconRail に 📈 追加)
  - **投稿期限カウントダウン**: NeurIPS / ICLR / ACL のシード + ユーザー追加可能、urgent (≤14日) / past の色分け
  - **論文ステータス Gantt**: to-read / reading / read / cited / skimmed の swim lane
  - **アクティビティヒートマップ**: 90 日間のノート作成・更新頻度 (GitHub 風、対数階調)
  - **Wiki ヘルススコア (簡易)**: 孤立ノート数 + ユニークタグ数 + 論文数
- **Canvas AI 生成 UI** — FileList 右クリックに「🎨 AI で Canvas 生成」追加
  - `ai:generateCanvas` の結果を SVG プレビューでレンダリング (level ベースの 3 階層レイアウト)
  - JSON コピーで他ツールに移植可能
  - 完全な編集 UI は Phase 3 (React Flow 統合)

### Changed
- IconRail に 📈 進捗 (Ctrl+9) を追加 (8 アイコン → 9 アイコン)
- Sidebar / appReducer / App ViewMode 型に `progress` を追加

### Tests (120 → 131 件、+11)
- `tests/ipc/bibtex.test.ts` 11 件 — escape / type 推定 / bibkey 生成

## [Pre-Phase 2] — Phase 1 統合実装

### Added (大学院生・研究者向け中核機能)

- **論文・文献管理セクション** (📑 Ctrl+8)
  - Papers IPC (`papers:list/create/updateMeta/delete/getReadingNote/appendReadingNote`)
  - 著者・年・venue・bibkey・DOI・arXiv ID をリッチに保持
  - 5 段階ステータス (to-read / reading / read / cited / skimmed)
  - PapersView: ソート可能テーブル + フィルタバー (検索・ステータス・タグ・年範囲)
  - 専用作成ダイアログ (タイトル/著者/年/venue/DOI/arXiv ID/bibkey/ステータス)
  - 右クリックメニュー (開く / フォルダ / 引用キーコピー / AI 要約 / AI タグ / 削除)
- **AI エージェント (横断的)** — 授業ノート・論文・任意のノートで共通動作
  - `summarize` 3 パス読法要約 (oneLiner / overview / contributions / openQuestions)
  - `summarizeAndApply` 結果をノート frontmatter + 本文先頭に挿入 (重複防止マーカー付)
  - `autoTag` frontmatter タグ提案 + 適用
  - `optimizeMarkdown` Obsidian Skill #1 (callout / wikilink / frontmatter 整形)
  - `generateCanvas` Obsidian Skill #4 (テキスト → マインドマップ JSON)
  - `analyzeVault` Obsidian Skill #5 (孤立ノート + タグ頻度 + AI 改善提案)
  - 全 IPC 経由で renderer から呼出可能、provider 抽象 (CLI/API) を継承
- **Defuddle Web Clipper** (Obsidian Skill #2) — `Ctrl+Shift+L` で URL 入力 → 広告除去 → クリーン Markdown を `<vault>/Web/` に保存。トークン 5-15 倍節約
- **DatabaseView** (Obsidian Skill #3 / Bases 互換) — フォルダ単位のダッシュボード、frontmatter 自動列検出、フィルタ・ソート・列選択
- **Obsidian CLI bridge** (Obsidian Skill #5) — `obsidian-skills` / `obsidian` バイナリの自動検出、CLI 経由の Vault 分析、内蔵 AI agent へのフォールバック
- **Settings → Skills 連携パネル** — CLI 検出状態、再検出ボタン、インストール手順 (npm install -g @obsidian/skills-cli + obsidian-skills init + npm install defuddle + Obsidian CLI モード On 再起動)、5 スキルの説明
- **FileList 右クリックに AI アクション 3 種追加** — 要約 / タグ付け / Markdown 整形

### Changed
- IconRail に 📑 Papers アイコンを追加 (Ctrl+8)
- App ナビゲーション: papers ファイルパスは PapersView に自動ルーティング
- Sidebar viewMode 型に `papers` を追加

### Tests (105 → 120 件、+15)
- `tests/ai/agents.test.ts` 7 件 — JSON 抽出ロジック
- `tests/ipc/papers.test.ts` 8 件 — PaperFrontmatter スキーマ + safeName

## [Pre-Phase 1] — Beta-Ready B+

### Pivot
- **対象ユーザーを大学院生・研究者に固定**。学部生・初学者・13 歳未満は対象外と明記。
  Anthropic API キーまたは Claude Code Pro/Max を保有するユーザーが前提。

### Added
- **ノート削除 (ゴミ箱方式)**: 右クリック → 「削除」で `<vault>/.trash/<rel>_<ts>.md` に移動。
  確認ダイアログ付き、後から手動で復元可能。
- **ノート複製**: 右クリック → 「複製」で `(copy)` / `(copy 2)` / … サフィックス付きコピー作成。
- **右クリックコンテキストメニュー全面導入**:
  - FileList: 開く / Obsidian で開く / フォルダで表示 / パスをコピー / 名前を変更 / 複製 / 削除
  - Sidebar Subjects: 名前を変更 / フォルダで表示 / 削除（ゴミ箱へ）
  - Sidebar Favorites: 開く / フォルダで表示 / パスをコピー / Pin 解除
  - Sidebar Recents: 開く / フォルダで表示 / パスをコピー / 履歴から外す
- **AI Provider テストボタン**: Settings に「機能をテスト」追加。30 秒の短いプロンプトで API キー / モデル / CLI ログイン状態を即座に検証。
- **Wiki 手動編集保護**: Wiki ページを再コンパイルする前に mtime ベースで手動編集を検出し、上書き前に確認ダイアログを表示。`.classnotes-compile.json` sidecar で前回コンパイル時刻を追跡。
- **Settings プライバシーセクション**: 匿名利用統計とクラッシュレポートのオプトインチェックボックスを追加。
- **electron-updater 統合**: `Settings → アップデートを確認` ボタン、起動 5 秒後の自動チェック、ダウンロード後の「再起動して適用」フロー。**コード署名済み installer 配布時のみ動作**。
- **サンプル Vault を研究者向けに刷新**: 旧「数学・歴史・読書」→ 新「論文ノート・研究計画・統計手法」(6 ノート + 3 _概要.md)。Transformer 論文ノート / 論文の 3 パス読法 / 実験ログテンプレート / ベイズ vs 頻度論 / p-hacking と再現性 等。

### Changed
- **App.tsx ナビゲーション状態を useReducer に統合**: 5 つの useState (viewMode / activeSubject / activeFile / virtualFile / subjectView) を `useAppNav` フックに集約。`src/state/appReducer.ts` の dead-code 状態を解消。
- **Anthropic モデル ID を alias 形式に変更**: 未検証の日付サフィックス付き ID (`claude-sonnet-4-5-20250929` 等) を alias (`claude-sonnet-4-5`) に置換。`electron/ai/provider.ts` の `ANTHROPIC_MODELS` を単一情報源に。
- **Sidebar の subject 用 inline 右クリックメニューを `ContextMenu` コンポーネントに統一**。

### Tests
- IPC ハンドラ統合テスト追加: `deleteNote`, `path-traversal`, `sanitize`, `safeName`, `atomicWrite` (合計 27 件)
- 累計テスト数: **105 件** (前回 99 → +6)

## [Pre-Beta] — Phase II

### Added
- **AI Provider 抽象化**: Claude CLI / Anthropic API / なし の 3 択。Settings UI から切替可能。API キーは OS キーチェーンで暗号化保存。
- **初回起動ウィザード** (5 ステップ): Vault 選択 → AI 設定 → サンプル投入。
- **サンプル Vault**: 「数学 / 歴史 / 読書」3 サブジェクトの初期コンテンツ。
- **Wiki コンパイルストリーミング進捗**: `collecting → prompting → streaming → writing → done` の 5 段階で UI に表示。
- **同時編集衝突検出**: `vault:writeNote` に `expectedMtime` 引数。Obsidian との同時保存で lost-update を防止。
- **`app-file://` プロトコルの vault スコープ検証**: vault 外のファイルは 403 で拒否。
- **CSP ヘッダー**: `default-src 'self'`、`connect-src` を `api.anthropic.com` に限定。
- **構造化ログ (electron-log)**: `userData/logs/main.log` に出力、5 MB ローテート。
- **renderer→main ログ転送**: ErrorBoundary や React 例外も main プロセスログに記録。
- **Dialog コンポーネント**: WCAG 2.1 AA 対応。`role="dialog"` + `aria-modal` + フォーカストラップ。
- **i18n 基盤**: `src/i18n/strings.ts` で日英の最小翻訳テーブル。
- **electron-forge 配布パイプライン**: Windows Squirrel / macOS DMG / Linux deb の maker 設定。
- **クロスプラットフォーム path ユーティリティ**: `joinPath`, `basename`, `isUnderVaultDir`, `toAppFileUrl`。
- **コンポーネントテスト**: testing-library/react + jsdom 導入。**66 件のテスト**（unit + component）。

### Changed
- **バンドル分割**: 初回 bundle を 2,363 KB → 200 KB（12× 削減）。markdown / tiptap / pdf / flow / motion を別 chunk に。
- **ErrorBoundary**: 「詳細をコピー」「ログを開く」「再試行」アクション追加、main にログ転送。
- **window.prompt/alert 撲滅**: QAChat の Wiki 保存ダイアログを `useDialog` に置換。
- **macOS パス互換**: `${vaultPath}\\${subject}` 等のハードコードを `joinPath` に統一。

### Security
- API キーをログに出さない監査（`/api[_-]?key|token|password|secret/i` を main 側でフィルタ）。
- `process.on('uncaughtException')` / `unhandledRejection` で main プロセスのクラッシュを必ず記録。

## [0.1.0] - 2025-04-XX (M0)

### Added (Stage 0〜11 + Phase 0〜5)
- 科目別 Vault / 授業ノート / 教材管理
- Books（読書メモ + reading note + ステータス管理）
- Memos（軽量メモ）
- Daily Notes
- Q&A チャット (Claude CLI 連携、ストリーミング)
- Wiki コンパイル / ヘルスチェック (Karpathy 式 Second Brain)
- Outputs (生成成果物の蓄積)
- グラフビュー / ギャラリービュー / Canvas (React Flow)
- TipTap ベースのリッチエディタ
- 全文検索 / バックリンク / Wikilink
- テンプレート機能
- ライト / ダークテーマ
