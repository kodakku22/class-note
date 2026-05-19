import { ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import YAML from 'yaml';
import {
  validateVaultPath,
  setCurrentVaultPath,
  getCurrentVaultPath,
  atomicWrite,
  backupFile,
} from './utils';
import { migrateVault } from '../vault-migration';
import { logger } from '../logger';

const VAULT_DIRNAME = 'ClassVault';
const NOTES_DIR = 'notes';
const MATERIALS_DIR = 'materials';
const TEMPLATES_DIR = '_templates';

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']);
const OFFICE_EXTS = new Set(['.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx']);

export function classifyFile(name: string): { kind: 'note' | 'pdf' | 'image' | 'office' | 'other'; ext: string } {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.md' || ext === '.markdown') return { kind: 'note', ext };
  if (ext === '.pdf') return { kind: 'pdf', ext };
  if (IMAGE_EXTS.has(ext)) return { kind: 'image', ext };
  if (OFFICE_EXTS.has(ext)) return { kind: 'office', ext };
  return { kind: 'other', ext };
}

function todayString(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readUserTemplate(vaultPath: string, name: string): Promise<string | null> {
  const fp = path.join(vaultPath, TEMPLATES_DIR, `${name}.md`);
  if (!(await exists(fp))) return null;
  try {
    return await fs.readFile(fp, 'utf-8');
  } catch {
    return null;
  }
}

function applyTemplateVars(
  tpl: string,
  vars: { date?: string; subject?: string; title?: string }
): string {
  return tpl
    .replace(/\{\{date\}\}/g, vars.date ?? '')
    .replace(/\{\{subject\}\}/g, vars.subject ?? '')
    .replace(/\{\{title\}\}/g, vars.title ?? '');
}

export function safeSubjectName(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|]/g, '_');
}

/**
 * IPC handler table of contents (Phase 2-D logical sectioning):
 *
 *   Setup ............... vault:init
 *   Subject CRUD ........ vault:listSubjects, vault:createSubject, vault:deleteSubject, vault:renameSubject
 *   File listing ........ vault:listFiles, vault:listFilesEnriched, vault:listDailyNotes
 *   Note I/O ............ vault:readNote(WithMtime), vault:writeNote, vault:renameNote,
 *                         vault:deleteNote, vault:duplicateNote, vault:createTodaysNote,
 *                         vault:createTypedNote
 *   Templates ........... vault:listTemplates, vault:readTemplate, vault:writeTemplate, vault:deleteTemplate
 *   Graph/Board ......... vault:graphData, vault:readBoard, vault:writeBoard
 *   Sample install ...... vault:installSample
 */
