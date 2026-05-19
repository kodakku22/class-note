// Numeric / string constants used across the main process. Centralised so
// that tweaks (raising backup retention, capping log size) happen in one
// place instead of being scattered across handlers.

export const MAX_SEARCH_RESULTS = 100;
export const MAX_NOTE_PREVIEW = 3000; // chars
export const MAX_QA_LOG = 50_000; // chars
export const MAX_PROMPT_LENGTH = 3000; // chars for Claude CLI argv & prompt embedding
export const BACKUP_KEEP = 10; // versions kept in .history/

export const VAULT_NOTE_EXTS = ['.md', '.markdown'] as const;
export const ATTACHMENT_IMAGE_EXTS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.svg',
] as const;
export const ATTACHMENT_PDF_EXTS = ['.pdf'] as const;
export const OFFICE_EXTS = ['.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx'] as const;

export const RESERVED_TOP_DIRS = [
  '.obsidian',
  '.classnotes',
  '.history',
  '_templates',
  'Books',
  'Memos',
] as const;
