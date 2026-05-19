# IPC Channel Inventory

Generated from `npm run security:ipc-surface` (see `scripts/ipc-surface.mjs`).
Re-run that command to refresh `security/ipc-surface.json`, then this file
can be regenerated with:

```bash
node -e "const j=require('./security/ipc-surface.json');const channels=j.mainHandlers.map(h=>h.channel).sort();const groups={};for(const c of channels){const p=c.split(':')[0];(groups[p]=groups[p]||[]).push(c);}for(const g of Object.keys(groups).sort()){console.log('### '+g+' ('+groups[g].length+')');for(const c of groups[g])console.log('- \\\`'+c+'\\\`');console.log('');}" > docs/architecture/ipc-channels-raw.txt
```

## Surface summary

| Metric | Count |
|---|---|
| Total `ipcMain.handle()` channels | **149** |
| Total `ipcRenderer.invoke()` calls | **149** |
| Renderer-only event listeners | N (see `rendererEvents` field) |

The full machine-readable surface is in `security/ipc-surface.json`. The
human-readable inventory by domain follows.

## Channels by domain

### `ai:` (9) — `electron/ipc/agents.ts`
- `ai:analyzeVault`
- `ai:applyTags`
- `ai:autoTag`
- `ai:generateCanvas`
- `ai:learningCoach`
- `ai:learningCoachAndSave`
- `ai:optimizeMarkdown`
- `ai:summarize`
- `ai:summarizeAndApply`

### `attachments:` (4) — `electron/ipc/attachments.ts`
- `attachments:dropFiles`
- `attachments:index`
- `attachments:pick`
- `attachments:saveImage`

### `books:` (7) — `electron/ipc/books.ts`
- `books:appendReadingNote`
- `books:create`
- `books:delete`
- `books:getReadingNote`
- `books:list`
- `books:updateMeta`
- `books:writeReadingNote`

### `diagnostics:` (1) — `electron/ipc/diagnostics.ts`
- `diagnostics:export`

### `dialog:` (1) — `electron/main.ts`
- `dialog:pickFolder`

### `docai:` (7) — `electron/ipc/docai.ts` *(Phase 1+2 Wave 1/2)*
- `docai:ask` — single-doc Q&A (streaming)
- `docai:askMulti` — multi-doc Q&A (streaming)
- `docai:generate` — content generation
- `docai:getChunks` — debug / preview
- `docai:listVaultFiles` — for MultiDocPicker
- `docai:multiAnalyze` — comparison / synthesis
- `docai:summarize` — smartSummary
- + 4 renderer events: `docai:chunk`, `docai:citations`, `docai:done`, `docai:error`

### `epistemic:` (4) — `electron/ipc/epistemic.ts`
- `epistemic:bootstrap`
- `epistemic:checkConsistency`
- `epistemic:mapIsomorphism`
- `epistemic:peerReview`

### `experiments:` (5) — `electron/ipc/experiments.ts`
- `experiments:generateLineageReport`
- `experiments:generateReproPackage`
- `experiments:list`
- `experiments:pdfToMarkdown`
- `experiments:pickPDFFile`

### `export:` (2) — `electron/ipc/export.ts`
- `export:toHtml`
- `export:toPdf`

### `index:` (2) — `electron/ipc/index.ts`
- `index:rebuild`
- `index:status`

### `latex:` (3) — `electron/ipc/latex.ts`
- `latex:detectPandoc`
- `latex:exportNote`
- `latex:listStyles`

### `links:` (2) — `electron/ipc/links.ts`
- `links:backlinks`
- `links:listTargets`

### `log:` (1) — `electron/main.ts`
- `log:write`

### `materials:` (1) — `electron/ipc/materials.ts`
- `materials:addFiles`

### `memos:` (4) — `electron/ipc/memos.ts`
- `memos:create`
- `memos:delete`
- `memos:list`
- `memos:update`

### `outputs:` (1) — `electron/ipc/export.ts`
- `outputs:list`