export function createVaultHandlers() {
  return {
    // ===== Setup =====
    'vault:init': async (_e: unknown, basePath: string) => {
      const vaultPath = path.join(path.resolve(basePath), VAULT_DIRNAME);
      await ensureDir(vaultPath);
      await ensureDir(path.join(vaultPath, '.obsidian'));
      setCurrentVaultPath(vaultPath);
      // Phase 4 (S-B): run any pending schema migrations before the renderer
      // starts reading files. Failures are logged but don't block init —
      // partial migration leaves the version file at the last successful step
      // so the next boot retries.
      try {
        const result = await migrateVault(vaultPath);
        if (!result.ok) {
          logger.warn('[vault:init] migration partial', result);
        }
      } catch (err) {
        logger.error('[vault:init] migrateVault threw', err);
      }
      return { vaultPath };
    },

    'vault:listSubjects': async (_e: unknown, vaultPath: string) => {
      const root = path.resolve(vaultPath);
      setCurrentVaultPath(root);
      if (!(await exists(root))) return [];
      const reserved = new Set(['Books', 'Memos']);
      const entries = await fs.readdir(root, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !reserved.has(e.name))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b, 'ja'));
    },

    'vault:createSubject': async (_e: unknown, vaultPath: string, name: string) => {
      const root = path.resolve(vaultPath);
      const safe = safeSubjectName(name);
      if (!safe) return { ok: false, error: '科目名が空です' };
      const dir = path.join(root, safe);
      validateVaultPath(dir, root);
      if (await exists(dir)) return { ok: false, error: 'すでに存在します' };
      await ensureDir(path.join(dir, NOTES_DIR));
      await ensureDir(path.join(dir, MATERIALS_DIR));
      await ensureDir(path.join(dir, 'qa'));
      const overview = path.join(dir, '_概要.md');
      if (!(await exists(overview))) {
        const userTpl = await readUserTemplate(root, 'subject');
        const tpl = userTpl
          ? applyTemplateVars(userTpl, { subject: safe, title: `${safe} 概要`, date: todayString() })
          : `# ${safe} 概要\n\n## 科目について\n\n(担当の先生、教科書、評価方法などをここにメモ)\n\n## 学習目標\n\n- \n\n## 重要キーワード\n\n- \n`;
        await atomicWrite(overview, tpl);
      }
      return { ok: true };
    },

    'vault:listFilesEnriched': async (_e: unknown, vaultPath: string, subject: string) => {
      const root = path.resolve(vaultPath);
      const safe = safeSubjectName(subject);
      const notesDir = path.join(root, safe, NOTES_DIR);
      const materialsDir = path.join(root, safe, MATERIALS_DIR);
      validateVaultPath(notesDir, root);
      validateVaultPath(materialsDir, root);

      type Entry = {
        name: string;
        path: string;
        kind: 'note' | 'pdf' | 'image' | 'office' | 'other';
        ext: string;
        mtime: number;
        meta?: Record<string, unknown>;
        preview?: string;
      };

      async function readDirEnriched(dir: string): Promise<Entry[]> {
        if (!(await exists(dir))) return [];
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const items = await Promise.all(
          entries
            .filter((e) => e.isFile() && !e.name.startsWith('.'))
            .map(async (e) => {
              const full = path.join(dir, e.name);
              const stat = await fs.stat(full);
              const { kind, ext } = classifyFile(e.name);
              const base: Entry = { name: e.name, path: full, kind, ext, mtime: stat.mtimeMs };
              if (kind === 'note') {
                try {
                  const raw = await fs.readFile(full, 'utf-8');
                  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
                  let meta: Record<string, unknown> = {};
                  let body = raw;
                  if (m) {
                    try {
                      const parsed = YAML.parse(m[1]);
                      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                        meta = parsed;
                      }
                    } catch {}
                    body = m[2];
                  }
                  base.meta = meta;
                  base.preview = body.replace(/^#+\s.*$/gm, '').replace(/\s+/g, ' ').trim().slice(0, 240);
                } catch {}
              }
              return base;
            })
        );
        return items.sort((a, b) => b.mtime - a.mtime);
      }

      const [notes, materials] = await Promise.all([
        readDirEnriched(notesDir),
        readDirEnriched(materialsDir),
      ]);
      return { notes, materials };
    },

    'vault:listFiles': async (_e: unknown, vaultPath: string, subject: string) => {
      const root = path.resolve(vaultPath);
      const safe = safeSubjectName(subject);
      const notesDir = path.join(root, safe, NOTES_DIR);
      const materialsDir = path.join(root, safe, MATERIALS_DIR);
      validateVaultPath(notesDir, root);
      validateVaultPath(materialsDir, root);

      async function readDirSafe(dir: string) {
        if (!(await exists(dir))) return [];
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const files = await Promise.all(
          entries
            .filter((e) => e.isFile() && !e.name.startsWith('.'))
            .map(async (e) => {
              const full = path.join(dir, e.name);
              const stat = await fs.stat(full);
              const { kind, ext } = classifyFile(e.name);
              return { name: e.name, path: full, kind, ext, mtime: stat.mtimeMs };
            })
        );
        return files.sort((a, b) => b.mtime - a.mtime);
      }

      const [notes, materials] = await Promise.all([readDirSafe(notesDir), readDirSafe(materialsDir)]);
      return { notes, materials };
    },

    'vault:readNote': async (_e: unknown, filePath: string) => {
      const root = getCurrentVaultPath();
      if (!root) throw new Error('Access denied: no active vault');
      validateVaultPath(filePath, root);
      return fs.readFile(filePath, 'utf-8');
    },

    'vault:readNoteWithMtime': async (_e: unknown, filePath: string) => {
      const root = getCurrentVaultPath();
      if (!root) throw new Error('Access denied: no active vault');
      const resolved = validateVaultPath(filePath, root);
      const [content, stat] = await Promise.all([
        fs.readFile(resolved, 'utf-8'),
        fs.stat(resolved),
      ]);
      return { content, mtime: stat.mtimeMs };
    },

    'vault:writeNote': async (
      _e: unknown,
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
    }> => {
      const root = getCurrentVaultPath();
      if (!root) throw new Error('Access denied: no active vault');
      const resolved = validateVaultPath(filePath, root);
      await ensureDir(path.dirname(resolved));

      // Phase 4 (N-2): Conflict detection. Previously this allowed a 5ms mtime
      // tolerance which masked real external edits on fast disks. We now:
      //   1. Tighten tolerance to 1ms (FP rounding only, not "near-simultaneous").
      //   2. Optionally accept `expectedHash` (SHA-256 of the renderer's last-seen
      //      content) which short-circuits the conflict check when content is
      //      provably identical — useful when the file was re-touched by a
      //      watcher event without actual change.
      if ((expectedMtime !== undefined && expectedMtime > 0) || expectedHash) {
        try {
          const stat = await fs.stat(resolved);
          const mtimeMatches = expectedMtime === undefined
            || expectedMtime <= 0
            || Math.abs(stat.mtimeMs - expectedMtime) <= 1;
          if (!mtimeMatches) {
            const currentContent = await fs.readFile(resolved, 'utf-8');
            const { createHash } = await import('crypto');
            const currentHash = createHash('sha256').update(currentContent, 'utf-8').digest('hex');
            // If caller provided a hash and it matches the current bytes, the
            // mtime drift is benign (filesystem touched the file without
            // changing content). Allow the write.
            if (expectedHash && expectedHash === currentHash) {
              // proceed past the conflict guard
            } else {
              return {
                ok: false,
                conflict: true,
                currentMtime: stat.mtimeMs,
                currentContent,
                currentHash,
              };
            }
          }
        } catch {
          // file doesn't exist yet; treat as no conflict
        }
      }

      await backupFile(resolved, root);
      await atomicWrite(resolved, content);
      try {
        const newStat = await fs.stat(resolved);
        const { createHash } = await import('crypto');
        const newHash = createHash('sha256').update(content, 'utf-8').digest('hex');
        return { ok: true, currentMtime: newStat.mtimeMs, currentHash: newHash };
      } catch {
        return { ok: true };
      }
    },

    'vault:createTodaysNote': async (_e: unknown, vaultPath: string, subject: string) => {
      const root = path.resolve(vaultPath);
      const safe = safeSubjectName(subject);
      const date = todayString();
      const notesDir = path.join(root, safe, NOTES_DIR);
      validateVaultPath(notesDir, root);
      await ensureDir(notesDir);
      const filePath = path.join(notesDir, `${date}.md`);
      if (await exists(filePath)) {
        return { filePath, created: false };
      }
      const userTpl = await readUserTemplate(root, 'daily');
      const template = userTpl
        ? applyTemplateVars(userTpl, { date, subject: safe, title: `${date} ${safe}` })
        : `---\ntype: daily\n科目: ${safe}\n日付: ${date}\n---\n\n# ${date} ${safe}\n\n## 内容\n\n\n## 関連資料\n\n`;
      await atomicWrite(filePath, template);
      return { filePath, created: true };
    },

    'vault:createTypedNote': async (
      _e: unknown,
      vaultPath: string,
      subject: string | null,
      templateName: string,
      title: string,
      defaultBody: string
    ) => {
      const root = path.resolve(vaultPath);
      const date = todayString();
      const safeTitle = (title || `${date} ${templateName}`).trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 200);
      const safeSubject = subject ? safeSubjectName(subject) : '';
      const dir = subject
        ? path.join(root, safeSubject, NOTES_DIR)
        : path.join(root, 'Memos');
      validateVaultPath(dir, root);
      await ensureDir(dir);

      let filePath = path.join(dir, `${safeTitle}.md`);
      let i = 1;
      while (await exists(filePath)) {
        filePath = path.join(dir, `${safeTitle} (${i}).md`);
        i += 1;
      }
      validateVaultPath(filePath, root);

      const userTpl = templateName ? await readUserTemplate(root, templateName) : null;
      const tpl = userTpl ?? defaultBody ?? '';
      const content = applyTemplateVars(tpl, {
        date,
        subject: safeSubject,
        title: safeTitle,
      });
      await atomicWrite(filePath, content);
      return { filePath, created: true };
    },

    'vault:listTemplates': async (_e: unknown, vaultPath: string) => {
      const root = path.resolve(vaultPath);
      const dir = path.join(root, TEMPLATES_DIR);
      validateVaultPath(dir, root);
      if (!(await exists(dir))) return [] as Array<{ name: string; filePath: string }>;
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries
        .filter((e) => e.isFile() && e.name.endsWith('.md'))
        .map((e) => ({ name: e.name.replace(/\.md$/, ''), filePath: path.join(dir, e.name) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    },

    'vault:readTemplate': async (_e: unknown, vaultPath: string, name: string) => {
      const root = path.resolve(vaultPath);
      const safe = name.replace(/[\\/:*?"<>|]/g, '_');
      const fp = path.join(root, TEMPLATES_DIR, `${safe}.md`);
      validateVaultPath(fp, root);
      if (!(await exists(fp))) return '';
      return fs.readFile(fp, 'utf-8');
    },

    'vault:writeTemplate': async (_e: unknown, vaultPath: string, name: string, content: string) => {
      const root = path.resolve(vaultPath);
      const safe = name.trim().replace(/[\\/:*?"<>|]/g, '_');
      if (!safe) return { ok: false, error: 'テンプレート名が空です' };
      const dir = path.join(root, TEMPLATES_DIR);
      const fp = path.join(dir, `${safe}.md`);
      validateVaultPath(fp, root);
      await ensureDir(dir);
      await backupFile(fp, root);
      await atomicWrite(fp, content);
      return { ok: true };
    },

    'vault:deleteTemplate': async (_e: unknown, vaultPath: string, name: string) => {
      const root = path.resolve(vaultPath);
      const safe = name.replace(/[\\/:*?"<>|]/g, '_');
      const fp = path.join(root, TEMPLATES_DIR, `${safe}.md`);
      validateVaultPath(fp, root);
      if (!(await exists(fp))) return { ok: false, error: '見つかりません' };
      await fs.unlink(fp);
      return { ok: true };
    },

    'vault:renameNote': async (_e: unknown, vaultPath: string, oldPath: string, newName: string) => {
      const root = path.resolve(vaultPath);
      validateVaultPath(oldPath, root);
      const trimmed = newName.trim();
      if (!trimmed) return { ok: false, error: '新しい名前が空です' };
      const safe = trimmed.replace(/[\\/:*?"<>|]/g, '_').replace(/\.md$/, '');
      if (!safe) return { ok: false, error: '無効な名前です' };
      if (!(await exists(oldPath))) return { ok: false, error: '元のファイルが見つかりません' };
      const dir = path.dirname(oldPath);
      const oldName = path.basename(oldPath).replace(/\.md$/, '');
      const newPath = path.join(dir, `${safe}.md`);
      validateVaultPath(newPath, root);
      if (oldName === safe) return { ok: true, newPath, updatedFiles: 0 };
      if (await exists(newPath)) return { ok: false, error: '同名のファイルが既に存在します' };

      await fs.rename(oldPath, newPath);

      let updated = 0;
      async function walk(d: string) {
        const ents = await fs.readdir(d, { withFileTypes: true });
        for (const e of ents) {
          if (e.name.startsWith('.')) continue;
          const p = path.join(d, e.name);
          if (e.isDirectory()) {
            await walk(p);
          } else if (e.isFile() && (e.name.endsWith('.md') || e.name.endsWith('.markdown'))) {
            try {
              const content = await fs.readFile(p, 'utf-8');
              const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const re = new RegExp(`(!?)\\[\\[${escaped}((?:#[^\\]|]*)?(?:\\|[^\\]]*)?)\\]\\]`, 'g');
              let count = 0;
              const next = content.replace(re, (_m, bang, suffix) => {
                count++;
                return `${bang}[[${safe}${suffix}]]`;
              });
              if (count > 0) {
                await backupFile(p, root);
                await atomicWrite(p, next);
                updated += count;
              }
            } catch {}
          }
        }
      }
      await walk(root);
      return { ok: true, newPath, updatedFiles: updated };
    },

    'vault:deleteSubject': async (_e: unknown, vaultPath: string, subject: string) => {
      const root = path.resolve(vaultPath);
      const safe = safeSubjectName(subject);
      const dir = path.join(root, safe);
      validateVaultPath(dir, root);
      if (root === dir) return { ok: false, error: 'cannot delete vault root' };
      if (!(await exists(dir))) return { ok: false, error: '科目が見つかりません' };

      const trashDir = path.join(root, '.trash');
      await ensureDir(trashDir);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dest = path.join(trashDir, `${safe}_${stamp}`);
      await fs.rename(dir, dest);
      return { ok: true, trashedTo: dest };
    },

    'vault:deleteNote': async (_e: unknown, filePath: string) => {
      const root = getCurrentVaultPath();
      if (!root) return { ok: false, error: 'no active vault' };
      const resolved = validateVaultPath(filePath, root);
      if (!(await exists(resolved))) {
        return { ok: false, error: 'ファイルが見つかりません' };
      }
      const rel = path.relative(root, resolved);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        return { ok: false, error: 'パスが Vault の外を指しています' };
      }
      const trashDir = path.join(root, '.trash');
      await ensureDir(trashDir);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const ext = path.extname(rel);
      const baseRel = rel.slice(0, rel.length - ext.length);
      const destRel = `${baseRel}_${stamp}${ext}`;
      const dest = path.join(trashDir, destRel);
      validateVaultPath(dest, root);
      await ensureDir(path.dirname(dest));
      await fs.rename(resolved, dest);
      return { ok: true, trashedTo: dest };
    },

    'vault:duplicateNote': async (_e: unknown, filePath: string) => {
      const root = getCurrentVaultPath();
      if (!root) return { ok: false, error: 'no active vault' };
      const resolved = validateVaultPath(filePath, root);
      if (!(await exists(resolved))) {
        return { ok: false, error: 'ファイルが見つかりません' };
      }
      const dir = path.dirname(resolved);
      const ext = path.extname(resolved);
      const base = path.basename(resolved, ext);
      let candidate = path.join(dir, `${base} (copy)${ext}`);
      let n = 2;
      while (await exists(candidate)) {
        candidate = path.join(dir, `${base} (copy ${n})${ext}`);
        n += 1;
        if (n > 99) return { ok: false, error: '複製の上限に達しました' };
      }
      validateVaultPath(candidate, root);
      const content = await fs.readFile(resolved, 'utf-8');
      await atomicWrite(candidate, content);
      return { ok: true, newPath: candidate };
    },

    'vault:renameSubject': async (_e: unknown, vaultPath: string, oldName: string, newName: string) => {
      const root = path.resolve(vaultPath);
      const oldSafe = safeSubjectName(oldName);
      const newSafe = safeSubjectName(newName);
      if (!newSafe) return { ok: false, error: '新しい名前が空です' };
      if (oldSafe === newSafe) return { ok: true, newName: newSafe };
      const oldDir = path.join(root, oldSafe);
      const newDir = path.join(root, newSafe);
      validateVaultPath(oldDir, root);
      validateVaultPath(newDir, root);
      if (!(await exists(oldDir))) return { ok: false, error: '科目が見つかりません' };
      if (await exists(newDir)) return { ok: false, error: '同名の科目が既に存在します' };
      await fs.rename(oldDir, newDir);
      return { ok: true, newName: newSafe };
    },

    'vault:readBoard': async (_e: unknown, vaultPath: string, subject: string) => {
      const root = path.resolve(vaultPath);
      const safe = safeSubjectName(subject);
      const fp = path.join(root, safe, '.board.json');
      validateVaultPath(fp, root);
      if (!(await exists(fp))) return { nodes: [], edges: [] };
      try {
        const raw = await fs.readFile(fp, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          nodes: Array.isArray(parsed.nodes) ? parsed.nodes : [],
          edges: Array.isArray(parsed.edges) ? parsed.edges : [],
        };
      } catch {
        return { nodes: [], edges: [] };
      }
    },

    'vault:writeBoard': async (_e: unknown, vaultPath: string, subject: string, board: unknown) => {
      const root = path.resolve(vaultPath);
      const safe = safeSubjectName(subject);
      const fp = path.join(root, safe, '.board.json');
      validateVaultPath(fp, root);
      await ensureDir(path.dirname(fp));
      await atomicWrite(fp, JSON.stringify(board, null, 2));
      return { ok: true };
    },

    'vault:graphData': async (_e: unknown, vaultPath: string) => {
      const root = path.resolve(vaultPath);
      setCurrentVaultPath(root);
      const reserved = new Set(['Books', 'Memos']);
      if (!(await exists(root))) return { nodes: [], edges: [] };

      type Node = { id: string; label: string; subject?: string; category: string };
      type Edge = { source: string; target: string };
      const nodes: Node[] = [];
      const nodeIds = new Set<string>();
      const edges: Edge[] = [];
      const nameToId = new Map<string, string>();

      function addNode(id: string, label: string, category: string, subject?: string) {
        if (nodeIds.has(id)) return;
        nodeIds.add(id);
        nodes.push({ id, label, subject, category });
        nameToId.set(label, id);
      }

      const top = await fs.readdir(root, { withFileTypes: true });
      for (const e of top) {
        if (!e.isDirectory() || e.name.startsWith('.')) continue;
        const subjectName = reserved.has(e.name) ? undefined : e.name;
        const category =
          e.name === 'Books' ? 'book' : e.name === 'Memos' ? 'memo' : 'subject-note';

        if (subjectName) {
          const notesDir = path.join(root, subjectName, NOTES_DIR);
          if (await exists(notesDir)) {
            const files = await fs.readdir(notesDir);
            for (const f of files) {
              if (!f.endsWith('.md')) continue;
              const fp = path.join(notesDir, f);
              addNode(fp, f.replace(/\.md$/, ''), 'subject-note', subjectName);
            }
          }
          const overview = path.join(root, subjectName, '_概要.md');
          if (await exists(overview)) {
            addNode(overview, `_概要 (${subjectName})`, 'subject-overview', subjectName);
          }
        } else {
          const dir = path.join(root, e.name);
          const files = await fs.readdir(dir);
          for (const f of files) {
            if (!f.endsWith('.md')) continue;
            const fp = path.join(dir, f);
            addNode(fp, f.replace(/\.md$/, ''), category);
          }
        }
      }

      for (const node of nodes) {
        try {
          validateVaultPath(node.id, root);
          const content = await fs.readFile(node.id, 'utf-8');
          const re = /(!?)\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(content)) !== null) {
            const targetName = m[2].trim();
            const targetId = nameToId.get(targetName);
            if (targetId && targetId !== node.id) {
              edges.push({ source: node.id, target: targetId });
            }
          }
        } catch {}
      }

      return { nodes, edges };
    },

    'vault:listDailyNotes': async (_e: unknown, vaultPath: string, date?: string) => {
      const root = path.resolve(vaultPath);
      setCurrentVaultPath(root);
      const target = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayString();
      if (!(await exists(root))) return { date: target, entries: [] as Array<{ subject: string; filePath: string; exists: boolean; preview: string }> };
      const reserved = new Set(['Books', 'Memos']);
      const dirEntries = await fs.readdir(root, { withFileTypes: true });
      const subjects = dirEntries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !reserved.has(e.name))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b, 'ja'));
      const entries = await Promise.all(
        subjects.map(async (subject) => {
          const filePath = path.join(root, subject, NOTES_DIR, `${target}.md`);
          validateVaultPath(filePath, root);
          if (!(await exists(filePath))) {
            return { subject, filePath, exists: false, preview: '' };
          }
          try {
            const content = await fs.readFile(filePath, 'utf-8');
            const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
            const preview = body.replace(/\s+/g, ' ').slice(0, 200);
            return { subject, filePath, exists: true, preview };
          } catch {
            return { subject, filePath, exists: true, preview: '' };
          }
        })
      );
      return { date: target, entries };
    },

    'vault:installSample': async (_e: unknown, vaultPath: string) => {
      const root = path.resolve(vaultPath);
      validateVaultPath(root, root);

      const samples: Array<{ subject: string; file: string; content: string }> = [
        {
          subject: '論文ノート',
          file: 'Attention Is All You Need (Vaswani 2017).md',
          content: `---\ntitle: Attention Is All You Need (Vaswani 2017)\ntype: paper-note\ndate: 2025-04-15\ntags: [Transformer, NLP, 機械翻訳]\n---\n\n# Attention Is All You Need\n\nSample paper note.\n`,
        },
        {
          subject: '論文ノート',
          file: '論文を読むための 3 パス法.md',
          content: `---\ntitle: 論文を読むための 3 パス法\ntype: methodology\ndate: 2025-04-10\ntags: [research-skills]\n---\n\n# 論文を読むための 3 パス法\n\n## 関連\n- [[Attention Is All You Need (Vaswani 2017)]]\n`,
        },
        {
          subject: '研究計画',
          file: '研究テーマの絞り込み.md',
          content: `---\ntitle: 研究テーマの絞り込み\ntype: research-plan\ndate: 2025-04-08\ntags: [research-skills]\n---\n\n# 研究テーマの絞り込み\n\n## 関連\n- [[論文を読むための 3 パス法]]\n`,
        },
        {
          subject: '研究計画',
          file: '実験ログテンプレート.md',
          content: `---\ntitle: 実験ログテンプレート\ntype: template\ndate: 2025-04-09\ntags: [reproducibility]\n---\n\n# 実験ログテンプレート\n\n## 関連\n- [[研究テーマの絞り込み]]\n`,
        },
        {
          subject: '統計手法',
          file: 'ベイズ vs 頻度論.md',
          content: `---\ntitle: ベイズ vs 頻度論\ntype: concept-note\ndate: 2025-04-12\ntags: [統計, ベイズ]\n---\n\n# ベイズ vs 頻度論\n\n## 関連\n- [[Attention Is All You Need (Vaswani 2017)]]\n`,
        },
        {
          subject: '統計手法',
          file: 'p-hacking と再現性危機.md',
          content: `---\ntitle: p-hacking と再現性危機\ntype: concept-note\ndate: 2025-04-13\ntags: [統計, 再現性]\n---\n\n# p-hacking と再現性危機\n\n## 関連\n- [[ベイズ vs 頻度論]]\n- [[実験ログテンプレート]]\n`,
        },
      ];

      let created = 0;
      for (const s of samples) {
        const dir = path.join(root, s.subject, NOTES_DIR);
        validateVaultPath(dir, root);
        await ensureDir(dir);
        const full = path.join(dir, s.file);
        validateVaultPath(full, root);
        try {
          await fs.access(full);
          continue;
        } catch {
          // proceed
        }
        await atomicWrite(full, s.content);
        created += 1;
      }

      const overviews: Record<string, string> = {
        '論文ノート': `# 論文ノート\n\n読んだ論文の要約を記録するスペースです。\n`,
        '研究計画': `# 研究計画\n\n研究テーマの絞り込み、実験ログ、進捗管理のスペース。\n`,
        '統計手法': `# 統計手法\n\n統計的概念を自分の言葉でまとめる。\n`,
      };
      for (const [subject, content] of Object.entries(overviews)) {
        const overview = path.join(root, subject, '_概要.md');
        validateVaultPath(overview, root);
        try {
          await fs.access(overview);
        } catch {
          await atomicWrite(overview, content);
        }
      }

      return { ok: true, created };
    },
  };
}

export function registerVaultHandlers() {
  const handlers = createVaultHandlers();
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }
}
