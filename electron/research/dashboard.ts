import * as fs from 'fs/promises';
import * as path from 'path';
import { validateVaultPath, ensureDir, exists, atomicWrite } from '../ipc/utils';
import { getVaultIndex, type VaultIndexFile } from '../vault-index';

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

const RESEARCH_DIR = 'Research';
const DEADLINES_FILE = 'deadlines.json';

const SEED_DEADLINES: ResearchDeadline[] = [
  { id: 'neurips-2026', name: 'NeurIPS 2026', due: '2026-05-15', url: 'https://neurips.cc/' },
  { id: 'iclr-2027', name: 'ICLR 2027', due: '2026-09-25', url: 'https://iclr.cc/' },
  { id: 'acl-2026', name: 'ACL 2026', due: '2026-02-10', url: 'https://aclweb.org/' },
];

export function deadlinesPath(vaultPath: string): string {
  const root = path.resolve(vaultPath);
  return validateVaultPath(path.join(root, RESEARCH_DIR, DEADLINES_FILE), root);
}

export function daysUntil(iso: string, now: Date = new Date()): number {
  const due = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(due.getTime())) return 0;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.ceil((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function normalizeDeadline(input: unknown): ResearchDeadline | null {
  if (!input || typeof input !== 'object') return null;
  const d = input as Partial<ResearchDeadline>;
  if (typeof d.name !== 'string' || !d.name.trim()) return null;
  if (typeof d.due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.due)) return null;
  return {
    id: typeof d.id === 'string' && d.id ? d.id : `deadline-${Date.now()}`,
    name: d.name.trim().slice(0, 120),
    due: d.due,
    url: typeof d.url === 'string' && /^https?:\/\//i.test(d.url) ? d.url : undefined,
  };
}

export async function readDeadlines(vaultPath: string): Promise<ResearchDeadline[]> {
  const file = deadlinesPath(vaultPath);
  if (!(await exists(file))) return SEED_DEADLINES;
  try {
    const raw = await fs.readFile(file, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return SEED_DEADLINES;
    const list = parsed.map(normalizeDeadline).filter(Boolean) as ResearchDeadline[];
    return list.length > 0 ? list : SEED_DEADLINES;
  } catch {
    return SEED_DEADLINES;
  }
}

export async function writeDeadlines(
  vaultPath: string,
  deadlines: ResearchDeadline[]
): Promise<ResearchDeadline[]> {
  const root = path.resolve(vaultPath);
  const file = deadlinesPath(root);
  const list = deadlines.map(normalizeDeadline).filter(Boolean) as ResearchDeadline[];
  await ensureDir(path.dirname(file));
  await atomicWrite(file, JSON.stringify(list, null, 2) + '\n');
  return list;
}

function recordActivity(buckets: Map<string, number>, mtime: number, startMs: number): void {
  if (mtime < startMs) return;
  const date = new Date(mtime).toISOString().slice(0, 10);
  buckets.set(date, (buckets.get(date) ?? 0) + 1);
}

function pushRecent<T extends { mtime: number }>(arr: T[], item: T, limit = 12): void {
  arr.push(item);
  arr.sort((a, b) => b.mtime - a.mtime);
  if (arr.length > limit) arr.length = limit;
}

function absoluteFromRel(root: string, relPath: string): string {
  return path.join(root, ...relPath.split('/'));
}

function isCollectionNote(file: VaultIndexFile, collection: 'Papers' | 'Books'): boolean {
  if (file.kind !== 'note') return false;
  const parts = file.relPath.split('/');
  if (parts.length !== 2 || parts[0] !== collection) return false;
  const name = parts[1];
  return !name.startsWith('_') && !name.endsWith('_reading.md');
}

function lectureScope(file: VaultIndexFile): { subject: string } | null {
  if (file.kind !== 'note') return null;
  const parts = file.relPath.split('/');
  if (parts.length < 3 || parts[1] !== 'notes') return null;
  if (['Books', 'Papers', 'Research', 'Wiki', 'Outputs'].includes(parts[0])) return null;
  return { subject: parts[0] };
}

export async function getResearchDashboard(vaultPath: string): Promise<ResearchDashboard> {
  const root = path.resolve(vaultPath);
  validateVaultPath(root, root);
  const deadlines = (await readDeadlines(root))
    .map((d) => ({ ...d, days: daysUntil(d.due) }))
    .filter((d) => d.days >= -7)
    .sort((a, b) => a.days - b.days);

  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 89);
  const startMs = start.getTime();
  const activityBuckets = new Map<string, number>();
  const tagCounts = new Map<string, number>();

  const papers: ResearchDashboard['papers'] = { total: 0, byStatus: {}, recent: [] };
  const books: ResearchDashboard['books'] = { total: 0, byStatus: {}, recent: [] };
  const lectures: ResearchDashboard['lectures'] = { subjects: 0, notes: 0, recent: [] };
  let orphanCount = 0;
  const subjects = new Set<string>();
  const index = await getVaultIndex(root);

  for (const file of index.files) {
    if (isCollectionNote(file, 'Papers')) {
      const full = absoluteFromRel(root, file.relPath);
      const status =
        typeof file.frontmatter.status === 'string' ? file.frontmatter.status : 'to-read';
    papers.total += 1;
    papers.byStatus[status] = (papers.byStatus[status] ?? 0) + 1;
      pushRecent(papers.recent, { filePath: full, title: file.title, status, mtime: file.mtimeMs });
      recordActivity(activityBuckets, file.mtimeMs, startMs);
      if (file.wikilinks.length === 0) orphanCount += 1;
      continue;
    }

    if (isCollectionNote(file, 'Books')) {
      const full = absoluteFromRel(root, file.relPath);
      const status =
        typeof file.frontmatter.status === 'string' ? file.frontmatter.status : 'want-to-read';
    books.total += 1;
    books.byStatus[status] = (books.byStatus[status] ?? 0) + 1;
      pushRecent(books.recent, { filePath: full, title: file.title, status, mtime: file.mtimeMs });
      recordActivity(activityBuckets, file.mtimeMs, startMs);
      if (file.wikilinks.length === 0) orphanCount += 1;
      continue;
    }

    const lecture = lectureScope(file);
    if (!lecture) continue;
    const full = absoluteFromRel(root, file.relPath);
    subjects.add(lecture.subject);
    lectures.notes += 1;
    recordActivity(activityBuckets, file.mtimeMs, startMs);
    for (const tag of file.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
    if (file.wikilinks.length === 0) orphanCount += 1;
    pushRecent(lectures.recent, {
      filePath: full,
      title: file.title,
      subject: lecture.subject,
      mtime: file.mtimeMs,
    });
  }

  lectures.subjects = subjects.size;

  const activity: ResearchDashboard['activity'] = [];
  for (let i = 0; i < 90; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    activity.push({ date: iso, count: activityBuckets.get(iso) ?? 0 });
  }

  const topTags = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return {
    deadlines,
    papers,
    books,
    lectures,
    wikiHealth: {
      orphanCount,
      tagCount: tagCounts.size,
      topTags,
    },
    activity,
  };
}
