# Phase 4 改善計画 — 残課題 6 項目の実装

## Context

Phase 1-3 で「総合 B− → A−」を宣言したが、**実測再評価で B+ に修正**された。原因は次の 6 項目の未対応:

1. **新規追加コードの自己テスト不足** — Phase 1-3 で書いた hooks/IPC の半数が 0% カバレッジ
2. **CSS Module 物理移行** — ロードマップ document したが実装ゼロ (`styles.css` 7215 行のまま)
3. **IPC ファイル物理分割** — TOC コメントを入れただけ (papers/vault/wiki 合計 2355 行)
4. **警告ゼロの真の実現** — `--max-warnings 600` cap で 582 件を棚上げ
5. **バンドルサイズ削減** — `dist/assets` 7.6 MB、editor 636 KB / markdown 589 KB が重い
6. **プラグインサンドボックス** — `electron/ipc/plugins.ts` は無制限 IPC アクセス可

Phase 4 の目標: **自己評価と実態を一致させる**。完走後の正直な総合スコアを A− 〜 A に押し上げる。

---

## 実行順序 (依存性 + リスク順)

```
Week 1: P4-A (テスト) + P4-D (警告)     ← CI 健全化、低リスク
Week 2: P4-C (IPC 分割) + P4-E (バンドル) ← 構造改善、中リスク
Week 3: P4-B (CSS Module) + P4-F (Plugin) ← 大規模、高リスク
```

各週独立コミット可能。Week 1 完了で「自分が書いたコードを信頼できる」状態に到達。

---

## P4-A. 新規追加コードのテスト不足 (P0、2 日)

### 現状

`npm run test:coverage` の実測:

| ファイル | 行数 | カバレッジ | 追加するテスト数 |
|---|---|---|---|
| `electron/ipc/docai.ts` | 543 | **0%** | 18 件 |
| `src/hooks/useCommandPalette.ts` | 400 | **0%** | 8 件 |
| `src/hooks/useWorkspaceLoader.ts` | 135 | **0%** | 7 件 |
| `src/hooks/useDocAIStream.ts` | 139 | **0%** | 10 件 |
| `src/hooks/useDocAISummary.ts` | 52 | **0%** | 5 件 |
| `src/hooks/useDocAIMultiAnalyze.ts` | 38 | **0%** | 4 件 |
| `src/utils/focusTrap.ts` | 64 | **35%** | 6 件 |
| `src/hooks/useRailConfig.ts` | 262 | 84% | +6 件 (149-230 の rail definitions) |

合計: **+64 件のテスト追加** → カバレッジ 75% → **82%+** 目標。

### A-1. `electron/ipc/docai.ts` テスト (1 日)

**新規**: `tests/ipc/docai-handlers.test.ts`

参照テンプレート: `tests/ipc/agents-handlers.test.ts` (IPC ハンドラ全件モックパターン)

#### モック対象
```ts
vi.mock('../../electron/ai/provider', () => ({
  runPrompt: vi.fn(),
  setOfflineMode: vi.fn(),
  isOfflineMode: vi.fn(() => false),
}));
vi.mock('../../electron/ai/docai', () => ({
  documentQA: vi.fn(),
  smartSummary: vi.fn(),
  multiDocAnalysis: vi.fn(),
  contentGenerator: vi.fn(),
}));
vi.mock('../../electron/pdf-text', () => ({
  extractPdfTextFromBuffer: vi.fn(),
  imageOnlyPdfError: () => 'image-only error',
}));
vi.mock('../../electron/vault-index', () => ({
  getVaultIndex: vi.fn(),
  getVaultIndexStatus: vi.fn(),
}));
vi.mock('../../electron/telemetry', () => ({ track: vi.fn() }));
```

