import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

const root = process.cwd();
const electronDir = path.join(root, 'electron');
const outPath = path.join(root, 'security', 'ipc-surface.json');

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      yield full;
    }
  }
}

function collect(pattern, text, filePath) {
  const rows = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const before = text.slice(0, match.index);
    rows.push({
      channel: match[1],
      file: path.relative(root, filePath).split(path.sep).join('/'),
      line: before.split(/\r?\n/).length,
    });
  }
  return rows;
}

const mainHandlers = [];
const preloadInvokes = [];
const rendererEvents = [];

for await (const filePath of walk(electronDir)) {
  const text = await readFile(filePath, 'utf-8');
  // Traditional pattern: ipcMain.handle('channel', ...)
  mainHandlers.push(...collect(/ipcMain\.handle\(\s*['"`]([^'"`]+)['"`]/g, text, filePath));
  // Factory pattern: 'channel:name': async (...)  — keys in createXHandlers() return objects
  mainHandlers.push(...collect(/['"]([a-zA-Z]+:[a-zA-Z][a-zA-Z0-9:]*)['"]\s*:\s*async\s/g, text, filePath));
  preloadInvokes.push(...collect(/ipcRenderer\.invoke\(\s*['"`]([^'"`]+)['"`]/g, text, filePath));
  rendererEvents.push(...collect(/ipcRenderer\.(?:on|once)\(\s*['"`]([^'"`]+)['"`]/g, text, filePath));
}

// Deduplicate mainHandlers by channel (factory + register patterns may both match)
const seenChannels = new Map();
for (const row of mainHandlers) {
  if (!seenChannels.has(row.channel)) {
    seenChannels.set(row.channel, row);
  }
}
const dedupedHandlers = [...seenChannels.values()];

const handled = new Set(dedupedHandlers.map((row) => row.channel));
const invoked = new Set(preloadInvokes.map((row) => row.channel));
const missingHandlers = [...invoked].filter((channel) => !handled.has(channel)).sort();
const unexposedHandlers = [...handled].filter((channel) => !invoked.has(channel)).sort();

const manifest = {
  generatedAt: new Date().toISOString(),
  counts: {
    mainHandlers: dedupedHandlers.length,
    preloadInvokes: preloadInvokes.length,
    rendererEvents: rendererEvents.length,
    missingHandlers: missingHandlers.length,
    unexposedHandlers: unexposedHandlers.length,
  },
  mainHandlers: dedupedHandlers.sort((a, b) => a.channel.localeCompare(b.channel)),
  preloadInvokes: preloadInvokes.sort((a, b) => a.channel.localeCompare(b.channel)),
  rendererEvents: rendererEvents.sort((a, b) => a.channel.localeCompare(b.channel)),
  missingHandlers,
  unexposedHandlers,
};

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

if (missingHandlers.length > 0) {
  console.error(`IPC surface has ${missingHandlers.length} preload invoke(s) without handlers.`);
  for (const ch of missingHandlers) {
    console.error(`  - ${ch}`);
  }
  process.exit(1);
}

console.info(
  `Wrote ${path.relative(root, outPath)} with ${dedupedHandlers.length} handler(s) and ${preloadInvokes.length} invoke(s).`
);
