// Note "Object Types" — high-level kinds of notes with typed Relations
// (frontmatter properties) and starter templates. Anytype-inspired.

export type ObjectTypeId =
  | 'lecture'
  | 'summary'
  | 'review'
  | 'research'
  | 'experiment'
  | 'memo'
  | 'daily'
  | 'subject'
  | 'free';

export type RelationKind =
  | 'date'
  | 'text'
  | 'longtext'
  | 'tags'
  | 'rating'
  | 'status'
  | 'number'
  | 'select';

export type RelationDef = {
  key: string;          // frontmatter key
  label: string;        // human label
  kind: RelationKind;
  options?: string[];   // for `select` / `status`
  defaultValue?: unknown;
  emoji?: string;
};

export type ObjectTypeDef = {
  id: ObjectTypeId;
  label: string;
  emoji: string;
  description: string;
  /** Filename of the user-editable template under `_templates/`. */
  templateName: string;
  relations: RelationDef[];
};

// 12 Milanote-inspired card colors used across cards / canvas. Defined here
// (before OBJECT_TYPES) so the `memo` type can reference its options.
export const CARD_COLORS = [
  { id: 'default', label: '無色' },
  { id: 'red', label: '赤' },
  { id: 'orange', label: 'オレンジ' },
  { id: 'yellow', label: '黄' },
  { id: 'green', label: '緑' },
  { id: 'teal', label: 'ティール' },
  { id: 'blue', label: '青' },
  { id: 'purple', label: '紫' },
  { id: 'pink', label: 'ピンク' },
  { id: 'gray', label: 'グレー' },
  { id: 'brown', label: 'ブラウン' },
  { id: 'indigo', label: 'インディゴ' },
] as const;

export type CardColor = (typeof CARD_COLORS)[number]['id'];

const CARD_COLOR_IDS: string[] = CARD_COLORS.map((c) => c.id);

export const OBJECT_TYPES: ObjectTypeDef[] = [
  {
    id: 'lecture',
    label: '授業ノート',
    emoji: '🎓',
    description: '講義・授業のノート。日付・担当教員・章番号などを記録',
    templateName: 'lecture',
    relations: [
      { key: 'type', label: 'タイプ', kind: 'text', defaultValue: 'lecture' },
      { key: 'subject', label: '科目', kind: 'text' },
      { key: 'date', label: '日付', kind: 'date', emoji: '📅' },
      { key: 'teacher', label: '担当教員', kind: 'text', emoji: '👤' },
      { key: 'chapter', label: '章', kind: 'text', emoji: '📖' },
      { key: 'tags', label: 'タグ', kind: 'tags', emoji: '🏷️' },
      {
        key: 'status',
        label: '状態',
        kind: 'status',
        options: ['未読', '受講中', '復習要', '習得'],
        emoji: '📊',
      },
    ],
  },
  {
    id: 'summary',
    label: '要約',
    emoji: '📝',
    description: 'ノートや資料を自分の言葉でまとめたページ',
    templateName: 'summary',
    relations: [
      { key: 'type', label: 'タイプ', kind: 'text', defaultValue: 'summary' },
      { key: 'subject', label: '科目', kind: 'text' },
      { key: 'date', label: '作成日', kind: 'date', emoji: '📅' },
      { key: 'source', label: '元ノート', kind: 'text', emoji: '🔗' },
      {
        key: 'completion',
        label: '完了度',
        kind: 'select',
        options: ['下書き', '途中', '完成'],
        emoji: '✅',
      },
      { key: 'tags', label: 'タグ', kind: 'tags', emoji: '🏷️' },
    ],
  },
  {
    id: 'review',
    label: '復習',
    emoji: '🔁',
    description: '理解度・暗記度を管理する復習ノート',
    templateName: 'review',
    relations: [
      { key: 'type', label: 'タイプ', kind: 'text', defaultValue: 'review' },
      { key: 'subject', label: '科目', kind: 'text' },
      { key: 'reviewDate', label: '次回復習予定日', kind: 'date', emoji: '⏰' },
      {
        key: 'understanding',
        label: '理解度',
        kind: 'rating',
        emoji: '⭐',
      },
      { key: 'cards', label: '暗記カード数', kind: 'number', emoji: '🃏' },
      { key: 'tags', label: 'タグ', kind: 'tags', emoji: '🏷️' },
    ],
  },
  {
    id: 'research',
    label: '調査',
    emoji: '🔬',
    description: '参考文献やキーワードを伴う調査ノート',
    templateName: 'research',
    relations: [
      { key: 'type', label: 'タイプ', kind: 'text', defaultValue: 'research' },
      { key: 'date', label: '作成日', kind: 'date', emoji: '📅' },
      { key: 'source', label: '引用元', kind: 'longtext', emoji: '📚' },
      { key: 'keywords', label: 'キーワード', kind: 'tags', emoji: '🔑' },
      { key: 'rating', label: '評価', kind: 'rating', emoji: '⭐' },
      { key: 'tags', label: 'タグ', kind: 'tags', emoji: '🏷️' },
    ],
  },
  {
    id: 'experiment',
    label: '実験',
    emoji: '🧪',
    description: '機械学習・計算研究の実験ログ。再現性パッケージ生成可能',
    templateName: 'experiment',
    relations: [
      { key: 'type', label: 'タイプ', kind: 'text', defaultValue: 'experiment' },
      {
        key: 'status',
        label: 'ステータス',
        kind: 'status',
        options: ['planning', 'running', 'success', 'failed'],
        defaultValue: 'planning',
        emoji: '📊',
      },
      { key: 'dataset', label: 'データセット', kind: 'text', emoji: '🗂' },
      { key: 'model', label: 'モデル', kind: 'text', emoji: '🤖' },
      { key: 'seed', label: 'Seed', kind: 'number', emoji: '🎲' },
      { key: 'git_sha', label: 'git SHA', kind: 'text', emoji: '⌥' },
      { key: 'hardware', label: 'ハードウェア', kind: 'text', emoji: '💻' },
      { key: 'tags', label: 'タグ', kind: 'tags', emoji: '🏷️' },
    ],
  },
  {
    id: 'memo',
    label: 'メモ',
    emoji: '🗒️',
    description: '短いメモ・雑記',
    templateName: 'memo',
    relations: [
      { key: 'type', label: 'タイプ', kind: 'text', defaultValue: 'memo' },
      { key: 'created', label: '作成', kind: 'text' },
      { key: 'tags', label: 'タグ', kind: 'tags', emoji: '🏷️' },
      { key: 'color', label: '色', kind: 'select', options: CARD_COLOR_IDS },
    ],
  },
  {
    id: 'daily',
    label: 'デイリー',
    emoji: '📅',
    description: '今日のノート（科目別の日次）',
    templateName: 'daily',
    relations: [
      { key: 'type', label: 'タイプ', kind: 'text', defaultValue: 'daily' },
      { key: 'subject', label: '科目', kind: 'text' },
      { key: 'date', label: '日付', kind: 'date' },
      { key: 'tags', label: 'タグ', kind: 'tags' },
    ],
  },
  {
    id: 'subject',
    label: '科目概要',
    emoji: '📋',
    description: '科目のトップページ',
    templateName: 'subject',
    relations: [
      { key: 'type', label: 'タイプ', kind: 'text', defaultValue: 'subject' },
      { key: 'subject', label: '科目', kind: 'text' },
      { key: 'teacher', label: '担当教員', kind: 'text' },
      { key: 'tags', label: 'タグ', kind: 'tags' },
    ],
  },
  {
    id: 'free',
    label: 'フリー',
    emoji: '📄',
    description: 'タイプを設定しない自由なノート',
    templateName: '',
    relations: [
      { key: 'tags', label: 'タグ', kind: 'tags' },
    ],
  },
];

