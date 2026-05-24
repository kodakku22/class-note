import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';

export type FileEntry = {
  name: string;
  path: string;
  kind: 'note' | 'pdf' | 'image' | 'office' | 'other';
  ext: string;
  mtime: number;
};

export type SearchHit = {
  subject: string;
  filePath: string;
  fileName: string;
  snippet: string;
};

export type FileAccessGrant = {
  token: string;
  fileName: string;
  size: number;
};

type AiProvider = 'openai' | 'gemini' | 'claude' | 'none';
type AiAuthMode = 'api-key' | 'login';
type AiModelSettings = {
  openai: string;
  gemini: string;
  claudeApi: string;
  claudeLogin: string;
};

const api = {
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickFolder'),

  appWindow: {
    minimize: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('window:minimize'),
    toggleMaximize: (): Promise<{ ok: boolean; maximized: boolean }> =>
      ipcRenderer.invoke('window:toggleMaximize'),
    isMaximized: (): Promise<{ ok: boolean; maximized: boolean }> =>
      ipcRenderer.invoke('window:isMaximized'),
    close: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('window:close'),
  },

  vault: {
    init: (basePath: string): Promise<{ vaultPath: string }> =>
      ipcRenderer.invoke('vault:init', basePath),
    listSubjects: (vaultPath: string): Promise<string[]> =>
      ipcRenderer.invoke('vault:listSubjects', vaultPath),
    createSubject: (vaultPath: string, name: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('vault:createSubject', vaultPath, name),
    listFiles: (vaultPath: string, subject: string): Promise<{ notes: FileEntry[]; materials: FileEntry[] }> =>
      ipcRenderer.invoke('vault:listFiles', vaultPath, subject),
    listFilesEnriched: (
      vaultPath: string,
      subject: string
    ): Promise<{
      notes: Array<FileEntry & { meta?: Record<string, unknown>; preview?: string }>;
      materials: Array<FileEntry & { meta?: Record<string, unknown>; preview?: string }>;
    }> => ipcRenderer.invoke('vault:listFilesEnriched', vaultPath, subject),
    readNote: (filePath: string): Promise<string> =>
      ipcRenderer.invoke('vault:readNote', filePath),
    readNoteWithMtime: (filePath: string): Promise<{ content: string; mtime: number }> =>
      ipcRenderer.invoke('vault:readNoteWithMtime', filePath),
    writeNote: (
      filePath: string,
      content: string,
      expectedMtime?: number,
      expectedHash?: string
    ): Promise<{
      ok: boolean;
      conflict?: boolean;
      currentMtime?: number;
      currentContent?: string;
      currentHash?: string;
    }> => ipcRenderer.invoke('vault:writeNote', filePath, content, expectedMtime, expectedHash),
    createTodaysNote: (vaultPath: string, subject: string): Promise<{ filePath: string; created: boolean }> =>
      ipcRenderer.invoke('vault:createTodaysNote', vaultPath, subject),
    createTypedNote: (
      vaultPath: string,
      subject: string | null,
      templateName: string,
      title: string,
      defaultBody: string
    ): Promise<{ filePath: string; created: boolean }> =>
      ipcRenderer.invoke('vault:createTypedNote', vaultPath, subject, templateName, title, defaultBody),
    listDailyNotes: (vaultPath: string, date?: string) =>
      ipcRenderer.invoke('vault:listDailyNotes', vaultPath, date),
    renameNote: (vaultPath: string, oldPath: string, newName: string) =>
      ipcRenderer.invoke('vault:renameNote', vaultPath, oldPath, newName),
    listTemplates: (vaultPath: string) =>
      ipcRenderer.invoke('vault:listTemplates', vaultPath),
    readTemplate: (vaultPath: string, name: string) =>
      ipcRenderer.invoke('vault:readTemplate', vaultPath, name),
    writeTemplate: (vaultPath: string, name: string, content: string) =>
      ipcRenderer.invoke('vault:writeTemplate', vaultPath, name, content),
    deleteTemplate: (vaultPath: string, name: string) =>
      ipcRenderer.invoke('vault:deleteTemplate', vaultPath, name),
    graphData: (vaultPath: string) => ipcRenderer.invoke('vault:graphData', vaultPath),
    readBoard: (vaultPath: string, subject: string) =>
      ipcRenderer.invoke('vault:readBoard', vaultPath, subject),
    writeBoard: (vaultPath: string, subject: string, board: unknown) =>
      ipcRenderer.invoke('vault:writeBoard', vaultPath, subject, board),
    deleteSubject: (vaultPath: string, subject: string) =>
      ipcRenderer.invoke('vault:deleteSubject', vaultPath, subject),
    renameSubject: (vaultPath: string, oldName: string, newName: string) =>
      ipcRenderer.invoke('vault:renameSubject', vaultPath, oldName, newName),
    installSample: (vaultPath: string): Promise<{ ok: boolean; created: number }> =>
      ipcRenderer.invoke('vault:installSample', vaultPath),
    deleteNote: (filePath: string): Promise<{ ok: boolean; trashedTo?: string; error?: string }> =>
      ipcRenderer.invoke('vault:deleteNote', filePath),
    duplicateNote: (filePath: string): Promise<{ ok: boolean; newPath?: string; error?: string }> =>
      ipcRenderer.invoke('vault:duplicateNote', filePath),
  },

  exporter: {
    toPdf: (sourcePath?: string) => ipcRenderer.invoke('export:toPdf', sourcePath),
    toHtml: (sourcePath?: string) => ipcRenderer.invoke('export:toHtml', sourcePath),
  },

  materials: {
    addFiles: (vaultPath: string, subject: string, srcPaths: string[]): Promise<{ added: string[] }> =>
      ipcRenderer.invoke('materials:addFiles', vaultPath, subject, srcPaths),
    openExternal: (filePath: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('shell:openExternal', filePath),
    revealInFolder: (filePath: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('shell:revealInFolder', filePath),
    openUrl: (url: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('shell:openUrl', url),
    openLogDir: (): Promise<{ ok: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke('shell:openLogDir'),
  },

  log: {
    write: (
      level: 'debug' | 'info' | 'warn' | 'error',
      message: string,
      meta?: Record<string, unknown>
    ): Promise<{ ok: boolean }> => ipcRenderer.invoke('log:write', level, message, meta),
  },

  diagnostics: {
    export: (): Promise<{ ok: boolean; filePath?: string; error?: string }> =>
      ipcRenderer.invoke('diagnostics:export'),
  },

  vaultSafety: {
    audit: (vaultPath: string) => ipcRenderer.invoke('vaultSafety:audit', vaultPath),
    createBackup: (vaultPath: string) => ipcRenderer.invoke('vaultSafety:createBackup', vaultPath),
    listBackups: (vaultPath: string) => ipcRenderer.invoke('vaultSafety:listBackups', vaultPath),
  },

  telemetry: {
    /** Track an anonymous usage event. No-op if the user hasn't opted in. */
    track: (type: 'vault_opened' | 'note_created' | 'wiki_compiled' | 'qa_asked') =>
      ipcRenderer.invoke('telemetry:track', type),
  },

  update: {
    /** Manual check for updates. */
    check: (): Promise<{ ok: boolean; version?: string; error?: string }> =>
      ipcRenderer.invoke('update:check'),
    /** Quit and install a downloaded update. */
    install: (): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('update:install'),
    /** Subscribe to "update available" events. Returns unsubscribe fn. */
    onAvailable: (cb: (info: { version: string }) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, info: { version: string }) =>
        cb(info);
      ipcRenderer.on('update:available', handler);
      return () => ipcRenderer.removeListener('update:available', handler);
    },
    /** Subscribe to "update downloaded" events. */
    onDownloaded: (cb: (info: { version: string }) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, info: { version: string }) =>
        cb(info);
      ipcRenderer.on('update:downloaded', handler);
      return () => ipcRenderer.removeListener('update:downloaded', handler);
    },
  },

  search: {
    query: (vaultPath: string, keyword: string): Promise<SearchHit[]> =>
      ipcRenderer.invoke('search:query', vaultPath, keyword),
  },

  index: {
    status: (
      vaultPath: string
    ): Promise<{ ready: boolean; fileCount: number; builtAt?: string }> =>
      ipcRenderer.invoke('index:status', vaultPath),
    rebuild: (
      vaultPath: string
    ): Promise<{ ok: boolean; fileCount?: number; error?: string }> =>
      ipcRenderer.invoke('index:rebuild', vaultPath),
  },

  watcher: {
    start: (vaultPath: string) => ipcRenderer.invoke('watcher:start', vaultPath),
    stop: () => ipcRenderer.invoke('watcher:stop'),
    onChanged: (cb: (payload: { event: string; file: string }) => void) => {
      const listener = (_e: unknown, payload: { event: string; file: string }) => cb(payload);
      ipcRenderer.on('vault:changed', listener);
      return () => ipcRenderer.removeListener('vault:changed', listener);
    },
  },

  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (partial: {
      model?: string;
      effort?: string;
      theme?: 'light' | 'dark';
      recentVaults?: string[];
      uiMode?: 'simple' | 'custom' | 'full';
      railItems?: string[];
      railCommandIds?: string[];
      aiProvider?: AiProvider | 'claude-cli' | 'anthropic-api';
      aiAuthMode?: AiAuthMode;
      aiModels?: Partial<AiModelSettings>;
      aiApiModel?: string;
      onboardingCompleted?: boolean;
      locale?: 'ja' | 'en' | null;
      telemetryEnabled?: boolean;
    }) => ipcRenderer.invoke('settings:set', partial),
    getAiConfig: (): Promise<{
      provider: AiProvider;
      authMode: AiAuthMode;
      model: string;
      models: AiModelSettings;
    }> => ipcRenderer.invoke('settings:getAiConfig'),

    /** Phase 4 (S-A): catalogue of all known models with deprecation badges. */
    getModelCatalogue: (): Promise<{
      models: Array<{
        id: string;
        label: string;
        sub: string;
        deprecation?: {
          since: string;
          removeOn: string | null;
          replacement?: string;
          note: string;
        };
        severity?: 'past' | 'imminent' | 'scheduled' | 'announced';
      }>;
    }> => ipcRenderer.invoke('settings:getModelCatalogue'),

    /** Phase 4 (S-A): is the currently-selected model deprecated? Returns
     * null severity if not deprecated. Renderer can surface this at startup. */
    checkSelectedModelDeprecation: (): Promise<{
      modelId: string;
      deprecation: {
        since: string;
        removeOn: string | null;
        replacement?: string;
        note: string;
      } | null;
      severity: 'past' | 'imminent' | 'scheduled' | 'announced' | null;
    }> => ipcRenderer.invoke('settings:checkSelectedModelDeprecation'),
    setAiConfig: (partial: {
      provider?: AiProvider;
      authMode?: AiAuthMode;
      model?: string;
      models?: Partial<AiModelSettings>;
    }): Promise<{
      ok: boolean;
      config?: { provider: AiProvider; authMode: AiAuthMode; model: string; models: AiModelSettings };
      error?: string;
    }> => ipcRenderer.invoke('settings:setAiConfig', partial),
    getProviderAuthStatus: (
      provider?: AiProvider
    ): Promise<{
      ok: boolean;
      providers: Record<
        Exclude<AiProvider, 'none'>,
        {
          provider: Exclude<AiProvider, 'none'>;
          apiKeyConfigured: boolean;
          login: { installed: boolean; loggedIn: boolean; path?: string; error?: string };
        }
      >;
    }> => ipcRenderer.invoke('settings:getProviderAuthStatus', provider),
    setProviderApiKey: (
      provider: Exclude<AiProvider, 'none'>,
      key: string
    ): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('settings:setProviderApiKey', provider, key),
    clearProviderApiKey: (
      provider: Exclude<AiProvider, 'none'>
    ): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('settings:clearProviderApiKey', provider),
    loginProvider: (provider: Exclude<AiProvider, 'none'>): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('settings:loginProvider', provider),
    // API key endpoints — the renderer never reads the key back, it only
    // learns whether one is set. Storage lives in OS-level safeStorage.
    hasApiKey: (): Promise<{ ok: boolean; present: boolean }> =>
      ipcRenderer.invoke('settings:hasApiKey'),
    setApiKey: (key: string): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke('settings:setApiKey', key),
    clearApiKey: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('settings:clearApiKey'),
    /** Try a 30-second tiny prompt against the configured provider. */
    testProvider: (
      provider?: AiProvider,
      authMode?: AiAuthMode
    ): Promise<{ ok: boolean; response?: string; error?: string }> =>
      ipcRenderer.invoke('settings:testProvider', provider, authMode),
  },

  timetable: {
    read: (vaultPath: string) => ipcRenderer.invoke('timetable:read', vaultPath),
    write: (vaultPath: string, t: unknown) => ipcRenderer.invoke('timetable:write', vaultPath, t),
  },

  books: {
    list: (vaultPath: string) => ipcRenderer.invoke('books:list', vaultPath),
    create: (vaultPath: string, title: string, author?: string) =>
      ipcRenderer.invoke('books:create', vaultPath, title, author),
    updateMeta: (filePath: string, meta: Record<string, unknown>) =>
      ipcRenderer.invoke('books:updateMeta', filePath, meta),
    delete: (filePath: string) => ipcRenderer.invoke('books:delete', filePath),
    getReadingNote: (
      bookFilePath: string
    ): Promise<{ content: string; notePath: string }> =>
      ipcRenderer.invoke('books:getReadingNote', bookFilePath),
    appendReadingNote: (
      bookFilePath: string,
      text: string
    ): Promise<{ ok: boolean; notePath?: string; error?: string }> =>
      ipcRenderer.invoke('books:appendReadingNote', bookFilePath, text),
    writeReadingNote: (
      bookFilePath: string,
      content: string
    ): Promise<{ ok: boolean; notePath?: string }> =>
      ipcRenderer.invoke('books:writeReadingNote', bookFilePath, content),
  },

  latex: {
    /** Probe the local pandoc binary. */
    detectPandoc: (): Promise<{ ok: boolean; path?: string }> =>
      ipcRenderer.invoke('latex:detectPandoc'),
    listStyles: (): Promise<('neurips' | 'acl' | 'ieee' | 'generic')[]> =>
      ipcRenderer.invoke('latex:listStyles'),
    /** Export the given Markdown note to a .tex bundle in Outputs/. */
    exportNote: (
      vaultPath: string,
      filePath: string,
      style: 'neurips' | 'acl' | 'ieee' | 'generic'
    ): Promise<{
      ok: boolean;
      outputDir?: string;
      texPath?: string;
      usedPandoc?: boolean;
      error?: string;
    }> => ipcRenderer.invoke('latex:exportNote', vaultPath, filePath, style),
  },

  skills: {
    /** Detect whether the Obsidian Skills CLI is on PATH. */
    detectObsidian: (): Promise<{ ok: boolean; path?: string; version?: string }> =>
      ipcRenderer.invoke('skills:detectObsidian'),
    /** Force re-detection (use after the user installs). */
    redetectObsidian: () => ipcRenderer.invoke('skills:redetectObsidian'),
    /** Run analysis through the Obsidian CLI (if detected). */
    analyzeWithObsidianCLI: (
      vaultPath: string
    ): Promise<{ ok: boolean; output?: string; error?: string }> =>
      ipcRenderer.invoke('skills:analyzeWithObsidianCLI', vaultPath),
    interopReport: (vaultPath: string) =>
      ipcRenderer.invoke('skills:interopReport', vaultPath),
  },

  web: {
    /** Clip a URL into <vault>/Web/. Uses Defuddle for clean extraction. */
    clip: (
      vaultPath: string,
      url: string
    ): Promise<
      | { ok: true; filePath: string; title: string; byline?: string; wordCount: number }
      | { ok: false; error: string }
    > => ipcRenderer.invoke('web:clip', vaultPath, url),
  },

  ai: {
    /**
     * Summarize the note. Returns the structured 3-pass result (preview-only;
     * no disk writes). Use `summarizeAndApply` to also write back.
     */
    summarize: (filePath: string) => ipcRenderer.invoke('ai:summarize', filePath),
    summarizeAndApply: (filePath: string) =>
      ipcRenderer.invoke('ai:summarizeAndApply', filePath),
    autoTag: (filePath: string) => ipcRenderer.invoke('ai:autoTag', filePath),
    applyTags: (filePath: string, tags: string[]) =>
      ipcRenderer.invoke('ai:applyTags', filePath, tags),
    optimizeMarkdown: (filePath: string) =>
      ipcRenderer.invoke('ai:optimizeMarkdown', filePath),
    generateCanvas: (filePath: string) =>
      ipcRenderer.invoke('ai:generateCanvas', filePath),
    learningCoach: (filePath: string, kind?: 'book' | 'paper' | 'lecture') =>
      ipcRenderer.invoke('ai:learningCoach', filePath, kind),
    learningCoachAndSave: (filePath: string, kind?: 'book' | 'paper' | 'lecture') =>
      ipcRenderer.invoke('ai:learningCoachAndSave', filePath, kind),
    analyzeVault: (vaultPath: string) =>
      ipcRenderer.invoke('ai:analyzeVault', vaultPath),
  },

  research: {
    getDashboard: (vaultPath: string) =>
      ipcRenderer.invoke('research:getDashboard', vaultPath),
    reproducibilityReport: (vaultPath: string) =>
      ipcRenderer.invoke('research:reproducibilityReport', vaultPath),
    listDeadlines: (vaultPath: string) =>
      ipcRenderer.invoke('research:listDeadlines', vaultPath),
    saveDeadlines: (vaultPath: string, deadlines: unknown[]) =>
      ipcRenderer.invoke('research:saveDeadlines', vaultPath, deadlines),
  },

  plugins: {
    list: (vaultPath: string) => ipcRenderer.invoke('plugins:list', vaultPath),
    runCommand: (vaultPath: string, pluginId: string, commandId: string) =>
      ipcRenderer.invoke('plugins:runCommand', vaultPath, pluginId, commandId),
    getViewUrl: (vaultPath: string, pluginId: string, viewId: string) =>
      ipcRenderer.invoke('plugins:getViewUrl', vaultPath, pluginId, viewId),
  },

  papers: {
    list: (vaultPath: string) => ipcRenderer.invoke('papers:list', vaultPath),
    create: (
      vaultPath: string,
      input: {
        title: string;
        bibkey?: string;
        authors?: string[];
        year?: number;
        venue?: string;
        doi?: string;
        arxiv?: string;
        url?: string;
        tags?: string[];
        status?: string;
      }
    ) => ipcRenderer.invoke('papers:create', vaultPath, input),
    updateMeta: (filePath: string, meta: Record<string, unknown>) =>
      ipcRenderer.invoke('papers:updateMeta', filePath, meta),
    delete: (filePath: string) => ipcRenderer.invoke('papers:delete', filePath),
    getReadingNote: (paperFilePath: string) =>
      ipcRenderer.invoke('papers:getReadingNote', paperFilePath),
    appendReadingNote: (paperFilePath: string, text: string) =>
      ipcRenderer.invoke('papers:appendReadingNote', paperFilePath, text),
    /** Phase 2: import via arXiv ID or URL. */
    importFromArxiv: (
      vaultPath: string,
      idOrUrl: string
    ): Promise<{ ok: boolean; filePath?: string; bibkey?: string; title?: string; error?: string }> =>
      ipcRenderer.invoke('papers:importFromArxiv', vaultPath, idOrUrl),
    /** Phase 2: import via DOI (Crossref). */
    importFromDOI: (
      vaultPath: string,
      doi: string
    ): Promise<{ ok: boolean; filePath?: string; bibkey?: string; title?: string; error?: string }> =>
      ipcRenderer.invoke('papers:importFromDOI', vaultPath, doi),
    /** Phase 2: aggregate frontmatter into <vault>/Papers/refs.bib. */
    exportBibtex: (
      vaultPath: string
    ): Promise<{ ok: boolean; filePath?: string; count?: number; skipped?: number; error?: string }> =>
      ipcRenderer.invoke('papers:exportBibtex', vaultPath),
    /** Import Zotero / Better BibTeX .bib files into Papers/*.md. */
    pickBibtexFile: (): Promise<FileAccessGrant | null> =>
      ipcRenderer.invoke('papers:pickBibtexFile'),
    importFromBibtex: (
      vaultPath: string,
      token: string
    ): Promise<{ ok: boolean; imported: number; skipped: number; errors: string[]; filePaths: string[] }> =>
      ipcRenderer.invoke('papers:importFromBibtex', vaultPath, token),
    /** Phase 2: short list for the citation picker. */
    listForCitation: (
      vaultPath: string
    ): Promise<{ bibkey: string; title: string; authors: string; year: number | null }[]> =>
      ipcRenderer.invoke('papers:listForCitation', vaultPath),
    /** Phase 3: open a system file picker for PDFs. */
    pickPDFFile: (): Promise<FileAccessGrant | null> => ipcRenderer.invoke('papers:pickPDFFile'),
    /** Phase 3: import a paper from a local PDF through the selected AI provider. */
    importFromPDF: (
      vaultPath: string,
      token: string
    ): Promise<{ ok: boolean; filePath?: string; bibkey?: string; title?: string; error?: string }> =>
      ipcRenderer.invoke('papers:importFromPDF', vaultPath, token),
  },

  experiments: {
    list: (vaultPath: string) => ipcRenderer.invoke('experiments:list', vaultPath),
    generateReproPackage: (vaultPath: string, filePath: string) =>
      ipcRenderer.invoke('experiments:generateReproPackage', vaultPath, filePath),
    generateLineageReport: (vaultPath: string) =>
      ipcRenderer.invoke('experiments:generateLineageReport', vaultPath),
    pickPDFFile: (): Promise<FileAccessGrant | null> =>
      ipcRenderer.invoke('experiments:pickPDFFile'),
    pdfToMarkdown: (vaultPath: string, token: string) =>
      ipcRenderer.invoke('experiments:pdfToMarkdown', vaultPath, token),
  },

  epistemic: {
    bootstrap: (vaultPath: string) => ipcRenderer.invoke('epistemic:bootstrap', vaultPath),
    peerReview: (vaultPath: string, filePath: string) =>
      ipcRenderer.invoke('epistemic:peerReview', vaultPath, filePath),
    mapIsomorphism: (vaultPath: string, leftPath: string, rightPath: string) =>
      ipcRenderer.invoke('epistemic:mapIsomorphism', vaultPath, leftPath, rightPath),
    checkConsistency: (vaultPath: string) =>
      ipcRenderer.invoke('epistemic:checkConsistency', vaultPath),
  },

  memos: {
    list: (vaultPath: string) => ipcRenderer.invoke('memos:list', vaultPath),
    create: (vaultPath: string, content: string, tags?: string[]) =>
      ipcRenderer.invoke('memos:create', vaultPath, content, tags),
    update: (filePath: string, content: string) =>
      ipcRenderer.invoke('memos:update', filePath, content),
    delete: (filePath: string) => ipcRenderer.invoke('memos:delete', filePath),
  },

  links: {
    listTargets: (vaultPath: string) => ipcRenderer.invoke('links:listTargets', vaultPath),
    backlinks: (vaultPath: string, name: string) =>
      ipcRenderer.invoke('links:backlinks', vaultPath, name),
  },

  attachments: {
    pick: (noteFilePath: string) => ipcRenderer.invoke('attachments:pick', noteFilePath),
    saveImage: (noteFilePath: string, dataUrl: string, ext?: string) =>
      ipcRenderer.invoke('attachments:saveImage', noteFilePath, dataUrl, ext),
    dropFiles: (noteFilePath: string, srcPaths: string[]) =>
      ipcRenderer.invoke('attachments:dropFiles', noteFilePath, srcPaths),
    index: (vaultPath: string, noteFilePath?: string) =>
      ipcRenderer.invoke('attachments:index', vaultPath, noteFilePath),
  },

  wiki: {
    list: (vaultPath: string) => ipcRenderer.invoke('wiki:list', vaultPath),
    listEntries: (vaultPath: string) => ipcRenderer.invoke('wiki:listEntries', vaultPath),
    read: (vaultPath: string, fileName: string) =>
      ipcRenderer.invoke('wiki:read', vaultPath, fileName),
    write: (vaultPath: string, fileName: string, content: string) =>
      ipcRenderer.invoke('wiki:write', vaultPath, fileName, content),
    readIndex: (vaultPath: string) => ipcRenderer.invoke('wiki:readIndex', vaultPath),
    saveOutput: (vaultPath: string, fileName: string, content: string) =>
      ipcRenderer.invoke('wiki:saveOutput', vaultPath, fileName, content),
    collectRaw: (vaultPath: string, scope: string) =>
      ipcRenderer.invoke('wiki:collectRaw', vaultPath, scope),
    getSchema: (vaultPath: string) => ipcRenderer.invoke('wiki:getSchema', vaultPath),
    setSchema: (vaultPath: string, schema: string) =>
      ipcRenderer.invoke('wiki:setSchema', vaultPath, schema),
    compile: (vaultPath: string, scope: string, overwriteManuallyEdited?: boolean) =>
      ipcRenderer.invoke('wiki:compile', vaultPath, scope, overwriteManuallyEdited),
    healthCheck: (vaultPath: string) => ipcRenderer.invoke('wiki:healthCheck', vaultPath),
    importFromQALogs: (vaultPath: string) =>
      ipcRenderer.invoke('wiki:importFromQALogs', vaultPath),
    /**
     * Subscribe to compile progress events. Returns an unsubscribe function.
     * Stages: collecting → prompting → streaming → writing → done.
     */
    onCompileProgress: (
      cb: (p: { stage: string; message?: string; bytes?: number }) => void
    ): (() => void) => {
      const handler = (
        _e: IpcRendererEvent,
        payload: { stage: string; message?: string; bytes?: number }
      ) => cb(payload);
      ipcRenderer.on('wiki:compile:progress', handler);
      return () => ipcRenderer.removeListener('wiki:compile:progress', handler);
    },
  },

  outputs: {
    list: (vaultPath: string) => ipcRenderer.invoke('outputs:list', vaultPath),
  },

  qa: {
    readLog: (vaultPath: string, subject: string) =>
      ipcRenderer.invoke('qa:readLog', vaultPath, subject),
    status: () => ipcRenderer.invoke('qa:status'),
    login: () => ipcRenderer.invoke('qa:login'),
    ask: (vaultPath: string, subject: string, question: string) =>
      ipcRenderer.invoke('qa:ask', vaultPath, subject, question),
    onChunk: (cb: (payload: { text: string }) => void) => {
      const l = (_e: unknown, p: { text: string }) => cb(p);
      ipcRenderer.on('qa:chunk', l);
      return () => ipcRenderer.removeListener('qa:chunk', l);
    },
    onDone: (cb: (payload: { text: string; usage: Record<string, number> }) => void) => {
      const l = (_e: unknown, p: { text: string; usage: Record<string, number> }) => cb(p);
      ipcRenderer.on('qa:done', l);
      return () => ipcRenderer.removeListener('qa:done', l);
    },
    onError: (cb: (payload: { error: string }) => void) => {
      const l = (_e: unknown, p: { error: string }) => cb(p);
      ipcRenderer.on('qa:error', l);
      return () => ipcRenderer.removeListener('qa:error', l);
    },
  },

  docai: {
    summarize: (
      filePath: string,
      options?: { mode?: string; count?: number; targetSection?: string; audience?: string }
    ) => ipcRenderer.invoke('docai:summarize', filePath, options),
    ask: (filePath: string, question: string) =>
      ipcRenderer.invoke('docai:ask', filePath, question),
    askMulti: (filePaths: string[], question: string) =>
      ipcRenderer.invoke('docai:askMulti', filePaths, question),
    multiAnalyze: (filePaths: string[], mode: string) =>
      ipcRenderer.invoke('docai:multiAnalyze', filePaths, mode),
    generate: (filePath: string, format: string, instruction: string) =>
      ipcRenderer.invoke('docai:generate', filePath, format, instruction),
    getChunks: (filePath: string) => ipcRenderer.invoke('docai:getChunks', filePath),
    listVaultFiles: (vaultPath: string) => ipcRenderer.invoke('docai:listVaultFiles', vaultPath),
    onChunk: (cb: (payload: { text: string }) => void) => {
      const l = (_e: unknown, p: { text: string }) => cb(p);
      ipcRenderer.on('docai:chunk', l);
      return () => ipcRenderer.removeListener('docai:chunk', l);
    },
    onCitations: (
      cb: (payload: { citations: Array<Record<string, unknown>> }) => void
    ) => {
      const l = (_e: unknown, p: { citations: Array<Record<string, unknown>> }) => cb(p);
      ipcRenderer.on('docai:citations', l);
      return () => ipcRenderer.removeListener('docai:citations', l);
    },
    onDone: (
      cb: (payload: {
        text: string;
        citations: Array<Record<string, unknown>>;
        suggestedFollowUps?: string[];
      }) => void
    ) => {
      const l = (
        _e: unknown,
        p: { text: string; citations: Array<Record<string, unknown>>; suggestedFollowUps?: string[] }
      ) => cb(p);
      ipcRenderer.on('docai:done', l);
      return () => ipcRenderer.removeListener('docai:done', l);
    },
    onError: (cb: (payload: { error: string }) => void) => {
      const l = (_e: unknown, p: { error: string }) => cb(p);
      ipcRenderer.on('docai:error', l);
      return () => ipcRenderer.removeListener('docai:error', l);
    },
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
