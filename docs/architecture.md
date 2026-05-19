# ClassNotes アーキテクチャ

## 対象ユーザー

ClassNotes は **OpenAI / Gemini / Anthropic の API キー、または公式 CLI/OAuth
ログインを利用できる大学院生・研究者** をターゲットとします。

このターゲット定義は、後続の機能優先度判断（API コスト可視化、論文 PDF 取込み、
LaTeX 数式レンダリング、reference manager 連携等）の基盤になります。
学部生・初学者・13 歳未満は対象外であり、それらユーザー向けの機能（手取り
足取りのチュートリアル、AI なしモードの最適化等）は意図的に優先度を下げます。

## 全体構成

```
┌─────────────────────────────────────────────────────┐
│                   Renderer (React 18)                │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐   │
│  │  IconRail  │  │  FileList  │  │   Viewer     │   │
│  └────────────┘  └────────────┘  └──────────────┘   │
│              ↕  window.api (preload)                 │
└─────────────────────────────────────────────────────┘
                         ↕ IPC
┌─────────────────────────────────────────────────────┐
│                   Main (Electron)                    │
│  ┌──────────────────────────────────────────────┐   │
│  │ ipc/vault │ ipc/wiki │ ipc/qa │ ai/provider │   │
│  └──────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────┐   │
│  │     logger (electron-log) │ chokidar watcher │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                         ↕
                 ファイルシステム (Vault)
                  + OpenAI / Gemini / Anthropic API (任意)
                  + Codex / gcloud ADC / Claude CLI (任意)
```

## 主要モジュール

### Renderer (`src/`)

| 場所 | 責務 |
|---|---|
| `App.tsx` | ルーティング・状態管理（ViewMode、activeFile 等） |
| `components/` | UI プリミティブ（Sidebar / FileList / Viewer / Dialog 等） |
| `components/onboarding/` | 初回起動ウィザード |
| `components/common/` | Dialog などの共通コンポーネント |
| `views/` | 大きなビュー（Gallery / Canvas） |
| `utils/paths.ts` | クロスプラットフォーム path 操作 |
| `utils/logger.ts` | renderer→main ログ転送 |
| `utils/frontmatter.ts` | YAML frontmatter 解析 |
| `i18n/strings.ts` | 翻訳基盤（最小実装） |

### Main プロセス (`electron/`)

| 場所 | 責務 |
|---|---|
| `main.ts` | アプリ起動、CSP、`app-file://` プロトコル、グローバルエラー捕捉 |
| `logger.ts` | electron-log 設定（ファイル出力、ローテート） |
| `ai/provider.ts` | AI プロバイダ抽象（OpenAI / Gemini / Claude / none、APIキー方式と公式ログイン方式） |
| `ipc/vault.ts` | ノート / Vault / 同時編集衝突検出 |
| `ipc/wiki.ts` | Wiki コンパイル / ヘルスチェック |
| `ipc/qa.ts` | Claude Q&A（ストリーミング） |
| `ipc/books.ts` | 書籍メタデータ / 読書ノート |
| `ipc/settings.ts` | 設定 + safeStorage で API キー暗号化 |
| `ipc/utils.ts` | パス検証 / atomicWrite / sanitize |
| `ipc/file-access.ts` | 外部ファイル picker token の発行・検証 |
| `vault-index.ts` | 検索 / backlinks / dashboard 用の派生 JSON index |
| `diagnostics-report.ts` | ローカル診断レポートの安全な要約生成 |
| `redaction.ts` | API key / Bearer token / secret meta / 絶対パスのマスキング |

## 重要な抽象

### AI Provider

`electron/ai/provider.ts` の `runPrompt(provider, opts)` がすべての AI 呼出の単一エントリ。
左上の AI セレクタで `provider + authMode + model` をグローバルに選択する。