export function getObjectType(id: ObjectTypeId | string | undefined): ObjectTypeDef | null {
  if (!id) return null;
  return OBJECT_TYPES.find((t) => t.id === id) ?? null;
}

export const DEFAULT_TEMPLATES: Record<string, string> = {
  lecture: `---
type: lecture
subject: {{subject}}
date: {{date}}
teacher:
chapter:
tags: []
status: 受講中
---

# {{title}}

## 今日のテーマ

## 重要ポイント
-

## 例題・演習

## 復習する所
-

## 関連資料

`,
  summary: `---
type: summary
subject: {{subject}}
date: {{date}}
source:
completion: 下書き
tags: []
---

# {{title}} — 要約

## 一言まとめ

## 構造
-

## 重要キーワード
-

## 自分の言葉での再説明

## 不明点・疑問

`,
  review: `---
type: review
subject: {{subject}}
reviewDate:
understanding: 0
cards: 0
tags: []
---

# {{title}} — 復習

## 思い出せたこと
-

## 思い出せなかったこと
-

## 次までに

`,
  research: `---
type: research
date: {{date}}
source:
keywords: []
rating: 0
tags: []
---

# {{title}}

## 動機・問い

## 参考文献
-

## 発見・整理

## 結論

`,
  experiment: `---
type: experiment
status: planning
dataset:
model:
seed: 42
git_sha:
hardware:
hyperparams: {}
tags: []
startedAt: {{date}}
metrics: []
---

# {{title}}

## 仮説

(成功条件を数値で書く)

## セットアップメモ

`,
  memo: `---
type: memo
created: {{date}}
tags: []
---

`,
  daily: `---
type: daily
subject: {{subject}}
date: {{date}}
tags: []
---

# {{date}} {{subject}}

## 内容

## 関連資料

`,
  subject: `# {{subject}} 概要

## 科目について
(担当の先生、教科書、評価方法などをここにメモ)

## 学習目標
-

## 重要キーワード
-
`,
};
