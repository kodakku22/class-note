export type FAQCategory = 'setup' | 'ai' | 'vault' | 'performance' | 'editor' | 'sync';

export type FAQEntry = {
  id: string;
  category: FAQCategory;
  question: string;
  answer: string;
  keywords: string[];
};

export const FAQ_CATEGORIES: Record<FAQCategory, string> = {
  setup: 'セットアップ',
  ai: 'AI 機能',
  vault: 'Vault / データ',
  performance: 'パフォーマンス',
  editor: 'エディタ',
  sync: '同期 / ファイル監視',
};

export const FAQ_ENTRIES: FAQEntry[] = [
  // ===== setup =====
  {
    id: 'install-windows',
    category: 'setup',
    question: 'Windows にインストールする方法は？',
    answer: 'リリースページから Setup.exe または Portable.exe をダウンロードしてください。Setup 版はインストーラ付き、Portable 版はフォルダ内完結で持ち運び可能です。',
    keywords: ['install', 'windows', 'exe', 'ダウンロード'],
  },
  {
    id: 'first-run',
    category: 'setup',
    question: '初回起動時に何をす���ばいいですか？',
    answer: 'オンボ���ディングウィザードが案内します。Vault フォルダを選択し、AI プロバイダを設定すれば準備完了です。サンプルデータも任意でインストールできます。',
    keywords: ['初回', 'first', 'wizard', 'onboarding', 'ウィザード'],
  },
  {
    id: 'vault-create',
    category: 'setup',
    question: 'Vault とは何ですか？新しく作る方法は？',
    answer: 'Vault はノートやデータを保存するフォルダです。任意の空フォルダを選択するか、既存の Obsidian Vault を指定できます。Settings → Vault → 「別の Vault を開く」から切替可能です。',
    keywords: ['vault', 'フォルダ', 'create', '作成', 'obsidian'],
  },
  {
    id: 'obsidian-compat',
    category: 'setup',
    question: 'Obsidian の Vault をそのまま使えますか？',
    answer: 'はい。ClassNotes は Obsidian と同じフォルダ構造に対応���ています。.obsidian フォルダは無視され、Wikilink 記法も共有されます。両方のアプリを併用できます。',
    keywords: ['obsidian', '互換', 'compatible', 'wikilink'],
  },
  {
    id: 'sample-data',
    category: 'setup',
    question: 'サンプルデータを後からインストールできますか？',
    answer: 'Settings → 診断 → 「サンプルデータを再インストール」から可能です。既存ノートは上書きされません。',
    keywords: ['sample', 'サンプル', 'demo', 'テスト'],
  },
  {
    id: 'uninstall',
    category: 'setup',
    question: 'アンインストール方法は？',
    answer: 'Setup 版: Windows の「アプリと機能」からアンインストール。Portable 版: フォルダを削除するだけです。Vault フォルダ内のデータは残ります。',
    keywords: ['uninstall', 'アンインストール', '削除', 'remove'],
  },
  {
    id: 'update',
    category: 'setup',
    question: 'アプリを更新するには？',
    answer: '現在は手動更新です。最新版を上書きインストール（Setup 版）するか、Portable EXE を差し替えてください。Vault データはアプリ外にあ��ため影響しません。',
    keywords: ['update', '更新', 'upgrade', 'バージョン'],
  },
  {
    id: 'portable-vs-setup',
    category: 'setup',
    question: 'Portable 版と Setup 版の違いは？',
    answer: 'Setup 版はスタートメニューに登録され自動更新対応。Portable 版は USB 等に入れて持ち運べます。機能は同一です。',
    keywords: ['portable', 'setup', 'nsis', '違い'],
  },

  // ===== ai =====
  {
    id: 'ai-provider-select',
    category: 'ai',
    question: 'AI プロバイダはどう選べばいいですか？',
    answer: 'Settings → AI から OpenAI (GPT-4o)、Google (Gemini)、Anthropic (Claude) を選択できます。API キーを持っていれば「API キー」モード、Claude CLI がインストール済みなら「ログイン」モードも使えます。',
    keywords: ['provider', 'プロバイダ', '選択', 'openai', 'gemini', 'claude'],
  },
  {
    id: 'api-key-setup',
    category: 'ai',
    question: 'API キーの設定方法は？',
    answer: '左上の AI セレクタ、または Settings → AI → 「API キーを設定」から入力します。キーは OS の暗号化ストレージ (Windows Credential Manager) に安全に保存されます。',
    keywords: ['api', 'key', 'キー', '設定', 'credential'],
  },
  {
    id: 'api-key-rejected',
    category: 'ai',
    question: 'API キーが拒否されます',
    answer: '選択プロバイダの管理画面でキーが有効か確認してください。期限切れや使用上限に達��ている場合���あり��す。再度 Settings から保存し直してみてください。',
    keywords: ['rejected', '拒否', 'invalid', '無効', '401'],
  },
  {
    id: 'cli-not-found',
    category: 'ai',
    question: 'CLI が見つかりませんと表示されます',
    answer: '「ログイン」モードでは各プロバイダの CLI ツールが必要です。Claude → `claude` CLI、Codex → `codex` CLI をインストールし PATH に通してください。',
    keywords: ['cli', '見つかりません', 'not found', 'path', 'codex', 'claude'],
  },
  {
    id: 'ai-timeout',
    category: 'ai',
    question: 'AI 応答がタイムアウトします',
    answer: 'ネットワーク接続を確認してください���大きな入力テキス��の場合はトークン上限に達する可能性があります���Wiki コンパイルの場合��スコープを科目単��に絞ると改善します。',
    keywords: ['timeout', 'タイムアウト', '遅い', 'slow', '応答なし'],
  },
  {
    id: 'ai-disabled',
    category: 'ai',
    question: 'AI 機能をオフにしたい',
    answer: 'Settings → AI → プロバイダを「なし」に設定すると、AI 関連の機能はすべて無効になります。ノート作成・編集��検索は引き続き使えます。',
    keywords: ['off', 'disable', '無効', 'オフ', 'none'],
  },
  {
    id: 'token-limit',
    category: 'ai',
    question: 'トークン上限エラーが出ます',
    answer: 'ノートが長すぎる場合���発生します。ノートを分割するか���要約対象の範囲を選択して実行してください。モデルによって上限が異なります（GPT-4o: 128K、Claude: 200K）。',
    keywords: ['token', 'limit', 'トークン', '上限', 'context'],
  },
  {
    id: 'ai-cost',
    category: 'ai',
    question: 'AI の利用コストは？',
    answer: '各プロバイダの API 料金が直接発生します。ClassNotes は中間マージンを取りません。Wiki コンパイル等の大量処理前に各社の料金ページを確認してください。',
    keywords: ['cost', 'コスト', '料金', 'price', '課金'],
  },
  {
    id: 'model-selection',
    category: 'ai',
    question: '使用するモデルは変更できますか？',
    answer: 'Settings → AI → 「モデル」から選択できます。速度重視なら軽量モデル (GPT-4o-mini, Haiku)、品質重視なら最新モデル (GPT-4o, Opus) を選んでください。',
    keywords: ['model', 'モデル', 'gpt-4', 'opus', 'haiku', 'sonnet'],
  },

  // ===== vault =====
  {
    id: 'vault-not-visible',
    category: 'vault',
    question: 'Vault が表示されない / 消えた',
    answer: 'Settings → Vault → 「最近使った Vault」から再選択してください���フォルダが移動・削除されていないか確認してください。',
    keywords: ['表示されない', '消えた', 'missing', 'vault'],
  },
  {
    id: 'index-rebuild',
    category: 'vault',
    question: '検索や Backlinks が古い情報を表示する',
    answer: 'Settings → Vault インデッ���ス → 「インデックスを再構築」を実行してください。外部エディタ���ファイルを変更した場合にインデックスが古くなることがあります。',
    keywords: ['index', 'インデックス', '再構築', 'rebuild', 'backlinks', '検��', 'stale'],
  },
  {
    id: 'backup-restore',
    category: 'vault',
    question: 'バックアップとリストアの方法は？',
    answer: 'Settings → データ保護 → 「バックアップを作成」で zip バックアップが作られます。リストアは zip を展開して Vault フォルダとして指定してください。詳細は operations.md を参照���',
    keywords: ['backup', 'バックアップ', 'restore', 'リストア', 'zip'],
  },
  {
    id: 'file-disappeared',
    category: 'vault',
    question: 'ノートが消えてしまった',
    answer: '削除操作はソフトデリート（.trash フォルダへ移動）です。Vault フォルダ直下の .trash を確認してください。外部ツー��で削除し��場合は OS のゴミ箱を確認してください。',
    keywords: ['消えた', 'disappeared', 'delete', '削除', 'trash', 'ゴミ箱'],
  },
  {
    id: 'vault-large',
    category: 'vault',
    question: '大規模な Vault でも使えますか？',
    answer: '数千ファイ���までは���題なく動作します。万単位の場合はインデッ��ス構築に時間がかかることがあります。node_modules や .git フォルダは自動的に除外されます。',
    keywords: ['large', '大規模', '大量', 'ファイル数', 'performance'],
  },

  // ===== performance =====
  {
    id: 'slow-startup',
    category: 'performance',
    question: '起動が遅い',
    answer: 'Vault のファイル数が多い場合、初回インデックス構築に時間がかかります。2回目以降はキャッシュにより高速化されます。不要��フォルダ (node_modules 等) ��� Vault 内にないか確認してください。',
    keywords: ['startup', '起動', '遅い', 'slow', 'loading'],
  },
  {
    id: 'wiki-timeout',
    category: 'performance',
    question: 'Wiki コンパイルが 5 分でタイムアウトする',
    answer: 'スコープを「すべて」から特定の科目に絞ってください���1科目ずつコンパイルすると安定します。API のレート制限に引っかかっている可能性もあります。',
    keywords: ['wiki', 'compile', 'timeout', 'タイムアウト', '5分'],
  },
  {
    id: 'memory-usage',
    category: 'performance',
    question: 'メモリ使用量が多い',
    answer: 'PDF ビューア や Mermaid 図を多用するとメモリが増加します。使わないタブを閉じると改善します。アプリ再起動��解放されます。',
    keywords: ['memory', 'メモリ', 'RAM', '重い'],
  },
  {
    id: 'app-unstable',
    category: 'performance',
    question: '起動後に挙動が不安定',
    answer: 'Settings → 診断 → 「診断レポートを書き出す」を実行し、レポート内容を確認してください。Vault の整合性チェックも同画面から実���できます。',
    keywords: ['unstable', '不安定', 'crash', 'クラッシュ', 'bug'],
  },

  // ===== editor =====
  {
    id: 'markdown-syntax',
    category: 'editor',
    question: '対応している Markdown 記法は？',
    answer: 'GFM (GitHub Flavored Markdown) に対��。見出し、リスト、テーブル、コードブロック、数式 (KaTeX)、Mermaid 図、Wikilink ([[リンク]])、タグ (#tag) が使えます。',
    keywords: ['markdown', '記法', 'syntax', 'gfm', '書き方'],
  },
  {
    id: 'image-embed',
    category: 'editor',
    question: '画像を埋め込むには？',
    answer: 'エ���ィタに画像ファイルをドラッグ＆ドロップするか、![[filename.png]] 記法で参照します。画像は materials フォルダに保存されます。',
    keywords: ['image', '画像', 'embed', '埋め込み', 'drag', 'drop'],
  },
  {
    id: 'wikilink-unresolved',
    category: 'editor',
    question: 'Wikilink が解決されない（灰色のまま）',
    answer: 'リンク先のファイルが存在しない場合に灰色表示になります。ファ��ル名のスペルを確認するか、インデックスを再構築してくださ���。[[新規��ート]] をクリックすると自動作成されます。',
    keywords: ['wikilink', '解決', 'unresolved', '灰色', 'リンク'],
  },

  // ===== sync =====
  {
    id: 'watcher-not-detecting',
    category: 'sync',
    question: '外部で編集したファイルが反映されない',
    answer: 'ファイル監視が一時的に失敗���ている可能性があります。Settings → Vault インデックス → 「インデックスを再構築」で解消します。ネットワークドライブ上の Vault では監視が不安定な場合があります。',
    keywords: ['watcher', '監視', '反映', 'detect', '外部'],
  },
  {
    id: 'conflict',
    category: 'sync',
    question: '編集コンフリクトが発生した',
    answer: 'ClassNotes ��開いているファイルを外部ツールで同時編集すると mtime コンフリクトが検出されます。「外部の変更を読み込む」か「現在の内容を保持」を選んでください。',
    keywords: ['conflict', 'コンフリクト', '競合', 'mtime', '同時編集'],
  },
];
