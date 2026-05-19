# プライバシーポリシー

ClassNotes は **大学院生・研究者向け** のローカルファースト型ノートアプリです。
あなたのデータを尊重し、**デフォルトではすべての操作がローカル完結** で、
外部送信は一切行いません。

## 年齢制限

ClassNotes は **13 歳未満は使用対象外** です。AI 機能を使用する際は、選択した
OpenAI / Google / Anthropic の各サービス規約に従う必要があります。研究文脈を
前提に設計されており、13 歳未満の方の利用は想定していません。

## 何が外部に送られるか

| データ | 送信先 | いつ | コントロール |
|---|---|---|---|
| ノート本文 / 質問内容 | 選択中の AI provider（OpenAI / Gemini / Anthropic、または公式CLI/OAuth経由） | AI 機能を使った時のみ | AI 機能をオフにすれば送信ゼロ |
| クラッシュレポート | Sentry | クラッシュ時 | Settings から opt-out 可能 |
| 匿名利用統計 | テレメトリーエンドポイント | 1 日 1 回バッチ | Settings から opt-out 可能 |

## 何が**送られない**か

明示的に保証します:

- ❌ ノートの内容（AI に送信しない限り）
- ❌ ファイル名 / フォルダ構造
- ❌ Vault のパス
- ❌ ユーザー識別情報（メール / 名前 / アカウント）
- ❌ API キー（OS キーチェーンに暗号化保存、外部送信なし）
- ❌ クリップボード / 履歴 / Cookie

## API キーの保護

AI provider の API キーは **OS のネイティブ暗号化ストレージ** に provider 別で保存されます:

| OS | ストア |
|---|---|
| Windows | DPAPI (Data Protection API) |
| macOS | Keychain |
| Linux | libsecret (gnome-keyring / kwallet) |

実装: Electron の [`safeStorage`](https://www.electronjs.org/docs/latest/api/safe-storage)。
- 復号にはユーザーの OS ログインが必要
- provider 別の API key ファイルは暗号化済バイナリ
- ログ / クラッシュレポート / 平文ファイルには **絶対に書き出されません**

## クラッシュレポート (Sentry)

オプトイン制です。有効化した場合のみ送信されます:

- 例外メッセージ + スタックトレース
- 発生時刻 / OS / アプリバージョン
- セッション ID（匿名 UUID）

送信前に以下のパターンが自動マスキングされます:
- `sk-ant-…` 形式の API キー → `[REDACTED-API-KEY]`
- `Bearer …` トークン → `Bearer [REDACTED]`
- ログメッセージ中の `api[_-]?key|token|password|secret` を含むキー → 削除

オプトアウト: Settings → 「クラッシュレポートを送信する」のチェックを外す

## 匿名利用統計

オプトイン制です。次のイベントのみ送信されます:

| イベント | プロパティ |
|---|---|
| `app_launched` | (なし) |
| `vault_opened` | (なし) |
| `note_created` | (なし) |
| `wiki_compiled` | (なし) |
| `qa_asked` | (なし) |
| `docai_summary` | `mode` (keypoints/exam-prep/one-liner), `durationMs`, `ok` |
| `docai_ask` | `isMultiDoc`, `chunkCount`, `durationMs`, `ok` |
| `docai_multi_analyze` | `docCount`, `mode`, `durationMs`, `ok` |
| `docai_generate` | `format`, `wordCount`, `durationMs`, `ok` |

各イベントには:
- 匿名 UUID（インストールごとに 1 つ生成、リセット可）
- OS family (`win32` / `darwin` / `linux`)
- アプリバージョン

のみが付随します。**ノート内容、ファイル名、Vault のパス、質問テキスト、
AI の回答テキストは一切含まれません。** Phase 4 で追加された DocAI 系
イベントの `wordCount` も「生成された語数」だけで、本文は送信されません。

オプトアウト: Settings → 「匿名利用統計を送信する」のチェックを外す

### 完全オフライン保証 (Phase 3-G)

**Settings → オフラインモード** を ON にすると、`runPrompt()` がすべての
ネットワーク呼び出しを送信前にショートカットします。AI provider の設定
ミスがあっても外部 API には絶対に到達しません。エアギャップ環境や機密度
の高い Vault で作業する場合に推奨します。

### 検証方法

- `netstat -an | findstr ESTABLISHED` (Windows) や `lsof -i` (macOS/Linux)
  で実際に外部接続が無いことを確認できます
- `<userData>/telemetry-queue.json` を直接開けばキューに何が入っているか
  目視確認できます (フラッシュ後は空になります)
- `<userData>/logs/main.log` の `[ai-provider]` 行で AI API への送信
  ログを確認できます (ボディは記録されません)

## データ削除

すべてのデータはローカルに保存されています:

| データ | 場所 |
|---|---|
| ノート | あなたが指定した Vault フォルダ |
| 設定 | `<userData>/settings.json` |
| API キー（暗号化） | `<userData>/openai-api-key.bin`, `<userData>/gemini-api-key.bin`, `<userData>/anthropic-api-key.bin` |
| ログ | `<userData>/logs/` |
| 匿名 UUID | `<userData>/telemetry-id.txt` |
| イベントキュー | `<userData>/telemetry-queue.json` |
| Vault index cache | `<userData>/indexes/` |
| 診断レポート | `<userData>/diagnostics/` |

`<userData>` の場所:
- Windows: `%APPDATA%\ClassNotes\`
- macOS: `~/Library/Application Support/ClassNotes/`
- Linux: `~/.config/ClassNotes/`

完全に削除するにはアプリのアンインストールに加えて `<userData>` を削除します。

`<userData>/indexes/` は検索・backlinks・研究ダッシュボード用の派生キャッシュです。
削除しても Vault 本文は失われず、次回起動後に再構築できます。

## 質問・連絡先

プライバシーに関する質問は GitHub Issues、もしくは
[security@classnotes.app](mailto:security@classnotes.app)（仮）まで。