#### テストケース (18 件)
| ハンドラ | テスト |
|---|---|
| `docai:listVaultFiles` | 1. 成功時に sorted files / 2. index 未構築で `indexNotReady: true` / 3. validateVaultPath エラー |
| `docai:getChunks` | 4. .md 成功 / 5. file not found |
| `docai:summarize` | 6. 成功 + `track('docai_summary')` 呼出検証 / 7. AI off → error / 8. ファイル超過 → `50MB 上限` エラー |
| `docai:ask` | 9. 質問空 → 即 `docai:error` / 10. citations 先送り → docai:done / 11. AI off / 12. 別 session でも race なし (sessionRef 検証) |
| `docai:askMulti` | 13. 全ファイル読み込み + retrieved citations / 14. 一部ファイル失敗時の skipping |
| `docai:multiAnalyze` | 15. 成功 + telemetry / 16. empty filePaths → error |
| `docai:generate` | 17. 成功 + `track('docai_generate')` / 18. retrieved 空時の fallback chunks |

### A-2. DocAIPanel 配下 hooks テスト (0.5 日)

**新規**: `tests/hooks/useDocAIStream.test.tsx` (10 件)
- onChunk / onCitations / onDone / onError の購読 & unsubscribe
- `reset()` で全 state クリア
- `ask()` で sessionRef bump → 古い chunk が破棄される (`act()` で意図的に古い chunk を流す)
- ファイル切替時に自動 reset
- `clearError()` で error 個別クリア

**新規**: `tests/hooks/useDocAISummary.test.tsx` (5 件)
- `runSummary('keypoints')` → window.api.docai.summarize 呼出
- 成功時 `summary` set / 失敗時 `error` set / busy 中は無視
- `copySummary` で navigator.clipboard.writeText 呼出
- `reset()` で summary + error クリア

**新規**: `tests/hooks/useDocAIMultiAnalyze.test.tsx` (4 件)
- `runMultiAnalyze` → multiAnalyze 呼出
- 成功/失敗/busy 中の挙動
- reset

### A-3. `useCommandPalette` + `useWorkspaceLoader` テスト (0.5 日)

**新規**: `tests/hooks/useCommandPalette.test.tsx` (8 件)
- 全 22 コマンドが配列に含まれる
- `vaultPath=null` でも builtInCommands は返る
- `handleNewNote` 系のコマンド `.run()` で渡された callback 呼出
- 各 quick action の subtitle (activeSubject/activeFile に依存) が正しい
- plugin commands の追加 (mock plugin 1 件)
- `bumpReload` がトリガーされるコマンド

**新規**: `tests/hooks/useWorkspaceLoader.test.tsx` (7 件)
- vaultPath null で no-op
- vaultPath 変化で listSubjects + listFiles 呼出
- watcher 起動 / unmount で停止
- favorites の pinned: true 抽出
- plugins.list 呼出
- bumpReload → reloadKey 増加 → effects 再実行
- linkTargetsRef の更新

### A-4. `focusTrap` + `useRailConfig` 残り (0.5 日)

**拡張**: `tests/utils/focusTrap.test.tsx` (新規、6 件)
- Tab で順方向 first → 2 → 3 → last → first にループ
- Shift+Tab で逆方向 last → ... → first → last
- Escape で onEscape 呼出
- active=false で trap 無効
- containerRef.current=null で no-op
- focusable 要素 0 件の挙動

**拡張**: `tests/hooks/useRailConfig.test.tsx` (+6 件)
- `railViewDefinitions.subjects.active` が viewMode 別 (subject / daily / books-detail 等)
- `railViewItems` の onClick で setViewMode が呼ばれる
- 全 10 view definition の存在
- icon / label / tooltip が含まれる

### 検証

```bash
npm test                # +64 件、合計 2388+ 件
npm run test:coverage   # functions 71% → 78%+ / lines 77% → 82%+
```

新規追加コードのカバレッジを名目だけでなく**実体**として担保。

---

## P4-D. 警告ゼロの真の実現 (P0、1.5 日)

### 現状

| ルール | 件数 | 主な発生箇所 |
|---|---|---|
| `@typescript-eslint/no-explicit-any` | ~520 | `tests/views/Gallery*.tsx`, `tests/ipc/*.test.ts`, etc. |
| `react-hooks/exhaustive-deps` | ~30 | 各種コンポーネント |
| その他 (`no-empty`, `no-console`, ...) | ~32 | mixed |

### D-1. テストの `any` を集約 disable (0.5 日)

**戦略**: テストヘルパー / モック構築に `any` は実用上必要。**ファイル先頭 1 行**で disable 集約。