### `papers:` (14) — `electron/ipc/papers.ts`
- `papers:appendReadingNote`
- `papers:create`
- `papers:delete`
- `papers:exportBibtex`
- `papers:getReadingNote`
- `papers:importFromArxiv`
- `papers:importFromBibtex`
- `papers:importFromDOI`
- `papers:importFromPDF`
- `papers:list`
- `papers:listForCitation`
- `papers:pickBibtexFile`
- `papers:pickPDFFile`
- `papers:updateMeta`

### `plugins:` (3) — `electron/ipc/plugins.ts`
- `plugins:getViewUrl`
- `plugins:list`
- `plugins:runCommand`

### `qa:` (4) — `electron/ipc/qa.ts`
- `qa:ask` (streaming via `qa:chunk` / `qa:done` / `qa:error`)
- `qa:login`
- `qa:readLog`
- `qa:status`

### `research:` (4) — `electron/ipc/research.ts`
- `research:getDashboard`
- `research:listDeadlines`
- `research:reproducibilityReport`
- `research:saveDeadlines`

### `search:` (1) — `electron/ipc/search.ts`
- `search:query`

### `settings:` (12) — `electron/ipc/settings.ts`
- `settings:clearApiKey`
- `settings:clearProviderApiKey`
- `settings:get`
- `settings:getAiConfig`
- `settings:getProviderAuthStatus`
- `settings:hasApiKey`
- `settings:loginProvider`
- `settings:set`
- `settings:setAiConfig`
- `settings:setApiKey`
- `settings:setProviderApiKey`
- `settings:testProvider`

### `shell:` (4) — `electron/main.ts`
- `shell:openExternal`
- `shell:openLogDir`
- `shell:openUrl`
- `shell:revealInFolder`

### `skills:` (3) — `electron/ipc/skills.ts`
- `skills:analyzeWithObsidianCLI`
- `skills:detectObsidian`
- `skills:redetectObsidian`

### `telemetry:` (1) — `electron/telemetry.ts`
- `telemetry:track`

### `timetable:` (2) — `electron/ipc/timetable.ts`
- `timetable:read`
- `timetable:write`

### `update:` (2) — `electron/updater.ts`
- `update:check`
- `update:install`

### `vault:` (24) — `electron/ipc/vault.ts`
Setup: `vault:init`, `vault:installSample`
Subjects: `vault:listSubjects`, `vault:createSubject`, `vault:deleteSubject`, `vault:renameSubject`
Files: `vault:listFiles`, `vault:listFilesEnriched`, `vault:listDailyNotes`
Notes: `vault:readNote`, `vault:readNoteWithMtime`, `vault:writeNote`, `vault:renameNote`, `vault:deleteNote`, `vault:duplicateNote`, `vault:createTodaysNote`, `vault:createTypedNote`
Templates: `vault:listTemplates`, `vault:readTemplate`, `vault:writeTemplate`, `vault:deleteTemplate`
Graph/Board: `vault:graphData`, `vault:readBoard`, `vault:writeBoard`

### `vaultSafety:` (3) — `electron/ipc/vault-safety.ts`
- `vaultSafety:audit`
- `vaultSafety:createBackup`
- `vaultSafety:listBackups`

### `watcher:` (2) — `electron/ipc/watcher.ts`
- `watcher:start`
- `watcher:stop`

### `web:` (1) — `electron/ipc/web.ts`
- `web:clip`

### `wiki:` (11) — `electron/ipc/wiki.ts`
Wiki I/O: `wiki:list`, `wiki:read`, `wiki:write`, `wiki:readIndex`
Outputs: `wiki:saveOutput`
Schema: `wiki:getSchema`, `wiki:setSchema`, `wiki:collectRaw`
Compilation: `wiki:compile` (emits `wiki:compile:progress`)
Health check: `wiki:healthCheck` (emits `wiki:health:progress`)
Imports: `wiki:importFromQALogs`

### `window:` (4) — `electron/main.ts`
- `window:close`
- `window:isMaximized`
- `window:minimize`
- `window:toggleMaximize`
