// Minimal i18n base. Keys are organized by domain. Locale is derived from
// settings (`ja` | `en`) or, when null, falls back to the system locale.
//
// Why not react-i18next? For now we only need static strings. Pulling in a
// 60 KB library for a hash lookup adds bundle weight that lazy-loading can't
// recover. If we later need plurals / interpolation / format(), we swap to
// i18next.

export type Locale = 'ja' | 'en';

const ja = {
  'app.welcome': 'ようこそ',
  'app.brain': 'ClassNotes は第2の脳 (Second Brain) です。',
  'wizard.step.1.title': 'ようこそ',
  'wizard.step.2.title': 'Vault を選ぶ',
  'wizard.step.3.title': 'AI を設定',
  'wizard.step.4.title': 'サンプルを試す',
  'wizard.step.5.title': '準備完了',
  'wizard.next': '次へ',
  'wizard.back': '戻る',
  'wizard.skip': 'スキップ',
  'wizard.start': 'はじめる',
  'common.save': '保存',
  'common.cancel': 'キャンセル',
  'common.close': '閉じる',
  'common.delete': '削除',
  'error.generic': 'エラーが発生しました',
  'error.copyDetails': '📋 詳細をコピー',
  'error.copied': '✓ コピーしました',
  'error.openLogs': '📁 ログを開く',
  'error.retry': '🔄 再試行',
  'settings.aiProvider': 'AI プロバイダー',
  'settings.aiProvider.cli': '選択中AIの公式ログインを使う',
  'settings.aiProvider.api': '選択中AIのAPIキーを使う',
  'settings.aiProvider.none': 'AI 機能を無効にする',
  'settings.apiKey': 'API キー',

  // DocAI (Phase 3-F) — DocAIPanel + SummaryCard + MultiDocPicker +
  // ContentGenerator + MultiAnalyzeCard + CitationBadge surface strings.
  'docai.panel.title': '🤖 AIアシスタント',
  'docai.panel.close': 'AI パネルを閉じる',
  'docai.action.summarize': '⚡ 要約',
  'docai.action.examPrep': '📝 試験対策',
  'docai.action.oneLiner': '📌 1行要約',
  'docai.action.compare': '📊 比較',
  'docai.action.generate': '✉ 生成',
  'docai.input.placeholder': 'この文書について質問...',
  'docai.input.send': '送信',
  'docai.input.label': '文書への質問',
  'docai.followups.label': '💡 サジェスト質問:',
  'docai.citations.fetching': '関連する出典を取得中…',
  'docai.busy.analyzing': '📊 分析中…',
  'docai.picker.title': '📎 複数文書を選択',
  'docai.picker.search': 'タイトル・パス・タグで検索…',
  'docai.picker.kind.all': 'すべて',
  'docai.picker.kind.note': '📝 ノート',
  'docai.picker.kind.pdf': '📕 PDF',
  'docai.picker.confirm': '決定',
  'docai.picker.rebuild': '🔄 Vault を再構築',
  'docai.picker.rebuildPrompt': '📂 Vault インデックスが空です。再構築すると一覧が表示されます。',
  'docai.generator.title': '✉️ コンテンツ生成',
  'docai.generator.submit': '生成',
  'docai.generator.busy': '生成中…',
  'docai.generator.copy': '📋 コピー',
  'docai.generator.copied': '✓ コピーしました',
  'docai.summary.copy': '📋 コピー',
  'docai.summary.insert': '📝 ノートに挿入',
  'docai.summary.actionsLabel': '次にやること',
  'docai.summary.structureLabel': '文書の論理構成',
  'docai.faq.command': 'FAQ / ヘルプ',
} as const;

const en: Record<keyof typeof ja, string> = {
  'app.welcome': 'Welcome',
  'app.brain': 'ClassNotes is your Second Brain.',
  'wizard.step.1.title': 'Welcome',
  'wizard.step.2.title': 'Pick a Vault',
  'wizard.step.3.title': 'Configure AI',
  'wizard.step.4.title': 'Try a Sample',
  'wizard.step.5.title': "You're set",
  'wizard.next': 'Next',
  'wizard.back': 'Back',
  'wizard.skip': 'Skip',
  'wizard.start': 'Start',
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.delete': 'Delete',
  'error.generic': 'An error occurred',
  'error.copyDetails': '📋 Copy details',
  'error.copied': '✓ Copied',
  'error.openLogs': '📁 Open logs',
  'error.retry': '🔄 Retry',
  'settings.aiProvider': 'AI Provider',
  'settings.aiProvider.cli': 'Use the selected AI official login',
  'settings.aiProvider.api': 'Use the selected AI API key',
  'settings.aiProvider.none': 'Disable AI features',
  'settings.apiKey': 'API key',

  // DocAI (Phase 3-F)
  'docai.panel.title': '🤖 AI Assistant',
  'docai.panel.close': 'Close AI panel',
  'docai.action.summarize': '⚡ Summarize',
  'docai.action.examPrep': '📝 Exam prep',
  'docai.action.oneLiner': '📌 One-liner',
  'docai.action.compare': '📊 Compare',
  'docai.action.generate': '✉ Generate',
  'docai.input.placeholder': 'Ask about this document...',
  'docai.input.send': 'Send',
  'docai.input.label': 'Question for the document',
  'docai.followups.label': '💡 Follow-up questions:',
  'docai.citations.fetching': 'Retrieving relevant sources…',
  'docai.busy.analyzing': '📊 Analyzing…',
  'docai.picker.title': '📎 Select multiple documents',
  'docai.picker.search': 'Search by title, path, or tag…',
  'docai.picker.kind.all': 'All',
  'docai.picker.kind.note': '📝 Notes',
  'docai.picker.kind.pdf': '📕 PDF',
  'docai.picker.confirm': 'Confirm',
  'docai.picker.rebuild': '🔄 Rebuild Vault',
  'docai.picker.rebuildPrompt': '📂 Vault index is empty. Rebuild to populate the list.',
  'docai.generator.title': '✉️ Content Generator',
  'docai.generator.submit': 'Generate',
  'docai.generator.busy': 'Generating…',
  'docai.generator.copy': '📋 Copy',
  'docai.generator.copied': '✓ Copied',
  'docai.summary.copy': '📋 Copy',
  'docai.summary.insert': '📝 Insert into note',
  'docai.summary.actionsLabel': 'Next actions',
  'docai.summary.structureLabel': 'Document structure',
  'docai.faq.command': 'FAQ / Help',
};

const tables: Record<Locale, Record<string, string>> = { ja, en };

let currentLocale: Locale = 'ja';

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

/** Resolve a translation key for the active locale, fall back to ja, then key. */
export function t(key: keyof typeof ja): string {
  return tables[currentLocale][key] ?? tables.ja[key] ?? key;
}

/** Detect the system locale and return either 'ja' or 'en'. */
export function detectSystemLocale(): Locale {
  if (typeof navigator !== 'undefined') {
    if (navigator.language?.toLowerCase().startsWith('ja')) return 'ja';
  }
  return 'en';
}
