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
  matchType?: 'filename' | 'body' | 'tag' | 'frontmatter';
  matchedTag?: string;
};

export type FileAccessGrant = {
  token: string;
  fileName: string;
  size: number;
};

export type AiProvider = 'openai' | 'gemini' | 'claude' | 'none';
export type AiAuthMode = 'api-key' | 'login';
export type AiModelSettings = {
  openai: string;
  gemini: string;
  claudeApi: string;
  claudeLogin: string;
};

export type ProviderAuthStatus = {
  provider: Exclude<AiProvider, 'none'>;
  apiKeyConfigured: boolean;
  login: {
    installed: boolean;
    loggedIn: boolean;
    path?: string;
    error?: string;
  };
};

export type ResearchDeadline = {
  id: string;
  name: string;
  due: string;
  url?: string;
};

export type ResearchDashboard = {
  deadlines: Array<ResearchDeadline & { days: number }>;
  papers: {
    total: number;
    byStatus: Record<string, number>;
    recent: Array<{ filePath: string; title: string; status: string; mtime: number }>;
  };
  books: {
    total: number;
    byStatus: Record<string, number>;
    recent: Array<{ filePath: string; title: string; status: string; mtime: number }>;
  };
  lectures: {
    subjects: number;
    notes: number;
    recent: Array<{ filePath: string; title: string; subject: string; mtime: number }>;
  };
  wikiHealth: {
    orphanCount: number;
    tagCount: number;
    topTags: Array<{ tag: string; count: number }>;
  };
  activity: Array<{ date: string; count: number }>;
};

export type VaultSafetyIssueSeverity = 'info' | 'warning' | 'error';

export type VaultSafetyIssue = {
  severity: VaultSafetyIssueSeverity;
  code: string;
  message: string;
  relPath?: string;
};

export type VaultSafetyAudit = {
  checkedAt: string;
  fileCount: number;
  markdownCount: number;
  totalBytes: number;
  issueCounts: Record<VaultSafetyIssueSeverity, number>;
  issues: VaultSafetyIssue[];
};

export type VaultBackupSummary = {
  backupDir: string;
  createdAt: string;
  fileCount: number;
  totalBytes: number;
};

export type ResearchReproducibilityReport = {
  checkedAt: string;
  score: number;
  papers: {
    total: number;
    withBibkey: number;
    missingBibkey: string[];
    duplicateBibkeys: Array<{ bibkey: string; relPaths: string[] }>;
  };
  experiments: {
    total: number;
    complete: number;
    incomplete: Array<{ relPath: string; missingFields: string[] }>;
  };
  citations: {
    totalCitationKeys: number;
    unresolvedCitationKeys: string[];
  };
  issues: VaultSafetyIssue[];
};

export type LearningSourceKind = 'book' | 'paper' | 'lecture';

export type LearningCoachResult = {
  diagnosis: string;
  keyConcepts: Array<{
    term: string;
    explanation: string;
    confidence?: 'low' | 'medium' | 'high';
  }>;
  misconceptions: string[];
  quiz: Array<{
    question: string;
    answer: string;
    difficulty?: 'easy' | 'medium' | 'hard';
  }>;
  nextActions: string[];
  suggestedNotes: Array<{ title: string; reason: string }>;
};

export type PluginCommandManifest = {
  id: string;
  title: string;
  subtitle?: string;
  icon?: string;
  viewId?: string;
};

export type PluginViewManifest = {
  id: string;
  title: string;
  icon?: string;
  entry: string;
};

export type PluginManifest = {
  apiVersion?: 1;
  id: string;
  name: string;
  version: string;
  commands: PluginCommandManifest[];
  views: PluginViewManifest[];
};