対象ファイル例 (件数の多い順):
- `tests/views/GalleryView.test.tsx` (~25 件)
- `tests/views/GalleryView.actions.test.tsx` (~22 件)
- `tests/views/CanvasView.test.tsx` (~20 件)
- `tests/components/BlockEditor.actions.test.tsx` (~18 件)
- `tests/ipc/papers-handlers.test.ts` (~15 件)
- ... 他 30+ ファイル

各ファイル冒頭に追加:
```ts
/* eslint-disable @typescript-eslint/no-explicit-any -- test fixtures use ad-hoc mocks; refactoring to strict types is tracked separately */
```

**期待効果**: warnings 582 → ~50

### D-2. `react-hooks/exhaustive-deps` を**正しく**修正 (0.5 日)

ケース別対応:
| パターン | 対応 |
|---|---|
| Stable callback (useCallback で deps 固定) | `// eslint-disable-next-line react-hooks/exhaustive-deps` を effect 直前に + 理由コメント |
| 本当に依存が抜けている | deps に追加 + ロジック調整 |
| Ref を使うべき | `useRef` 化して effect の依存から外す |

特に注意: Phase 2-B で **DocAIPanel.tsx の 144 行目に置いた誤った位置の disable コメント**を修正:

```tsx
// 現状 (誤り — eslint-disable の位置が間違っている)
useEffect(() => {
  summaryFlow.reset();
  analyzeFlow.reset();
  setExtraDocs([]);
}, [filePath]);
/* eslint-disable react-hooks/exhaustive-deps */ // ← この位置では effect には適用されない

// 正しい
useEffect(() => {
  summaryFlow.reset();
  analyzeFlow.reset();
  setExtraDocs([]);
  // reset functions are stable per useCallback; intentional file-scoped reset on file change
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [filePath]);
```

### D-3. `--max-warnings` を段階締め (0.5 日)

```jsonc
// package.json
"scripts": {
  "lint": "eslint . --max-warnings 50",     // 600 → 50
  "lint:strict": "eslint . --max-warnings 0"
}
```

ratchet 戦略: 各 PR で warnings が増えないことを保証 → 6 ヶ月で 0 に。

### D-4. 新規ファイルは 0 warnings 強制

`.lintstagedrc` を導入 (lint-staged):

```json
{
  "src/**/*.{ts,tsx}": "eslint --max-warnings 0",
  "electron/**/*.ts": "eslint --max-warnings 0"
}
```

新規・編集された source ファイルは pre-commit で 0 warnings を強制。tests/ は除外（既存負債分離）。

### 検証

```bash
npm run lint              # 0 errors / < 50 warnings (exit 0)
npm run lint:strict       # 0 errors / 0 warnings (理想、まだ通らない予定)
```

---

## P4-C. IPC ファイル物理分割 (P1、1.5 日)

### 戦略

**1 ファイルずつ、チャネル名 / Preload API を不変に保ったまま** ディレクトリ化。各ステップで `npm test` を通す。

### C-1. `papers.ts` (1012 行) → 6 ファイル分割 (1 日)

```
electron/ipc/papers.ts → DELETE
electron/ipc/papers/
  index.ts        # registerPapersHandlers() + 全ハンドラ集約
  io.ts           # papers:list, listForCitation, getReadingNote
  meta.ts         # papers:create, updateMeta, appendReadingNote, delete
  bibtex.ts       # papers:exportBibtex
  import.ts       # papers:importFromArxiv/DOI/PDF/Bibtex + pickPDFFile/pickBibtexFile
  utils.ts        # coerceMeta, readingPathFor, todayISO, inferBibtexType, escapeBibValue
```

#### 手順 (1 ファイル × 6 ステップ)
1. `mkdir electron/ipc/papers/` + utils.ts 作成 (純粋関数のみ)
2. io.ts 作成: 3 ハンドラを `createPapersIoHandlers()` で export
3. meta.ts 作成: 4 ハンドラを `createPapersMetaHandlers()` で export
4. bibtex.ts / import.ts 同様に作成
5. index.ts で全てを統合:
   ```ts
   export function registerPapersHandlers(): void {
     const handlers = {
       ...createPapersIoHandlers(),
       ...createPapersMetaHandlers(),
       ...createPapersBibtexHandlers(),
     };
     for (const [ch, h] of Object.entries(handlers)) ipcMain.handle(ch, h);
     registerPapersImportHandlers(); // import.ts は ipcMain.handle 直接呼出
   }
   ```
