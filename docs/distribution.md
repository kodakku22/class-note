# 配布パイプライン

## 概要

ClassNotes の配布物は **electron-builder** で生成します。初回 OSS 公開では Windows を正式対象にし、macOS/Linux は将来対応として扱います。設定の入口は `electron-builder.yml`、CI の実行入口は `.github/workflows/release.yml` です。

| プラットフォーム | フォーマット | 状態 |
|---|---|---|
| Windows | `.exe` NSIS installer + portable `.exe` | 正式対象 |
| macOS | `.dmg` / `.zip` | 将来対応 |
| Linux | `.AppImage` / `.deb` 等 | 将来対応 |

## ローカルビルド（署名なし）

開発 / 内部テスト用:

```bash
npm run build       # tsc + vite build
npm run dist        # release/ に electron-builder 成果物を生成
npm run dist:win    # Windows NSIS + portable を生成
```

注意:
- 署名なしでは Windows SmartScreen の警告、macOS Gatekeeper のブロックが出ます
- `release/` は生成物専用です。配布前に smoke test と checksum 生成を実行してください
- 旧配布スクリプトは利用しません

成果物検証:

```bash
npm run test:release-smoke
npm run hash:release
npm run test:release-artifacts
```

`test:release-artifacts` は installer / portable / `latest.yml` /
`SHA256SUMS.txt` の存在と checksum の一致を確認します。

## アイコン

`build/` ディレクトリに以下を配置:

- `icon.png` — 1024×1024 ソース
- `icon.ico` — Windows
- `icon.icns` — macOS

生成方法:

```bash
npm run assets:icon
```

`electron-builder.yml` の `win.icon` は `build/icon.ico` を参照します。

## コード署名

### Windows

オプション:
1. **Azure Trusted Signing**（推奨、$9.99/月） — クラウドベースで EV cert 不要
2. **SSL.com EV 証明書**（$249/年） — 物理 USB トークン

CI では PFX を Base64 化して GitHub Secrets に登録します。

```
WINDOWS_CERTIFICATE_BASE64
WINDOWS_CERTIFICATE_PASSWORD
```

`.github/workflows/release.yml` は証明書を一時ファイルへ復元し、`CSC_LINK` と `CSC_KEY_PASSWORD` を electron-builder に渡します。

### macOS

必要なもの:
1. **Apple Developer Program**（$99/年）
2. **Developer ID Application** 証明書
3. **App-specific password**

環境変数:

```
APPLE_ID
APPLE_ID_PASSWORD
APPLE_TEAM_ID
```

macOS 配布を正式対象にするタイミングで、`electron-builder.yml` に `mac`, `dmg`, notarization 設定を追加します。

### Linux

Linux 配布を正式対象にするタイミングで、`electron-builder.yml` に `linux` target を追加します。apt リポジトリで配布する場合は GPG 署名を別途実施します。

## CI / GitHub Actions

タグ `v*` の push で Windows リリースを作成します。

```yaml
- run: npm ci
- run: |
    npm run lint
    npm test -- --run
    npm run test:coverage
    npm run license:check
    npm audit
    npm audit --omit=dev
- run: npm run build
- run: npx electron-builder --win nsis portable --publish never
- run: npm run test:release-smoke
- run: npm run hash:release
- run: npm run test:release-artifacts
```

## 自動アップデート

`electron-updater` は GitHub Releases の成果物を参照します。Windows/macOS では署名済み installer が前提です。Unsigned build ではアップデート検証に失敗するため、Settings の手動確認も配布版でのみ有効になります。

## チェックリスト（リリース前）

- [ ] `npm run lint` 全パス
- [ ] `npm test -- --run` 全パス
- [ ] `npm run test:coverage` が閾値を満たす
- [ ] `npm run build` エラー 0
- [ ] `npm run dist` または `npm run dist:win` で成果物が生成できる
- [ ] `npm run test:release-smoke` が通る
- [ ] `npm run hash:release` で checksum を生成
- [ ] `npm run test:release-artifacts` が checksum と成果物を検証
- [ ] `npm audit` / `npm audit --omit=dev` が 0 件
- [ ] `npm run license:check` が通る
- [ ] 署名済 installer が SmartScreen / Gatekeeper の警告なしで起動
- [ ] `CHANGELOG.md` に変更点を記載
- [ ] `package.json` の `version` を更新
- [ ] git tag → push → GitHub Actions が draft release を作成
