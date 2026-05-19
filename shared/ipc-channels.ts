// Single source of truth for all IPC channel names.
// Both the main process (`electron/ipc/*`) and the preload bridge
// (`electron/preload.ts`) reference these constants instead of magic strings.

export const IPC = {
  // Vault
  VAULT_INIT: 'vault:init',
  VAULT_LIST_SUBJECTS: 'vault:listSubjects',
  VAULT_CREATE_SUBJECT: 'vault:createSubject',
  VAULT_LIST_FILES: 'vault:listFiles',
  VAULT_READ_NOTE: 'vault:readNote',
  VAULT_WRITE_NOTE: 'vault:writeNote',
  VAULT_TODAYS_NOTE: 'vault:createTodaysNote',
  VAULT_DAILY_NOTES: 'vault:listDailyNotes',
  VAULT_RENAME_NOTE: 'vault:renameNote',
  VAULT_LIST_TEMPLATES: 'vault:listTemplates',
  VAULT_READ_TEMPLATE: 'vault:readTemplate',
  VAULT_WRITE_TEMPLATE: 'vault:writeTemplate',
  VAULT_DELETE_TEMPLATE: 'vault:deleteTemplate',
  VAULT_GRAPH_DATA: 'vault:graphData',
  VAULT_DELETE_SUBJECT: 'vault:deleteSubject',
  VAULT_RENAME_SUBJECT: 'vault:renameSubject',

  // Materials
  MATERIALS_ADD: 'materials:addFiles',

  // Search
  SEARCH_QUERY: 'search:query',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',

  // Timetable
  TIMETABLE_READ: 'timetable:read',
  TIMETABLE_WRITE: 'timetable:write',

  // Books
  BOOKS_LIST: 'books:list',
  BOOKS_CREATE: 'books:create',
  BOOKS_UPDATE_META: 'books:updateMeta',
  BOOKS_DELETE: 'books:delete',
  BOOKS_GET_READING_NOTE: 'books:getReadingNote',
  BOOKS_APPEND_READING_NOTE: 'books:appendReadingNote',
  BOOKS_WRITE_READING_NOTE: 'books:writeReadingNote',

  // Wiki / Outputs (Second Brain)
  WIKI_LIST: 'wiki:list',
  WIKI_READ: 'wiki:read',
  WIKI_WRITE: 'wiki:write',
  WIKI_READ_INDEX: 'wiki:readIndex',
  WIKI_SAVE_OUTPUT: 'wiki:saveOutput',
  WIKI_COLLECT_RAW: 'wiki:collectRaw',
  WIKI_GET_SCHEMA: 'wiki:getSchema',
  WIKI_SET_SCHEMA: 'wiki:setSchema',
  WIKI_COMPILE: 'wiki:compile',
  WIKI_HEALTH_CHECK: 'wiki:healthCheck',
  WIKI_IMPORT_FROM_QA_LOGS: 'wiki:importFromQALogs',
  OUTPUTS_LIST: 'outputs:list',

  // Memos
  MEMOS_LIST: 'memos:list',
  MEMOS_CREATE: 'memos:create',
  MEMOS_UPDATE: 'memos:update',
  MEMOS_DELETE: 'memos:delete',

  // Links / Backlinks
  LINKS_LIST_TARGETS: 'links:listTargets',
  LINKS_BACKLINKS: 'links:backlinks',

  // Attachments
  ATTACHMENTS_PICK: 'attachments:pick',
  ATTACHMENTS_SAVE_IMAGE: 'attachments:saveImage',
  ATTACHMENTS_DROP_FILES: 'attachments:dropFiles',
  ATTACHMENTS_INDEX: 'attachments:index',

  // Q&A
  QA_READ_LOG: 'qa:readLog',
  QA_STATUS: 'qa:status',
  QA_LOGIN: 'qa:login',
  QA_ASK: 'qa:ask',
  QA_CHUNK: 'qa:chunk',
  QA_DONE: 'qa:done',
  QA_ERROR: 'qa:error',

  // Watcher
  WATCHER_START: 'watcher:start',
  WATCHER_STOP: 'watcher:stop',
  VAULT_CHANGED: 'vault:changed',

  // Shell
  SHELL_OPEN_EXTERNAL: 'shell:openExternal',
  SHELL_OPEN_URL: 'shell:openUrl',
  SHELL_REVEAL_IN_FOLDER: 'shell:revealInFolder',

  // Dialog
  DIALOG_PICK_FOLDER: 'dialog:pickFolder',

  // Export (added in Stage 9)
  EXPORT_TO_PDF: 'export:toPdf',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