6. 旧 `electron/ipc/papers.ts` 削除 → `electron/main.ts` の import を `./ipc/papers` (フォルダ名) に変更 (自動で `index.ts` 解決)

#### 検証
```bash
npx tsc -p tsconfig.electron.json   # コンパイル OK
npm test                            # tests/ipc/papers-handlers.test.ts 全 pass
npm run security:ipc-surface        # ハンドラ 149 件維持
```

### C-2. `vault.ts` (718 行) → 4 ファイル分割 (0.5 日)

```
electron/ipc/vault/
  index.ts        # registerVaultHandlers()
  files.ts        # vault:listFiles, listFilesEnriched, listDailyNotes
  notes.ts        # vault:readNote(WithMtime), writeNote, renameNote, deleteNote, duplicateNote, createTodaysNote, createTypedNote
  subjects.ts     # vault:init, listSubjects, createSubject, deleteSubject, renameSubject, installSample
  graph.ts        # vault:graphData, readBoard, writeBoard
  templates.ts    # vault:listTemplates, readTemplate, writeTemplate, deleteTemplate
```

### C-3. `wiki.ts` (625 行) → 4 ファイル分割

```
electron/ipc/wiki/
  index.ts        # registerWikiHandlers()
  io.ts           # wiki:list, read, write, readIndex, saveOutput
  schema.ts       # wiki:getSchema, setSchema, collectRaw
  compile.ts      # wiki:compile (+ wiki:compile:progress events)
  health.ts       # wiki:healthCheck, importFromQALogs
```

### 約束 (全 C-1/2/3 共通)
- チャネル名 (`papers:list` 等) を**1 mm も変えない**
- preload.ts の `window.api.*` 形を変えない
- 既存テスト (`tests/ipc/*.test.ts`) を**変更しない**
- 各 PR は 1 ファイル分割のみ (revert 可能)

### 検証
```bash
npm test                          # 全件 pass
npm run test:e2e                  # 15/15 pass
npm run security:ipc-surface      # 149 channels 維持
wc -l electron/ipc/papers.ts      # No such file (削除済)
wc -l electron/ipc/papers/*.ts    # 各 < 250 行
```

---

## P4-E. バンドルサイズ削減 (P1、2 日)

### 現状実測

```
dist/assets/ 合計: 7.6 MB
  editor-tiptap-*.js     636 KB   ← 最大
  chunk-NNHCCRGN-*.js    594 KB   ← Mermaid 関連推定
  markdown-*.js          589 KB   ← react-markdown + rehype + remark
  cytoscape.esm-*.js     434 KB   ← グラフライブラリ
  pdf-*.js               421 KB   ← pdfjs-dist
  index-*.js             194 KB   ← メインエントリ
```

### E-1. Bundle Treemap で実態把握 (0.5 日)

```bash
npm i -D rollup-plugin-visualizer
```

`vite.config.ts` に追加:
```ts
import { visualizer } from 'rollup-plugin-visualizer';
// ...
plugins: [
  react(),
  visualizer({ filename: 'dist/stats.html', open: false, gzipSize: true }),
]
```

```bash
npm run build
# dist/stats.html を開いて treemap を確認
```

**確認ポイント**:
- TipTap が初回起動時の `index-*.js` にバンドルされていないか
- Mermaid が `MarkdownRenderer` の lazy import (`loadMermaid`) で確実に分離されているか
- Cytoscape は GraphView の lazy import に閉じているか

### E-2. 重チャンクの分離検証 (1 日)

#### TipTap (636 KB) — NoteViewer 入り口に遅延
NoteViewer 経由でのみロードされるはずだが、`index.ts` に紛れていないか確認:

```bash
# 期待: index-*.js には TipTap 文字列が含まれない
grep -l "TipTap\|@tiptap" dist/assets/index-*.js && echo "❌ early loaded" || echo "✅ lazy"
```

