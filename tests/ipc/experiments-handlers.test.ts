// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createTempVault, readFile, fileExists } from './_vault-harness';
import { setCurrentVaultPath } from '../../electron/ipc/utils';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(s),
    decryptString: (b: Buffer) => b.toString(),
  },
  dialog: { showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }) },
  shell: { openPath: vi.fn() },
}));

vi.mock('../../electron/ai/provider', () => ({
  runPrompt: vi.fn(),
  setOfflineMode: vi.fn(),
  isOfflineMode: vi.fn(() => false),
}));

vi.mock('../../electron/ipc/settings', () => ({
  loadSettings: vi.fn().mockResolvedValue({ aiProvider: 'claude', aiAuthMode: 'apiKey' }),
  loadSelectedAiApiKey: vi.fn().mockResolvedValue('test-key'),
  selectedAiModel: vi.fn().mockReturnValue('claude-sonnet-4-20250514'),
}));

vi.mock('../../electron/ipc/file-access', () => ({
  consumeFileAccessGrant: vi.fn(),
  createFileAccessGrant: vi.fn().mockReturnValue('test-token'),
  isLikelyFileAccessToken: vi.fn().mockReturnValue(false),
}));

vi.mock('../../electron/pdf-text', () => ({
  extractPdfTextFromBuffer: vi.fn().mockResolvedValue({ text: '', pageCount: 0 }),
  imageOnlyPdfError: vi.fn().mockReturnValue('Image-only PDF'),
}));

import { createExperimentHandlers } from '../../electron/ipc/experiments';

type Handlers = ReturnType<typeof createExperimentHandlers>;
let h: Handlers;
let root: string;
let cleanup: () => Promise<void>;

beforeEach(async () => {
  vi.clearAllMocks();
  const vault = await createTempVault();
  root = vault.root;
  cleanup = vault.cleanup;
  setCurrentVaultPath(root);
  h = createExperimentHandlers();
});

afterEach(async () => {
  setCurrentVaultPath(null);
  await cleanup();
});

async function writeExperiment(name: string, meta: Record<string, string>): Promise<string> {
  const dir = path.join(root, 'experiments');
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${name}.md`);
  const frontmatter = Object.entries(meta).map(([k, v]) => `${k}: ${v}`).join('\n');
  await fs.writeFile(filePath, `---\n${frontmatter}\n---\n\n# ${name}\n\nExperiment content.`, 'utf-8');
  return filePath;
}

describe('experiments:list', () => {
  it('returns empty when no experiment files', async () => {
    const result = await h['experiments:list'](null, root);
    expect(result).toEqual([]);
  });

  it('lists experiment files with type: experiment frontmatter', async () => {
    await writeExperiment('exp1', { type: 'experiment', title: 'Experiment 1', status: 'running' });
    await writeExperiment('exp2', { type: 'experiment', title: 'Experiment 2', status: 'done' });

    const result = await h['experiments:list'](null, root);
    expect(result).toHaveLength(2);
    expect(result.map((e: { title: string }) => e.title)).toEqual(
      expect.arrayContaining(['Experiment 1', 'Experiment 2'])
    );
  });

  it('ignores non-experiment files', async () => {
    await writeExperiment('note', { type: 'note', title: 'Just a note' });
    await writeExperiment('exp', { type: 'experiment', title: 'Real experiment' });

    const result = await h['experiments:list'](null, root);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Real experiment');
  });

  it('extracts status, dataset, model from frontmatter', async () => {
    await writeExperiment('full', {
      type: 'experiment',
      title: 'Full metadata',
      status: 'completed',
      dataset: 'CIFAR-10',
      model: 'ResNet-50',
    });

    const result = await h['experiments:list'](null, root);
    expect(result[0].status).toBe('completed');
    expect(result[0].dataset).toBe('CIFAR-10');
    expect(result[0].model).toBe('ResNet-50');
  });
});

describe('experiments:generateLineageReport', () => {
  it('generates a lineage report file', async () => {
    await writeExperiment('baseline', {
      type: 'experiment',
      title: 'Baseline',
      status: 'done',
    });
    await writeExperiment('improved', {
      type: 'experiment',
      title: 'Improved',
      status: 'running',
      parent: 'Baseline',
    });

    const result = await h['experiments:generateLineageReport'](null, root);
    expect(result.ok).toBe(true);
    expect(result.count).toBe(2);
    expect(await fileExists(result.filePath)).toBe(true);
    const content = await readFile(result.filePath);
    expect(content).toContain('実験系譜レポート');
  });

  it('handles empty experiments', async () => {
    const result = await h['experiments:generateLineageReport'](null, root);
    expect(result.ok).toBe(true);
    expect(result.count).toBe(0);
  });
});

describe('experiments:generateReproPackage', () => {
  it('generates reproducibility package', async () => {
    const filePath = await writeExperiment('repro-test', {
      type: 'experiment',
      title: '"Repro Test"',
      status: 'done',
      dataset: 'test-data',
      model: 'test-model',
    });

    const result = await h['experiments:generateReproPackage'](null, root, filePath);
    expect(result.ok).toBe(true);
    expect(result.files).toHaveLength(4);
    expect(result.outputDir).toContain('Outputs');
  });

  it('returns error for non-existent file', async () => {
    const fakePath = path.join(root, 'nonexistent.md');
    const result = await h['experiments:generateReproPackage'](null, root, fakePath);
    expect(result.ok).toBe(false);
  });
});

describe('experiments:pickPDFFile', () => {
  it('returns null when dialog is cancelled', async () => {
    const result = await h['experiments:pickPDFFile']({ sender: { id: 1 } });
    expect(result).toBeNull();
  });
});
