// Runtime validation schemas for persisted JSON. Backed by Zod.
//
// Use parse() at the IPC boundary to ensure incoming/outgoing data matches
// the expected shape. For Settings we use safeParse + fallback so a corrupt
// file does not crash the app.
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const AiProviderSchema = z.enum(['openai', 'gemini', 'claude', 'none']);
export type AiProvider = z.infer<typeof AiProviderSchema>;

export const AiAuthModeSchema = z.enum(['api-key', 'login']);
export type AiAuthMode = z.infer<typeof AiAuthModeSchema>;

export const DEFAULT_AI_MODELS = {
  openai: 'gpt-5.5',
  gemini: 'gemini-3.1-pro-preview',
  claudeApi: 'claude-sonnet-4-6',
  claudeLogin: 'sonnet',
} as const;

export const AiModelSettingsSchema = z
  .object({
    openai: z.string().default(DEFAULT_AI_MODELS.openai),
    gemini: z.string().default(DEFAULT_AI_MODELS.gemini),
    claudeApi: z.string().default(DEFAULT_AI_MODELS.claudeApi),
    claudeLogin: z.string().default(DEFAULT_AI_MODELS.claudeLogin),
  })
  .default(DEFAULT_AI_MODELS);

export type AiModelSettings = z.infer<typeof AiModelSettingsSchema>;

function migrateAiSettings(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const input = { ...(value as Record<string, unknown>) };
  const existingModels =
    input.aiModels && typeof input.aiModels === 'object' && !Array.isArray(input.aiModels)
      ? (input.aiModels as Record<string, unknown>)
      : {};
  const models: Record<string, unknown> = { ...DEFAULT_AI_MODELS, ...existingModels };

  if (typeof input.aiApiModel === 'string' && input.aiApiModel.trim()) {
    models.claudeApi = input.aiApiModel;
  }
  if (typeof input.model === 'string' && ['opus', 'sonnet', 'haiku'].includes(input.model)) {
    models.claudeLogin = input.model;
  }

  if (input.aiProvider === 'claude-cli') {
    input.aiProvider = 'claude';
    input.aiAuthMode = 'login';
  } else if (input.aiProvider === 'anthropic-api') {
    input.aiProvider = 'claude';
    input.aiAuthMode = 'api-key';
  } else if (
    input.aiProvider !== 'openai' &&
    input.aiProvider !== 'gemini' &&
    input.aiProvider !== 'claude' &&
    input.aiProvider !== 'none'
  ) {
    delete input.aiProvider;
  }

  input.aiModels = models;
  if (!input.aiApiModel && typeof models.claudeApi === 'string') {
    input.aiApiModel = models.claudeApi;
  }
  return input;
}

const SettingsObjectSchema = z.object({
  model: z.string().default('opus'),
  effort: z.string().default('xhigh'),
  theme: z.enum(['light', 'dark']).default('light'),
  recentVaults: z.array(z.string()).default([]),
  uiMode: z.enum(['simple', 'custom', 'full']).default('simple'),
  railItems: z.array(z.string()).default(['subjects', 'daily', 'timetable', 'books']),
  railCommandIds: z.array(z.string()).default([]),
  // AI selection is global. Legacy `claude-cli` / `anthropic-api` values are
  // migrated by `migrateAiSettings` before validation.
  aiProvider: AiProviderSchema.default('claude'),
  aiAuthMode: AiAuthModeSchema.default('login'),
  aiModels: AiModelSettingsSchema,
  // Kept as a compatibility field for old renderer/preload callers. New code
  // uses `aiModels.claudeApi`.
  aiApiModel: z.string().default(DEFAULT_AI_MODELS.claudeApi),
  // Track whether the first-launch onboarding wizard has been seen.
  onboardingCompleted: z.boolean().default(false),
  // Locale override (null = follow system locale).
  locale: z.enum(['ja', 'en']).nullable().default(null),
  // Telemetry / crash reporting opt-in. Default OFF — user must consent.
  telemetryEnabled: z.boolean().default(false),
  // DocAI hard cap on per-file size (MB). Files above this are rejected
  // before being loaded into memory to prevent OOM. Range: 1–500MB.
  docaiMaxFileSizeMB: z.number().int().min(1).max(500).default(50),
  // Phase 3-G: Offline mode. When true, runPrompt() short-circuits before
  // any network call so users can confidently work in air-gapped environments
  // without accidentally hitting an external API.
  offlineMode: z.boolean().default(false),
  // Phase 4 (N-1): Window bounds persistence so the app reopens at the
  // same size + position on the same monitor. Validated as a sane rectangle
  // (positive width/height); off-screen restoration is guarded at the
  // call site in main.ts via display intersection checks.
  windowBounds: z
    .object({
      x: z.number().int(),
      y: z.number().int(),
      width: z.number().int().min(400).max(10000),
      height: z.number().int().min(300).max(10000),
    })
    .nullable()
    .default(null),
  windowMaximized: z.boolean().default(false),
});