紛れていたら `NoteViewer.tsx` 内で `lazy()` を改めて適用 (現状 Editor 部分が同期 import の可能性)。

#### Markdown (589 KB) — MarkdownRenderer 遅延化
`react-markdown` + `remark-*` + `rehype-*` で 589 KB は妥当だが、Markdown 自体は**全ノートで使う**ので分離は限定的。

最適化案:
- `rehype-highlight` の言語をフィルタ (デフォルトで 200+ 言語) → 主要 20 言語のみ
- `katex` を初回数式描画時に dynamic import

#### Mermaid — `loadMermaid()` の lazy 動作確認
既存実装 (`src/components/MarkdownRenderer.tsx` の `loadMermaid` 関数) が動いているか:
```ts
// MarkdownRenderer.tsx (既存)
let mermaidPromise: Promise<MermaidApi> | null = null;
function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(...);
  }
  return mermaidPromise;
}
```

E2E で「Markdown 描画前」と「```mermaid 描画後」で `chunk-NNHCCRGN` が読まれるタイミングを確認。

### E-3. 不要依存の削除 (0.5 日)

`package.json` を精査:
- `@axe-core/react` (devDeps) — 実行時に使っていないので OK
- `axe-core` — testing 用、本番 bundle には入らないはず → 確認
- `mermaid` 11.15.0 → 11.x 系の minor downgrade で軽量化可能か検証

### 目標

| メトリック | Before | After | 改善率 |
|---|---|---|---|
| `dist/assets` 合計 | 7.6 MB | **4.5 MB** | −41% |
| `index-*.js` (初回ロード) | 194 KB | **< 200 KB** | 維持 |
| 初回起動時のロード | 編集なし状態で評価 | 起動直後に Network = `< 400 KB` | 計測 |

### 検証

```bash
npm run build
ls -la dist/assets/*.js | sort -k5 -n -r | head -10
open dist/stats.html
node scripts/perf-smoke.mjs  # 起動時間 (現状未計測) を追加
```

---

## P4-B. CSS Module 物理移行 (P2、3 日)

### 戦略

CSS Module 移行のブロッカーは「E2E が `.palette-input` 等の global class 名に依存」。先に **selectors 切替** → その後 **CSS Module 化** の 2 段階。

### B-1. data-testid 追加 + selectors.ts 切替 (1 日)

#### 対象コンポーネント (E2E でターゲットされているクラス)
| 現在の selector | 新 data-testid |
|---|---|
| `.discord-titlebar` | `[data-testid="title-bar"]` |
| `.discord-titlebar-name` | `[data-testid="title-bar-name"]` |
| `.icon-rail` | `[data-testid="rail"]` |
| `.palette-input` | `[data-testid="palette-input"]` |
| `.palette-item` | `[data-testid="palette-item"]` |
| `.sidebar-item` | `[data-testid="subject-item"]` |
| `.file-item` | `[data-testid="file-item"]` |
| `.viewer` | `[data-testid="viewer"]` |
| `.faq-panel` | `[data-testid="faq-panel"]` |
| ... etc | ... |

**手順**:
1. 各コンポーネントに `data-testid` を追加 (既存 className は残す)
2. `e2e/helpers/selectors.ts` を全部 `[data-testid="..."]` に書き換え
3. `npm run test:e2e` で 15/15 pass を確認
4. `tests/components/*.test.tsx` で `document.querySelector('.x')` を使っている箇所も更新 (rare)

### B-2. コンポーネント単位で CSS Module 化 (2 日)

優先順 (小 → 大):
1. `CommandPalette` (~80 行) — 単純、test カバー良好
2. `Sidebar` (~100 行)
3. `Settings` (~150 行)
4. `IconRail` (~250 行) — 最大ブロック
5. `DocAIPanel` 周辺 5 ファイル (~600 行)

#### 移行パターン (各コンポーネント共通)
```tsx
// 1. .module.css ファイル作成
// src/components/CommandPalette.module.css
.overlay { /* was .palette-overlay */ }
.input { /* was .palette-input */ }
.item { /* was .palette-item */ }
.itemSelected { /* was .palette-item.selected */ }

// 2. コンポーネントで import + 適用
import styles from './CommandPalette.module.css';

