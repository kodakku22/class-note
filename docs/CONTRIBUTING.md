# コントリビューションガイド

ClassNotes への貢献を歓迎します。

## 開発環境

必要なもの:
- Node.js 20.x 以上
- npm 10.x 以上
- Git

セットアップ:

```bash
git clone https://github.com/kodakku22/class-note.git
cd class-note
npm ci
npm run dev   # Vite + Electron 開発サーバー
```

## ブランチ戦略

- `main` — 安定版、リリース対象
- `feature/<name>` — 新機能
- `fix/<name>` — バグ修正
- `chore/<name>` — メンテナンス

## コミットメッセージ

[Conventional Commits](https://www.conventionalcommits.org/) に従います:

```
feat(wiki): add streaming progress to compile
fix(books): preserve frontmatter on autosave
docs(readme): update screenshots
test(ipc): add path traversal coverage
```

## コードスタイル

- TypeScript strict mode
- Prettier + ESLint で自動整形
  ```bash
  npm run format
  npm run lint
  ```

## テスト

すべての変更に対応するテストを追加してください:

```bash
npm test               # vitest 1 回実行 (~2300 件、40 秒)
npm run test:watch     # ウォッチモード
npm run test:coverage  # カバレッジ計測 (閾値ゲート付き)
npm run test:e2e       # Playwright + Electron (Build 後に実行)
npm run license:check  # 依存ライセンス確認
```

カバレッジ閾値 (vitest.config.ts で強制):
- Statements: **70% 以上**
- Branches: **70% 以上**
- Functions: **70% 以上**
- Lines: **70% 以上**

新しい IPC ハンドラには:
1. `tests/ipc/<name>.test.ts` で integration test
2. パストラバーサル試験を必ず含める
3. `vi.mock('../../electron/ai/provider', ...)` するときは
   `setOfflineMode` / `isOfflineMode` も忘れずに含める (Phase 3-G)

新しい hook / component には:
1. `tests/hooks/use<Name>.test.tsx` (renderHook + act パターン)
2. `tests/components/<Name>.test.tsx` (RTL)
3. 既存テンプレート: `tests/hooks/useUndoRedo.test.tsx`

## アーキテクチャの原則

[`docs/architecture/overview.md`](architecture/overview.md) を必読。
非自明な技術判断は [`docs/architecture/adr/`](architecture/adr/) を参照。
IPC チャネル一覧は [`docs/architecture/ipc-channels.md`](architecture/ipc-channels.md)。

重要な原則:

1. **Path validation everywhere** — `validateVaultPath` を経由しない
   ファイル I/O は禁止。`realpathSync.native` でシンボリックリンク脱出も
   防ぐので、純粋な `path.resolve` で済まさないこと。
2. **Atomic writes** — `atomicWrite()` を使う、`fs.writeFile` 直呼びは禁止。
3. **AI calls go through Provider** — `qa.ts` / `wiki.ts` / agents は
   `runPrompt()` を経由する。provider 固有の API / CLI 呼び出しを分散させない。
   オフラインモード尊重のため `runPrompt` 以外のパスでネット通信しないこと。
4. **Sanitize before prompt** — ユーザー入力を AI に渡す前に必ず
   `sanitizeForPrompt()`。frontmatter の `title` / `tags` も同様
   (`sanitizeMetaString` を使う)。
5. **No secrets in logs** — `logger` は API キー等を自動マスキングするが、
   そもそもログに渡さないのが筋。
6. **DocAI ファイルサイズガード** — `readChunkableDocument` 経由で
   `docaiMaxFileSizeMB` (デフォルト 50MB) を必ずチェック。
7. **Vault マイグレーション** — `<vault>/.classnotes/vault-version.txt` に
   versioned schema. 破壊的変更時は `electron/vault-migration.ts` に
   migration を追加 + `CURRENT_VAULT_VERSION` を bump。
8. **AI モデル deprecation** — provider が deprecation を告知したら
   即座に `electron/ai/provider.ts` の対応 `ModelEntry` に
   `deprecation` フィールドを追加。

## リリース

詳細は [`docs/release-signing.md`](release-signing.md) と
[`docs/release.md`](release.md):

- コード署名 (`WINDOWS_CERTIFICATE_BASE64` / `WINDOWS_CERTIFICATE_PASSWORD`
  secrets が必要 — 署名なしでは auto-updater が動きません)
- `v*` タグ push で `.github/workflows/release.yml` が起動
- GitHub Releases に draft アップロード → 手動公開

## PR チェックリスト

- [ ] `npm run build` エラー 0
- [ ] `npm test` 全パス
- [ ] `npm run test:coverage` 70% 閾値 4 項目すべて pass
- [ ] `npm run lint` exit 0 (warnings は 600 cap 内、`lint:strict` で 0 を目標)
- [ ] `npm run test:e2e` 全パス (UI 変更時)
- [ ] `npm run license:check` エラー 0
- [ ] テストを追加（新機能・バグ修正の場合）
- [ ] CHANGELOG.md を更新
- [ ] スクリーンショット添付（UI 変更の場合）
- [ ] ブレイキングチェンジは PR タイトルに `BREAKING:` プレフィックス
- [ ] Vault フォーマット変更は `electron/vault-migration.ts` に migration 追加

## レビューフロー

1. PR を作成
2. CI が `build / test / lint` を回す（GitHub Actions）
3. レビュアーがコメント
4. 修正 → 再レビュー
5. squash & merge

## セキュリティ問題

公開 Issue ではなく、[security@classnotes.app](mailto:security@classnotes.app)（仮）
にメール、または GitHub の Private Vulnerability Reporting を使ってください。