declare global {
  interface Window {
    api: {
      pickFolder: () => Promise<string | null>;
      appWindow: {
        minimize: () => Promise<{ ok: boolean }>;
        toggleMaximize: () => Promise<{ ok: boolean; maximized: boolean }>;
        isMaximized: () => Promise<{ ok: boolean; maximized: boolean }>;
        close: () => Promise<{ ok: boolean }>;
      };
      vault: {
        init: (basePath: string) => Promise<{ vaultPath: string }>;
        listSubjects: (vaultPath: string) => Promise<string[]>;
        createSubject: (vaultPath: string, name: string) => Promise<{ ok: boolean; error?: string }>;
        listFiles: (vaultPath: string, subject: string) => Promise<{ notes: FileEntry[]; materials: FileEntry[] }>;
        listFilesEnriched: (
          vaultPath: string,
          subject: string
        ) => Promise<{
          notes: Array<FileEntry & { meta?: Record<string, unknown>; preview?: string }>;
          materials: Array<FileEntry & { meta?: Record<string, unknown>; preview?: string }>;
        }>;
        readNote: (filePath: string) => Promise<string>;
        readNoteWithMtime: (filePath: string) => Promise<{ content: string; mtime: number }>;
        writeNote: (
          filePath: string,
          content: string,
          expectedMtime?: number,
          /** Phase 4 (N-2): optional SHA-256 of the renderer's last-seen
           * content. Allows the main process to short-circuit a false-positive
           * conflict when only the mtime changed (filesystem touched without
           * content change). */
          expectedHash?: string
        ) => Promise<{
          ok: boolean;
          conflict?: boolean;
          currentMtime?: number;
          currentContent?: string;
          /** SHA-256 of the on-disk content after the operation (always set
           * on `ok: true`, set on conflict for comparison). */
          currentHash?: string;
        }>;
        createTodaysNote: (vaultPath: string, subject: string) => Promise<{ filePath: string; created: boolean }>;
        createTypedNote: (
          vaultPath: string,
          subject: string | null,
          templateName: string,
          title: string,
          defaultBody: string
        ) => Promise<{ filePath: string; created: boolean }>;
        listDailyNotes: (
          vaultPath: string,
          date?: string
        ) => Promise<{
          date: string;
          entries: Array<{ subject: string; filePath: string; exists: boolean; preview: string }>;
        }>;
        renameNote: (
          vaultPath: string,
          oldPath: string,
          newName: string
        ) => Promise<{ ok: boolean; newPath?: string; updatedFiles?: number; error?: string }>;
        listTemplates: (vaultPath: string) => Promise<Array<{ name: string; filePath: string }>>;
        readTemplate: (vaultPath: string, name: string) => Promise<string>;
        writeTemplate: (
          vaultPath: string,
          name: string,
          content: string
        ) => Promise<{ ok: boolean; error?: string }>;
        deleteTemplate: (vaultPath: string, name: string) => Promise<{ ok: boolean; error?: string }>;
        graphData: (vaultPath: string) => Promise<{
          nodes: Array<{ id: string; label: string; subject?: string; category: string }>;
          edges: Array<{ source: string; target: string }>;
        }>;
        readBoard: (
          vaultPath: string,
          subject: string
        ) => Promise<{
          nodes: Array<{ id: string; type?: string; position: { x: number; y: number }; data?: Record<string, unknown> }>;
          edges: Array<{ id?: string; source: string; target: string }>;
        }>;
        writeBoard: (
          vaultPath: string,
          subject: string,
          board: { nodes: unknown[]; edges: unknown[] }
        ) => Promise<{ ok: boolean }>;
        deleteSubject: (
          vaultPath: string,
          subject: string
        ) => Promise<{ ok: boolean; trashedTo?: string; error?: string }>;
        renameSubject: (
          vaultPath: string,
          oldName: string,
          newName: string
        ) => Promise<{ ok: boolean; newName?: string; error?: string }>;
        installSample: (vaultPath: string) => Promise<{ ok: boolean; created: number }>;
        deleteNote: (
          filePath: string
        ) => Promise<{ ok: boolean; trashedTo?: string; error?: string }>;
        duplicateNote: (
          filePath: string
        ) => Promise<{ ok: boolean; newPath?: string; error?: string }>;
      };
      exporter: {
        toPdf: (sourcePath?: string) => Promise<{ ok: boolean; filePath?: string; error?: string }>;
        toHtml: (sourcePath?: string) => Promise<{ ok: boolean; filePath?: string; error?: string }>;
      };
      materials: {
        addFiles: (vaultPath: string, subject: string, srcPaths: string[]) => Promise<{ added: string[] }>;
        openExternal: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
        revealInFolder: (filePath: string) => Promise<{ ok: boolean }>;
        openUrl: (url: string) => Promise<{ ok: boolean; error?: string }>;
        openLogDir: () => Promise<{ ok: boolean; path?: string; error?: string }>;
      };
      log: {
        write: (
          level: 'debug' | 'info' | 'warn' | 'error',
          message: string,
          meta?: Record<string, unknown>
        ) => Promise<{ ok: boolean }>;
      };
      diagnostics: {
        export: () => Promise<{ ok: boolean; filePath?: string; error?: string }>;
      };
      vaultSafety: {
        audit: (
          vaultPath: string
        ) => Promise<{ ok: true; audit: VaultSafetyAudit } | { ok: false; error: string }>;
        createBackup: (
          vaultPath: string
        ) => Promise<
          | {
              ok: true;
              backupDir: string;
              manifestPath: string;
              fileCount: number;
              totalBytes: number;
              skipped: VaultSafetyIssue[];
            }
          | { ok: false; error: string }
        >;
        listBackups: (
          vaultPath: string
        ) => Promise<{ ok: true; backups: VaultBackupSummary[] } | { ok: false; error: string }>;
      };
      telemetry: {
        track: (
          type: 'vault_opened' | 'note_created' | 'wiki_compiled' | 'qa_asked'
        ) => Promise<{ ok: boolean }>;
      };
      update: {
        check: () => Promise<{ ok: boolean; version?: string; error?: string }>;
        install: () => Promise<{ ok: boolean; error?: string }>;
        onAvailable: (cb: (info: { version: string }) => void) => () => void;
        onDownloaded: (cb: (info: { version: string }) => void) => () => void;
      };
      search: {
        query: (vaultPath: string, keyword: string) => Promise<SearchHit[]>;
      };
      index: {
        status: (
          vaultPath: string
        ) => Promise<{ ready: boolean; fileCount: number; builtAt?: string }>;
        rebuild: (
          vaultPath: string
        ) => Promise<{ ok: boolean; fileCount?: number; error?: string }>;
      };
      watcher: {
        start: (vaultPath: string) => Promise<{ ok: boolean }>;
        stop: () => Promise<{ ok: boolean }>;
        onChanged: (cb: (payload: { event: string; file: string }) => void) => () => void;
      };
      settings: {
        get: () => Promise<{
          model: string;
          effort: string;
          theme?: 'light' | 'dark';
          recentVaults?: string[];
          uiMode?: 'simple' | 'custom' | 'full';
          railItems?: string[];
          railCommandIds?: string[];
          aiProvider?: AiProvider | 'claude-cli' | 'anthropic-api';
          aiAuthMode?: AiAuthMode;
          aiModels?: AiModelSettings;
          aiApiModel?: string;
          onboardingCompleted?: boolean;
          locale?: 'ja' | 'en' | null;
          telemetryEnabled?: boolean;
        }>;
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
        }) => Promise<{ ok: boolean }>;
        getAiConfig: () => Promise<{
          provider: AiProvider;
          authMode: AiAuthMode;
          model: string;
          models: AiModelSettings;
        }>;
        /** Phase 4 (S-A): model catalogue with deprecation badges. */
        getModelCatalogue: () => Promise<{
          models: Array<{
            id: string;
            label: string;
            sub: string;
            deprecation?: ModelDeprecation;
            severity?: ModelDeprecationSeverity;
          }>;
        }>;
        /** Phase 4 (S-A): startup-time check for selected model deprecation. */
        checkSelectedModelDeprecation: () => Promise<{
          modelId: string;
          deprecation: ModelDeprecation | null;
          severity: ModelDeprecationSeverity | null;
        }>;
        setAiConfig: (partial: {
          provider?: AiProvider;
          authMode?: AiAuthMode;
          model?: string;
          models?: Partial<AiModelSettings>;
        }) => Promise<{
          ok: boolean;
          config?: { provider: AiProvider; authMode: AiAuthMode; model: string; models: AiModelSettings };
          error?: string;
        }>;
        getProviderAuthStatus: (
          provider?: AiProvider
        ) => Promise<{
          ok: boolean;
          providers: Partial<Record<Exclude<AiProvider, 'none'>, ProviderAuthStatus>>;
        }>;
        setProviderApiKey: (
          provider: Exclude<AiProvider, 'none'>,
          key: string
        ) => Promise<{ ok: boolean; error?: string }>;
        clearProviderApiKey: (
          provider: Exclude<AiProvider, 'none'>
        ) => Promise<{ ok: boolean; error?: string }>;
        loginProvider: (
          provider: Exclude<AiProvider, 'none'>
        ) => Promise<{ ok: boolean; error?: string }>;
        hasApiKey: () => Promise<{ ok: boolean; present: boolean }>;
        setApiKey: (key: string) => Promise<{ ok: boolean; error?: string }>;
        clearApiKey: () => Promise<{ ok: boolean }>;
        testProvider: (
          provider?: AiProvider,
          authMode?: AiAuthMode
        ) => Promise<{ ok: boolean; response?: string; error?: string }>;
      };
      timetable: {
        read: (vaultPath: string) => Promise<Timetable>;
        write: (vaultPath: string, t: Timetable) => Promise<{ ok: boolean }>;
      };
      books: {
        list: (vaultPath: string) => Promise<BookEntry[]>;
        create: (vaultPath: string, title: string, author?: string) => Promise<{ ok: boolean; filePath?: string; error?: string }>;
        updateMeta: (filePath: string, meta: Partial<BookMeta>) => Promise<{ ok: boolean }>;
        delete: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
        getReadingNote: (
          bookFilePath: string
        ) => Promise<{ content: string; notePath: string }>;
        appendReadingNote: (
          bookFilePath: string,
          text: string
        ) => Promise<{ ok: boolean; notePath?: string; error?: string }>;
        writeReadingNote: (
          bookFilePath: string,
          content: string
        ) => Promise<{ ok: boolean; notePath?: string }>;
      };
      latex: {
        detectPandoc: () => Promise<{ ok: boolean; path?: string }>;
        listStyles: () => Promise<('neurips' | 'acl' | 'ieee' | 'generic')[]>;
        exportNote: (
          vaultPath: string,
          filePath: string,
          style: 'neurips' | 'acl' | 'ieee' | 'generic'
        ) => Promise<{
          ok: boolean;
          outputDir?: string;
          texPath?: string;
          usedPandoc?: boolean;
          error?: string;
        }>;
      };

      skills: {
        detectObsidian: () => Promise<{ ok: boolean; path?: string; version?: string }>;
        redetectObsidian: () => Promise<{ ok: boolean; path?: string; version?: string }>;
        analyzeWithObsidianCLI: (
          vaultPath: string
        ) => Promise<{ ok: boolean; output?: string; error?: string }>;
        interopReport: (vaultPath: string) => Promise<
          | {
              ok: true;
              obsidian: {
                hasConfigDir: boolean;
                markdownFiles: number;
                filesWithFrontmatter: number;
                wikilinkCount: number;
                tagCount: number;
                notesMissingFrontmatter: string[];
                brokenWikilinks: Array<{ relPath: string; target: string }>;
                warnings: string[];
              };
              zotero: {
                hasRefsBib: boolean;
                refsBibEntries: number;
                paperFiles: number;
                papersWithBibkey: number;
                papersWithDoi: number;
                papersMissingBibkey: string[];
                papersMissingDoi: string[];
                bibkeysMissingFromRefsBib: string[];
                duplicateBibkeys: string[];
                warnings: string[];
              };
              repairActions: Array<{
                id: string;
                severity: 'info' | 'warning' | 'error';
                area: 'obsidian' | 'zotero';
                title: string;
                description: string;
                relPath?: string;
                dryRunOnly: true;
                manualSteps: string[];
              }>;
              recommendations: string[];
            }
          | { ok: false; error: string }
        >;
      };

      web: {
        clip: (
          vaultPath: string,
          url: string
        ) => Promise<
          | {
              ok: true;
              filePath: string;
              title: string;
              byline?: string;
              wordCount: number;
            }
          | { ok: false; error: string }
        >;
      };

      ai: {
        summarize: (
          filePath: string
        ) => Promise<
          | {
              ok: true;
              result: {
                oneLiner: string;
                overview: string;
                contributions: string[];
                openQuestions: string[];
              };
            }
          | { ok: false; error: string }
        >;
        summarizeAndApply: (
          filePath: string
        ) => Promise<
          | {
              ok: true;
              result: {
                oneLiner: string;
                overview: string;
                contributions: string[];
                openQuestions: string[];
              };
            }
          | { ok: false; error: string }
        >;
        autoTag: (
          filePath: string
        ) => Promise<
          | { ok: true; result: { tags: string[]; reasoning: string } }
          | { ok: false; error: string }
        >;
        applyTags: (
          filePath: string,
          tags: string[]
        ) => Promise<{ ok: boolean; tags?: string[]; error?: string }>;
        optimizeMarkdown: (
          filePath: string
        ) => Promise<
          | { ok: true; result: { optimized: string; changes: string[] } }
          | { ok: false; error: string }
        >;
        generateCanvas: (
          filePath: string
        ) => Promise<
          | {
              ok: true;
              result: {
                nodes: { id: string; label: string; url?: string; level: number }[];
                edges: { from: string; to: string }[];
              };
            }
          | { ok: false; error: string }
        >;
        learningCoach: (
          filePath: string,
          kind?: LearningSourceKind
        ) => Promise<
          | { ok: true; result: LearningCoachResult }
          | { ok: false; error: string }
        >;
        learningCoachAndSave: (
          filePath: string,
          kind?: LearningSourceKind
        ) => Promise<
          | { ok: true; result: LearningCoachResult; kind: LearningSourceKind }
          | { ok: false; error: string }
        >;
        analyzeVault: (
          vaultPath: string
        ) => Promise<
          | {
              ok: true;
              result: {
                orphans: { fileName: string; reason: string }[];
                topTags: { tag: string; count: number }[];
                suggestions: string[];
              };
            }
          | { ok: false; error: string }
        >;
      };

      research: {
        getDashboard: (
          vaultPath: string
        ) => Promise<
          | { ok: true; dashboard: ResearchDashboard }
          | { ok: false; error: string }
        >;
        reproducibilityReport: (
          vaultPath: string
        ) => Promise<
          | { ok: true; report: ResearchReproducibilityReport }
          | { ok: false; error: string }
        >;
        listDeadlines: (
          vaultPath: string
        ) => Promise<
          | { ok: true; deadlines: ResearchDeadline[] }
          | { ok: false; error: string }
        >;
        saveDeadlines: (
          vaultPath: string,
          deadlines: ResearchDeadline[]
        ) => Promise<
          | { ok: true; deadlines: ResearchDeadline[] }
          | { ok: false; error: string }
        >;
      };

      plugins: {
        list: (vaultPath: string) => Promise<PluginManifest[]>;
        runCommand: (
          vaultPath: string,
          pluginId: string,
          commandId: string
        ) => Promise<{ ok: boolean; error?: string }>;
        getViewUrl: (
          vaultPath: string,
          pluginId: string,
          viewId: string
        ) => Promise<{ ok: boolean; url?: string; error?: string }>;
      };

      papers: {
        list: (vaultPath: string) => Promise<PaperEntry[]>;
        create: (
          vaultPath: string,
          input: PaperCreateInput
        ) => Promise<{ ok: boolean; filePath?: string; error?: string }>;
        updateMeta: (
          filePath: string,
          meta: Partial<PaperMeta>
        ) => Promise<{ ok: boolean; error?: string }>;
        delete: (
          filePath: string
        ) => Promise<{ ok: boolean; trashedTo?: string; error?: string }>;
        getReadingNote: (
          paperFilePath: string
        ) => Promise<{ content: string; notePath: string }>;
        appendReadingNote: (
          paperFilePath: string,
          text: string
        ) => Promise<{ ok: boolean; error?: string }>;
        importFromArxiv: (
          vaultPath: string,
          idOrUrl: string
        ) => Promise<{
          ok: boolean;
          filePath?: string;
          bibkey?: string;
          title?: string;
          error?: string;
        }>;
        importFromDOI: (
          vaultPath: string,
          doi: string
        ) => Promise<{
          ok: boolean;
          filePath?: string;
          bibkey?: string;
          title?: string;
          error?: string;
        }>;
        exportBibtex: (
          vaultPath: string
        ) => Promise<{
          ok: boolean;
          filePath?: string;
          count?: number;
          skipped?: number;
          error?: string;
        }>;
        pickBibtexFile: () => Promise<FileAccessGrant | null>;
        importFromBibtex: (
          vaultPath: string,
          token: string
        ) => Promise<{
          ok: boolean;
          imported: number;
          skipped: number;
          errors: string[];
          filePaths: string[];
        }>;
        listForCitation: (
          vaultPath: string
        ) => Promise<
          { bibkey: string; title: string; authors: string; year: number | null }[]
        >;
        pickPDFFile: () => Promise<FileAccessGrant | null>;
        importFromPDF: (
          vaultPath: string,
          token: string
        ) => Promise<{
          ok: boolean;
          filePath?: string;
          bibkey?: string;
          title?: string;
          error?: string;
        }>;
      };
      experiments: {
        list: (vaultPath: string) => Promise<
          Array<{
            filePath: string;
            title: string;
            status?: string;
            dataset?: string;
            model?: string;
            parent?: string;
            mtime: number;
          }>
        >;
        generateReproPackage: (
          vaultPath: string,
          filePath: string
        ) => Promise<{ ok: boolean; outputDir?: string; files?: string[]; error?: string }>;
        generateLineageReport: (
          vaultPath: string
        ) => Promise<{ ok: boolean; filePath?: string; count?: number; error?: string }>;
        pickPDFFile: () => Promise<FileAccessGrant | null>;
        pdfToMarkdown: (
          vaultPath: string,
          token: string
        ) => Promise<{ ok: boolean; filePath?: string; title?: string; error?: string }>;
      };
      epistemic: {
        bootstrap: (
          vaultPath: string
        ) => Promise<{ ok: boolean; created: string[]; claudePath: string }>;
        peerReview: (
          vaultPath: string,
          filePath: string
        ) => Promise<{ ok: boolean; filePath?: string; error?: string }>;
        mapIsomorphism: (
          vaultPath: string,
          leftPath: string,
          rightPath: string
        ) => Promise<{ ok: boolean; filePath?: string; error?: string }>;
        checkConsistency: (
          vaultPath: string
        ) => Promise<{ ok: boolean; filePath?: string; noteCount?: number; error?: string }>;
      };
      memos: {
        list: (vaultPath: string) => Promise<MemoEntry[]>;
        create: (vaultPath: string, content: string, tags?: string[]) => Promise<{ ok: boolean; filePath?: string; error?: string }>;
        update: (filePath: string, content: string) => Promise<{ ok: boolean }>;
        delete: (filePath: string) => Promise<{ ok: boolean; error?: string }>;
      };
      links: {
        listTargets: (vaultPath: string) => Promise<LinkTarget[]>;
        backlinks: (vaultPath: string, name: string) => Promise<Backlink[]>;
      };
      attachments: {
        pick: (noteFilePath: string) => Promise<{ ok: boolean; added: string[] }>;
        saveImage: (noteFilePath: string, dataUrl: string, ext?: string) => Promise<{ ok: boolean; name?: string; error?: string }>;
        dropFiles: (noteFilePath: string, srcPaths: string[]) => Promise<{ ok: boolean; added: string[] }>;
        index: (vaultPath: string, noteFilePath?: string) => Promise<Record<string, string>>;
      };
      wiki: {
        list: (vaultPath: string) => Promise<{ name: string; filePath: string; mtime: number }[]>;
        listEntries: (vaultPath: string) => Promise<
          {
            name: string;
            filePath: string;
            mtime: number;
            preview: string;
            sourceCount: number;
            backlinkCount: number;
            linkTargets: string[];
          }[]
        >;
        read: (vaultPath: string, fileName: string) => Promise<string>;
        write: (
          vaultPath: string,
          fileName: string,
          content: string
        ) => Promise<{ ok: boolean; filePath?: string }>;
        readIndex: (vaultPath: string) => Promise<string | null>;
        saveOutput: (
          vaultPath: string,
          fileName: string,
          content: string
        ) => Promise<{ ok: boolean; filePath?: string }>;
        collectRaw: (
          vaultPath: string,
          scope: string
        ) => Promise<{ source: string; content: string; mtime: number }[]>;
        getSchema: (vaultPath: string) => Promise<string>;
        setSchema: (vaultPath: string, schema: string) => Promise<{ ok: boolean }>;
        compile: (
          vaultPath: string,
          scope: string,
          overwriteManuallyEdited?: boolean
        ) => Promise<{
          ok: boolean;
          pageCount?: number;
          error?: string;
          conflict?: boolean;
          manuallyEdited?: string[];
          message?: string;
        }>;
        healthCheck: (
          vaultPath: string
        ) => Promise<{ ok: boolean; reportPath?: string; report?: string; error?: string }>;
        importFromQALogs: (
          vaultPath: string
        ) => Promise<{ ok: boolean; imported: string[] }>;
        onCompileProgress: (
          cb: (p: { stage: string; message?: string; bytes?: number }) => void
        ) => () => void;
      };
      outputs: {
        list: (vaultPath: string) => Promise<{ name: string; filePath: string; mtime: number }[]>;
      };
      qa: {
        readLog: (vaultPath: string, subject: string) => Promise<string>;
        status: () => Promise<{ installed: boolean; path?: string; loggedIn: boolean; error?: string }>;
        login: () => Promise<{ ok: boolean; error?: string }>;
        ask: (
          vaultPath: string,
          subject: string,
          question: string
        ) => Promise<{ ok: boolean; text?: string; error?: string }>;
        onChunk: (cb: (payload: { text: string }) => void) => () => void;
        onDone: (
          cb: (payload: { text: string; usage: Record<string, number> }) => void
        ) => () => void;
        onError: (cb: (payload: { error: string }) => void) => () => void;
      };
      docai: {
        summarize: (
          filePath: string,
          options?: {
            mode?: 'keypoints' | 'section' | 'exam-prep' | 'one-liner';
            count?: number;
            targetSection?: string;
            audience?: 'beginner' | 'researcher' | 'general';
          }
        ) => Promise<{ ok: boolean; result?: DocAISummaryResult; error?: string }>;
        ask: (
          filePath: string,
          question: string
        ) => Promise<{
          ok: boolean;
          answer?: string;
          citations?: DocAICitation[];
          suggestedFollowUps?: string[];
          error?: string;
        }>;
        askMulti: (
          filePaths: string[],
          question: string
        ) => Promise<{
          ok: boolean;
          answer?: string;
          citations?: DocAICitation[];
          suggestedFollowUps?: string[];
          error?: string;
        }>;
        multiAnalyze: (
          filePaths: string[],
          mode: 'compare' | 'synthesize' | 'presentation'
        ) => Promise<{ ok: boolean; result?: unknown; error?: string }>;
        generate: (
          filePath: string,
          format: 'email' | 'presentation' | 'report' | 'memo' | 'general',
          instruction: string
        ) => Promise<{
          ok: boolean;
          result?: { content: string; format: string; citations: DocAICitation[]; wordCount: number };
          error?: string;
        }>;
        getChunks: (
          filePath: string
        ) => Promise<{ ok: boolean; chunks?: unknown[]; error?: string }>;
        listVaultFiles: (
          vaultPath: string
        ) => Promise<{
          ok: boolean;
          files?: Array<{
            relPath: string;
            absPath: string;
            title: string;
            kind: 'note' | 'pdf';
            mtimeMs: number;
            tags: string[];
          }>;
          /** True when the VaultIndex was empty before this call (built lazily). */
          indexNotReady?: boolean;
          builtAt?: string;
          error?: string;
        }>;
        onChunk: (cb: (payload: { text: string }) => void) => () => void;
        onCitations: (
          cb: (payload: { citations: DocAICitation[] }) => void
        ) => () => void;
        onDone: (
          cb: (payload: {
            text: string;
            citations: DocAICitation[];
            suggestedFollowUps?: string[];
          }) => void
        ) => () => void;
        onError: (cb: (payload: { error: string }) => void) => () => void;
      };
    };
  }
}