<div className={styles.overlay}>
  <input className={styles.input} ... />
  <div className={`${styles.item} ${selected ? styles.itemSelected : ''}`} ... />
</div>

// 3. styles.css から該当ブロックを削除
// 4. npm run dev で目視確認
// 5. npm run test:e2e で回帰なし確認
```

#### 注意点
- グローバル変数 (`var(--text-primary)` 等) は CSS Module 内でも使える (継承)
- `:global(.dark) .x { ... }` で body.dark 対応
- 既存テスト (`tests/components/*.test.tsx`) で `document.querySelector('.x')` を使っている場合は要更新

### 目標

| メトリック | Before | After |
|---|---|---|
| `src/styles.css` 行数 | 7215 | **< 3500** |
| CSS Module ファイル数 | 1 (ErrorBoundary) | **9** |
| E2E 全件 | 15 pass | 15 pass (維持) |

### 検証

```bash
npm run dev                # 全画面の目視確認 (1 時間)
npm test                   # 全件 pass
npm run test:e2e           # 15/15 pass
wc -l src/styles.css       # < 3500
ls src/components/**/*.module.css | wc -l  # >= 9
```

---

## P4-F. プラグインサンドボックス (P3、3-5 日)

### 現状の脆弱性

`electron/ipc/plugins.ts`:
- プラグインはどんな IPC でも呼べる (`window.api.*` 全部)
- ファイルシステム全体に R/W 可能
- `eval` / `Function()` 生成も可能

**実害シナリオ**: 悪意あるプラグインが `window.api.settings.set({ telemetryEnabled: true })` で勝手にテレメトリ ON、`window.api.vault.readNote(任意path)` でノート読出、外部 fetch で持ち出し。

### 戦略選定

| 案 | リスク | 工数 | 推奨度 |
|---|---|---|---|
| **isolated-vm** | Native binding、Electron バージョン互換性懸念 | 5 日 | △ |
| **Worker thread** | postMessage IPC、関数渡し不可 | 4 日 | ○ |
| **manifest-based capability** | 既存 IPC 上の allowlist で十分機能 | 3 日 | ◎ |

**Phase 4-F は capability model を採用**。VM は Phase 5+ で評価。

### F-1. プラグイン manifest スキーマ拡張 (0.5 日)

**変更**: `electron/ipc/plugins.ts` の `PluginManifest` 型に `permissions` 追加:

```ts
// 現状
type PluginManifest = {
  id: string;
  name: string;
  commands: PluginCommand[];
};

// 拡張
type PluginManifest = {
  id: string;
  name: string;
  commands: PluginCommand[];
  /** Required IPC permissions. Plugin can ONLY invoke listed channels.
   * Unscoped wildcards forbidden — must be exact channel names or
   * `domain:*` prefix patterns. */
  permissions?: PluginPermission[];
};

type PluginPermission =
  | { channel: string }                              // exact: "vault:listFiles"
  | { channelPrefix: string; reason: string };       // prefix: "vault:*"
```

各プラグインの `manifest.json` で:
```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "permissions": [
    { "channel": "vault:listSubjects" },
    { "channelPrefix": "vault:read", "reason": "Need to read note bodies for analysis" }
  ],
  "commands": [...]
}
```

### F-2. Permission gate IPC ハンドラ (1 日)

**新規**: `electron/ipc/plugin-runtime.ts`

```ts
import { ipcMain } from 'electron';
import { logger } from '../logger';

const ALLOWED_PERMISSIONS_BY_PLUGIN = new Map<string, Set<string>>();
const FORBIDDEN_CHANNELS = new Set([
  'settings:set',
  'settings:setApiKey',
  'settings:setProviderApiKey',
  'vault:installSample',
  'plugins:*',
]);

export function loadPluginPermissions(pluginId: string, perms: PluginPermission[]): void {
  const allowed = new Set<string>();
  for (const p of perms) {
    if ('channel' in p) {
      if (FORBIDDEN_CHANNELS.has(p.channel)) {
        logger.warn(`[plugin] ${pluginId} requested forbidden ${p.channel}`);
        continue;
      }
      allowed.add(p.channel);
    } else if ('channelPrefix' in p) {
      allowed.add(`PREFIX:${p.channelPrefix}`);
    }
  }
  ALLOWED_PERMISSIONS_BY_PLUGIN.set(pluginId, allowed);
}