export const SettingsSchema = z.preprocess(migrateAiSettings, SettingsObjectSchema);

export type Settings = z.infer<typeof SettingsSchema>;

// ---------------------------------------------------------------------------
// Timetable
// ---------------------------------------------------------------------------

export const TimetableSchema = z.object({
  days: z.array(z.string()).default(['月', '火', '水', '木', '金']),
  periods: z.number().int().min(1).max(20).default(6),
  cells: z.record(z.string(), z.string()).default({}),
});

export type Timetable = z.infer<typeof TimetableSchema>;

// ---------------------------------------------------------------------------
// Object types (Stage 4-β)
// ---------------------------------------------------------------------------

export const ObjectTypeSchema = z.enum([
  'lecture',
  'summary',
  'review',
  'research',
  'memo',
  'daily',
  'subject',
]);
export type ObjectType = z.infer<typeof ObjectTypeSchema>;

// ---------------------------------------------------------------------------
// Note frontmatter (loose: any extra keys are allowed, only typed ones are validated)
// ---------------------------------------------------------------------------

export const NoteFrontmatterSchema = z
  .object({
    title: z.string().optional(),
    type: ObjectTypeSchema.optional(),
    date: z.string().optional(),
    subject: z.string().optional(),
    tags: z.union([z.array(z.string()), z.string()]).optional(),
    rating: z.number().optional(),
    status: z.string().optional(),
    color: z.string().optional(),
    pinned: z.boolean().optional(),
    cover: z.string().optional(),
    icon: z.string().optional(),
  })
  .passthrough();

export type NoteFrontmatter = z.infer<typeof NoteFrontmatterSchema>;

// ---------------------------------------------------------------------------
// Papers (Phase 1 — 論文・文献管理)
// ---------------------------------------------------------------------------
//
// Papers live under <vault>/Papers/<safe-title>.md, distinct from Books.
// They carry rich academic metadata (authors, venue, year, DOI/arXiv, bibkey)
// suitable for citation managers and AI-driven cross-referencing.
//
// Status values reflect the paper-reading lifecycle:
//   - to-read: queued
//   - reading: actively reading
//   - read: finished a 3-pass read
//   - cited: cited in own work
//   - skimmed: 1-pass only

export const PaperStatusSchema = z.enum([
  'to-read',
  'reading',
  'read',
  'cited',
  'skimmed',
]);
export type PaperStatus = z.infer<typeof PaperStatusSchema>;

export const PaperFrontmatterSchema = z
  .object({
    title: z.string().optional(),
    type: z.literal('paper').default('paper'),
    /** Citation key, e.g. "vaswani2017attention". Used for [@key] inserts. */
    bibkey: z.string().optional(),
    /** Free-form list of authors. First author convention: "Vaswani et al." */
    authors: z.union([z.array(z.string()), z.string()]).optional(),
    year: z.number().int().optional(),
    venue: z.string().optional(),
    doi: z.string().optional(),
    arxiv: z.string().optional(),
    url: z.string().optional(),
    pdf: z.string().optional(),
    status: PaperStatusSchema.optional(),
    rating: z.number().min(0).max(5).optional(),
    tags: z.union([z.array(z.string()), z.string()]).optional(),
    /** Date added to the vault (ISO 8601). */
    addedAt: z.string().optional(),
    /** Auto-summary generated by the AI agent (short, 1-3 sentences). */
    summary: z.string().optional(),
  })
  .passthrough();

export type PaperFrontmatter = z.infer<typeof PaperFrontmatterSchema>;
