// @vitest-environment node
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { describe, expect, it, afterEach } from 'vitest';
import {
  daysUntil,
  getResearchDashboard,
  readDeadlines,
  writeDeadlines,
} from '../../electron/research/dashboard';

const roots: string[] = [];

async function tempVault(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'classnotes-research-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe('research dashboard', () => {
  it('stores deadlines inside the vault', async () => {
    const root = await tempVault();
    const saved = await writeDeadlines(root, [
      { id: 'x', name: 'TestConf', due: '2026-06-01', url: 'https://example.com' },
    ]);
    expect(saved).toHaveLength(1);
    await expect(readDeadlines(root)).resolves.toEqual(saved);
  });

  it('computes day deltas from date-only deadlines', () => {
    expect(daysUntil('2026-05-15', new Date('2026-05-13T12:00:00'))).toBe(2);
  });

  it('aggregates papers, books, lectures, tags, and activity', async () => {
    const root = await tempVault();
    await mkdir(path.join(root, 'Papers'), { recursive: true });
    await mkdir(path.join(root, 'Books'), { recursive: true });
    await mkdir(path.join(root, 'MachineLearning', 'notes'), { recursive: true });
    await writeFile(
      path.join(root, 'Papers', 'Paper.md'),
      `---\ntitle: Test Paper\nstatus: reading\ntags: [ai]\n---\n# Test Paper\n[[MachineLearning]]\n`,
      'utf-8'
    );
    await writeFile(
      path.join(root, 'Books', 'Book.md'),
      `---\ntitle: Test Book\nstatus: done\n---\n# Test Book\n`,
      'utf-8'
    );
    await writeFile(
      path.join(root, 'MachineLearning', 'notes', 'Lecture.md'),
      `---\ntitle: Lecture 1\ntags: [ml, ai]\n---\n# Lecture\n[[Test Paper]]\n`,
      'utf-8'
    );

    const dashboard = await getResearchDashboard(root);
    expect(dashboard.papers.total).toBe(1);
    expect(dashboard.papers.byStatus.reading).toBe(1);
    expect(dashboard.books.total).toBe(1);
    expect(dashboard.books.byStatus.done).toBe(1);
    expect(dashboard.lectures.subjects).toBe(1);
    expect(dashboard.lectures.notes).toBe(1);
    expect(dashboard.wikiHealth.tagCount).toBe(2);
    expect(dashboard.activity).toHaveLength(90);
  });
});