export function isChannelAllowedForPlugin(pluginId: string, channel: string): boolean {
  const allowed = ALLOWED_PERMISSIONS_BY_PLUGIN.get(pluginId);
  if (!allowed) return false;
  if (allowed.has(channel)) return true;
  for (const a of allowed) {
    if (a.startsWith('PREFIX:') && channel.startsWith(a.slice(7))) return true;
  }
  return false;
}

// プラグインから呼ばれる proxy ハンドラ
ipcMain.handle('plugin:proxyIpc', async (_e, pluginId: string, channel: string, ...args: unknown[]) => {
  if (!isChannelAllowedForPlugin(pluginId, channel)) {
    return { ok: false, error: `Permission denied: plugin ${pluginId} cannot call ${channel}` };
  }
  // 元の IPC ハンドラに forward。直接呼ばずに ipcMain.emit を使うと再帰になるため、
  // ハンドラを取得して直接 invoke する仕組みが必要 (詳細: 設計レビューで決定)
});
```

### F-3. Plugin SDK の更新 (1 日)

プラグイン側 (vault 内 `.classnotes/plugins/<id>/index.js`) の API を全面切替:

```js
// Before (無制限)
const subjects = await window.api.vault.listSubjects(vaultPath);

// After (capability-gated)
const subjects = await window.classnotes.invoke('vault:listSubjects', vaultPath);
```

`electron/preload.ts` に `window.classnotes.invoke()` 追加 (プラグイン専用 namespace)。manifest で permission を持つチャネルのみ通る。

### F-4. 既存プラグインのマイグレーション + ドキュメント (1 日)

- `docs/PLUGIN-SDK.md` 新規追加 — permissions の書き方
- サンプルプラグイン (`docs/example-plugin/`) を提供
- 既存プラグインが壊れる場合のアナウンス文書

### F-5. テスト

**新規**: `tests/ipc/plugin-runtime.test.ts`
- exact channel allow / deny
- prefix channel allow / deny
- forbidden channel reject (settings:set 等)
- 未知の plugin の reject
- proxyIpc が無権限で error 返却

### 検証

```bash
npm test
npm run start  # 既存プラグインが動くか手動確認
# 悪意あるプラグインのシミュレーション (settings:setApiKey を試みる)
# → "Permission denied" がログに出ることを確認
```

---

## ファイル変更サマリ (Phase 4 合算)

### 新規ファイル (約 25)

| カテゴリ | 件数 | 例 |
|---|---|---|
| 単体テスト | 9 | `useDocAIStream`, `useCommandPalette`, `focusTrap`, `docai-handlers`, etc. |
| IPC 分割 | 14 | `papers/{io,meta,bibtex,import,utils,index}.ts`, `vault/{*}.ts`, `wiki/{*}.ts` |
| CSS Modules | 9 | `IconRail.module.css`, `CommandPalette.module.css`, etc. |
| Plugin sandbox | 3 | `electron/ipc/plugin-runtime.ts`, `docs/PLUGIN-SDK.md`, `docs/example-plugin/` |
| Config | 2 | `.lintstagedrc`, `vite.config.ts` 更新 (visualizer) |

### 変更ファイル (約 15)

- `electron/ipc/papers.ts` (削除 → folder), `vault.ts`, `wiki.ts` 同様
- `electron/preload.ts` (plugin namespace 追加)
- `electron/ipc/plugins.ts` (permission チェック追加)
- `src/components/{IconRail, Sidebar, CommandPalette, Settings, DocAIPanel*}.tsx` (CSS Module import)
- `e2e/helpers/selectors.ts` (data-testid 化)
- `src/styles.css` (7215 → 3500 行)
- `package.json` (`lint` script, devDeps `rollup-plugin-visualizer`, `lint-staged`)
- `DocAIPanel.tsx` (eslint-disable コメント修正)
- 30+ テストファイル先頭に `eslint-disable` 集約

### 削除/縮減

| 指標 | Before | After |
|---|---|---|
| `src/styles.css` | 7215 行 | **< 3500 行** |
| `electron/ipc/papers.ts` | 1012 行 | 削除 (6 ファイルに分散、各 < 250 行) |
| `electron/ipc/vault.ts` | 718 行 | 削除 (5 ファイル) |
| `electron/ipc/wiki.ts` | 625 行 | 削除 (4 ファイル) |
| `dist/assets/` 合計 | 7.6 MB | **< 4.5 MB** |
| lint warnings | 582 | **< 50** |
| 新規追加コードの coverage | 平均 ~30% | **平均 75%+** |

---

## リスクと緩和策

| リスク | 緩和 |
|---|---|
| IPC 分割で既存テスト破壊 | チャネル名不変 + テストを変更しない契約 (P4-C 約束) |
| CSS Module 移行で視覚差異 | data-testid 切替を先に完了 → CSS は最小単位 (1 component) ずつ |
| プラグイン後方互換性破壊 | F-4 で既存プラグインのマイグレーションガイド + 1 リリース猶予 |
| バンドル削減で機能リグレッション | E-2 で `npm run dev` で各画面手動確認 + E2E 全件 pass |
| 警告ゼロ化で実装側の disable 乱発 | tests/ と src/ の disable 戦略を分離 (テスト集約 vs ソースは個別 justify) |
| Phase 4 全体で 11 日 → スプリント 1 つ超過 | 各 P4-x が独立 PR → 並行作業 or 部分先行リリース可 |

---

## 工数見積り

| Phase | 内容 | 工数 |
|---|---|---|
| P4-A | 新規追加コードのテスト | **2 日** |
| P4-D | 警告ゼロ化 | **1.5 日** |
| P4-C | IPC 物理分割 (papers/vault/wiki) | **1.5 日** |
| P4-E | バンドル削減 | **2 日** |
| P4-B | CSS Module 物理移行 | **3 日** |
| P4-F | プラグインサンドボックス | **3-5 日** |
| **合計** | | **13-15 日** |

短縮可能: P4-F (プラグイン) は単独で外せる → 10-11 日。

---

## 最終 Quality Gate (Phase 4 完了後)

```bash
# 静的解析
npm run lint                # 0 errors / < 50 warnings (Phase 4-D 後は段階的に締める)
npm run lint:strict         # 0 errors / 0 warnings (理想、最終目標)
npx tsc -b --pretty false
npx tsc -p tsconfig.electron.json --pretty false