export type DocAICitation = {
  id: number;
  source: string;
  section: string;
  excerpt: string;
  pageNumber?: number;
  startLine?: number;
};

export type DocAISummaryKeyPoint = {
  point: string;
  citation: DocAICitation;
  importance: 'critical' | 'important' | 'supplementary';
};

export type DocAISummaryResult = {
  headline: string;
  keyPoints: DocAISummaryKeyPoint[];
  structure: string;
  actionItems: string[];
  suggestedQuestions: string[];
};

export type Timetable = {
  days: string[];
  periods: number;
  cells: Record<string, string>;
};

export type BookMeta = {
  title: string;
  author?: string;
  status?: 'want-to-read' | 'reading' | 'done';
  rating?: number;
  started?: string;
  finished?: string;
  tags?: string[];
  totalPages?: number;
  currentPage?: number;
};

export type BookEntry = {
  filePath: string;
  fileName: string;
  meta: BookMeta;
  bodyPreview: string;
  mtime: number;
};

// Papers — academic literature management. Distinct from Books (general reading).
// Frontmatter mirrors common citation manager fields plus AI-friendly summary/tags.
export type PaperStatus = 'to-read' | 'reading' | 'read' | 'cited' | 'skimmed';

export type PaperMeta = {
  title?: string;
  type?: 'paper';
  bibkey?: string;
  authors?: string[] | string;
  year?: number;
  venue?: string;
  doi?: string;
  arxiv?: string;
  url?: string;
  pdf?: string;
  status?: PaperStatus;
  rating?: number;
  tags?: string[] | string;
  addedAt?: string;
  summary?: string;
  // Allow additional unknown keys (frontmatter is open-ended).
  [key: string]: unknown;
};