- `openai` + `api-key`: OpenAI Responses API
- `openai` + `login`: Codex CLI (`codex --login`, `codex exec`)
- `gemini` + `api-key`: Gemini `streamGenerateContent`
- `gemini` + `login`: Gemini CLI headless mode (`gemini --output-format json`), with Google ADC (`gcloud auth application-default login`) fallback
- `claude` + `api-key`: Anthropic Messages API
- `claude` + `login`: Claude Code CLI (`claude auth login`)
- `none`: AI 機能を無効化

すべて `onEvent` でストリーミングイベントを受信できる。
Wiki コンパイル / ヘルスチェック / QA がこの API を共通利用する。

### Path 検証

すべての IPC ハンドラは `validateVaultPath(filePath, vaultRoot)` を呼出して
パストラバーサル攻撃 (`../../etc/passwd`) を拒否する。
`app-file://` プロトコルハンドラも同じ検証を行う。

### FileAccessGrant

PDF / BibTeX / PDF→Markdown など、Vault 外のファイルを読む必要がある機能は
renderer に raw path を渡さない。Main 側の system picker が
`FileAccessGrant` を発行し、import IPC は token のみを受け取る。

Grant は以下を検証する:

- purpose が一致すること
- sender が一致すること
- TTL 内であること
- 一回限りであること

drag/drop など renderer 由来の外部パスは、Vault 内ファイルでない限り拒否する。

### Vault Index

検索、backlinks、研究ダッシュボードは `<userData>/indexes/` の派生 JSON
index を優先利用する。Vault 本体は source of truth であり、index は破損・古い
version・削除時に再構築できる。

対象外:

- `.obsidian`
- `.history`
- `.trash`
- `.classnotes`
- `_templates`
- build / dist / coverage / release / output 系

watcher の add / change / unlink は該当 file だけを増分更新する。

### 同時編集衝突検出

`vault:writeNote` は optional な `expectedMtime` を受け取り、
ディスク上の mtime と比較する。差異があれば `conflict: true` を返し、
renderer 側でユーザに「再読込か上書きか」を選ばせる。

### Atomic Write

すべてのファイル書込は `atomicWrite(filePath, content)` を経由。
`.tmp.PID.TS` に書いてから `rename` でアトミックに置換するため、
書込中のクラッシュでファイルが半端な状態になることを防ぐ。

## セキュリティ

- **CSP**: `default-src 'self'`、外部接続は公式AI API endpoint
  (`api.anthropic.com`, `api.openai.com`, `generativelanguage.googleapis.com`)
  と開発時のlocalhostに限定
- **app-file://**: vault スコープ外のパスを拒否
- **safeStorage**: API キーを OS キーチェーン（DPAPI / Keychain / libsecret）で暗号化
- **contextIsolation: true** + **sandbox: true** + **nodeIntegration: false**
- **shell:openUrl**: `http(s):` / `obsidian:` のみ許可、他プロトコルは拒否

## テスト戦略

| レイヤー | フレームワーク | カバー範囲 |
|---|---|---|
| Unit (Node) | Vitest | utils, paths, i18n, frontmatter |
| Component | testing-library/react + jsdom | Dialog, ErrorBoundary, OnboardingWizard |
| IPC 統合 | Vitest + Electron IPC モジュール | search, backlinks, papers, path traversal, file grants |
| Security regression | Vitest | redaction, URL security, FileAccessGrant, diagnostics |
| Release smoke | Node script + packaged Electron | packaged app 起動、app.asar 存在確認 |
| Release artifacts | Node script | installer / portable / latest.yml / SHA256SUMS 検証 |

将来の TODO:

- Playwright ベースの操作 E2E を追加し、Vault 作成、検索、PDF/BibTeX import、
  診断 export を UI から検証する。

## 配布

`electron-builder.yml` で electron-builder による Windows パッケージング。
macOS / Linux は将来対応として同じ設定ファイルへ target を追加する。

```bash
npm run dist      # release/ に成果物生成
npm run dist:win  # Windows NSIS + portable
```

コード署名は別途証明書取得が必要 → `docs/distribution.md` 参照（TODO）。

運用復旧手順は `docs/operations.md`、脅威モデルは `docs/threat-model.md` を参照。
