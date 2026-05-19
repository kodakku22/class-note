# はじめ方（5 分チュートリアル）

> 対象: **OpenAI / Gemini / Anthropic の API キー、または公式 CLI/OAuth ログインを利用できる大学院生・研究者**

ClassNotes をインストールしてから、最初の Wiki が完成するまでの 5 分のガイドです。

## 1. インストール（30 秒）

[GitHub Releases](https://github.com/kodakku22/class-note/releases/latest) から
Windows 用 installer をダウンロード:

- **Windows**: `ClassNotes-Setup.exe` をダブルクリック → 自動でインストール

macOS / Linux 版は将来対応予定です。現時点では Windows 版を優先して検証しています。

## 2. 初回起動ウィザード（1 分）

起動すると 5 ステップのウィザードが表示されます。

### Step 1: ようこそ
Karpathy 式 Second Brain の哲学を 30 秒で説明する画面です。「次へ」を押します。

### Step 2: Vault を選ぶ
「📁 フォルダを選択」を押し、ノートを保存する場所を選びます。
すでに Obsidian Vault があるなら **同じフォルダを指定** すると、Obsidian と
ClassNotes で同じノートを共有できます。

### Step 3: AI を設定
左上レーンと同じ AI セレクタで、アプリ全体の provider / 認証方式 / model を選びます:

| 選択肢 | おすすめの人 | 必要なもの |
|---|---|---|
| **GPT** | OpenAI API または Codex CLI を使いたい人 | API キー、または `codex --login` |
| **Gemini** | Google Gemini API / Gemini CLI を使いたい人 | API キー、Gemini CLI ログイン、または `gcloud auth application-default login` |
| **Claude** | Anthropic API または Claude Code CLI を使いたい人 | API キー、または `claude auth login` |
| **Off** | まずは AI なしで試したい | なし |

API キー方式を選んだ場合、入力欄が出るので貼り付けます。
キーは OS の暗号化ストレージに保存され、ログやファイルには残りません。

### Step 4: サンプルを試す
チェックを入れると、`数学 / 歴史 / 読書` の 3 サブジェクトに各 1 〜 2 件の
サンプルノートが投入されます。すぐに Wiki コンパイルが試せます。

### Step 5: 準備完了 🎉
「はじめる」を押します。

## 3. 最初のノート（1 分）

サイドバーの「数学」サブジェクトをクリックすると、`勾配降下法の直感.md` などの
サンプルが表示されます。クリックして開いてみましょう。

新しくノートを作るには:
- 上部の「+ 新しいノート」ボタン
- または `Ctrl+N`

## 4. 質問してみる（30 秒）

サイドバー上部の `💬 Q&A` ボタン、または `Ctrl+Enter` でチャット画面に切り替えます。
「勾配降下法を中学生にもわかるように説明して」と聞いてみましょう。

`Ctrl+Enter` で送信。Claude が考えながらストリーミングで回答してくれます。

良い回答だったら **🧠 Wiki に保存** を押して、ページとして残せます。

## 5. Wiki コンパイル（2 分）

サイドバーの 🧠 アイコン、または `Ctrl+6` で Wiki ビューを開きます。
「🤖 Wiki をコンパイル」ボタンを押すと、AI がすべてのノート・サンプルから
トピック別の Wiki ページを生成します。

進捗バーで `収集中 → プロンプト送信中 → AI 応答中 → 書出中` が確認できます。

完了したらページが Wiki に並びます。`[[wikilink]]` で関連トピックを
ジャンプできます。

## 6. 振り返り

数日後、新しいノートを書いた後にもう一度 Wiki コンパイルすると、
**追加された素材で wiki が更新** されます。これが Karpathy 式
Second Brain の **複利学習ループ** です。

月に一度、`📤 Outputs` の「ヘルスチェック」を実行すると、
Wiki の矛盾・抜け・古い情報を AI が指摘してくれます。

---

## トラブルシューティング

| 症状 | 対処 |
|---|---|
| CLI が見つかりません | 選択 provider に応じて `codex`, `gemini` / `gcloud`, `claude` をインストール |
| API キーが拒否される | 選択 provider の発行ページで有効なキーか確認し、左上AIセレクタで再保存 |
| Wiki コンパイルが 5 分でタイムアウト | スコープを「すべて」から特定の科目に絞る |
| Vault が表示されない | Settings → Vault → 「最近使った Vault」から再選択 |
| 検索や backlinks が古い | Settings → Vault インデックス → 「インデックスを再構築」 |
| 起動後に挙動が不安定 | Settings → 診断 → 「診断レポートを書き出す」 |
| ログを確認したい | Settings → 診断 → 「ログフォルダを開く」 |

サポート: [GitHub Issues](https://github.com/kodakku22/class-note/issues)

バックアップ、復元、診断レポートの詳細は [operations.md](operations.md) を参照してください。