export type PaperEntry = {
  filePath: string;
  fileName: string;
  meta: PaperMeta;
  bodyPreview: string;
  mtime: number;
};

export type PaperCreateInput = {
  title: string;
  bibkey?: string;
  authors?: string[];
  year?: number;
  venue?: string;
  doi?: string;
  arxiv?: string;
  url?: string;
  tags?: string[];
  status?: PaperStatus;
};

export type MemoEntry = {
  filePath: string;
  fileName: string;
  created: string;
  tags: string[];
  body: string;
  mtime: number;
};

export type LinkTarget = {
  name: string;
  filePath: string;
  category: 'subject-note' | 'subject-overview' | 'book' | 'memo';
  subject?: string;
};

export type Backlink = {
  filePath: string;
  fileName: string;
  category: string;
  subject?: string;
  snippet: string;
};

// ---------------------------------------------------------------------------
// Phase 4 (S-A): AI model deprecation metadata. Mirrors the shape in
// electron/ai/provider.ts so renderer code can type the IPC responses.
// ---------------------------------------------------------------------------

export type ModelDeprecation = {
  /** ISO date the deprecation was announced (when we first knew). */
  since: string;
  /** ISO date when the model will stop serving requests. null = TBD. */
  removeOn: string | null;
  /** Recommended replacement model id (same provider). */
  replacement?: string;
  /** Free-form short note shown in UI. */
  note: string;
};

export type ModelDeprecationSeverity = 'past' | 'imminent' | 'scheduled' | 'announced';