# テスト
npm test                    # 2400+ 件 pass
npm run test:coverage       # functions/branches/lines/statements 全て 80%+
npm run test:e2e            # 15+ 件 pass (a11y 含む)

# パフォーマンス
node scripts/perf-smoke.mjs
ls -la dist/assets/*.js | awk '{s+=$5} END {print "Total:", s/1024/1024, "MB"}'  # < 5 MB

# セキュリティ
npm run security:evidence
npm audit --production      # CVE チェック

# 配布
npm run build && npm run dist:win
npm run test:release-smoke

# 構造検証
wc -l src/styles.css                       # < 3500
wc -l src/App.tsx                          # < 600
ls electron/ipc/papers/*.ts | wc -l        # >= 6
ls src/components/**/*.module.css | wc -l  # >= 9
```

成功基準: 全コマンド exit 0 + 各メトリック目標達成 + `docs/PERF.md` に新行追加 + 自己評価と実態が一致する状態。

---

## 達成後の目標スコア (Phase 4 完了)

| 観点 | Phase 3 後 (実態) | Phase 4 後 (目標) |
|---|---|---|
| アーキテクチャ | B+ | **A** |
| コード品質 | B | **A−** |
| テスト | B | **A** |
| セキュリティ | B+ | **A** |
| パフォーマンス | B | **A−** |
| アクセシビリティ | C+ | **A−** (Phase 4 範囲外だが P4-A で focusTrap テストにより部分改善) |
| UX | B+ | **A−** |
| ドキュメント | B+ | **A−** |
| **総合** | **B+** | **A** |

**Phase 4 の本質**: Phase 1-3 で広げた風呂敷を**実装の中身として完成**させる。「自己評価と実態の一致」を達成。
