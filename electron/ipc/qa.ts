import { ipcMain, BrowserWindow } from 'electron';
import { spawn, execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { loadSelectedAiApiKey, loadSettings, selectedAiModel } from './settings';
import {
  validateVaultPath,
  atomicWrite,
  ensureDir as utilsEnsureDir,
  sanitizeForPrompt,
  findClaudePath,
} from './utils';
import { runPrompt } from '../ai/provider';

// Maximum length of past Q&A log we include in the system prompt.
const MAX_QA_LOG = 50_000;
// Maximum length per recent-note preview block.
const MAX_NOTE_PREVIEW = 3000;
const QA_TIMEOUT_MS = 5 * 60 * 1000;

const SYSTEM_PROMPT = `あなたは丁寧な家庭教師です。学生が授業ノートや講義資料の内容について質問してきます。

# 役割
- 質問に対して、わかりやすく段階的に説明する
- 必要に応じて具体例や図(テキストで表現)を用いる
- 学生が混乱しないよう、専門用語は最初に簡単に定義する
- 過去の同じ科目の質問履歴があれば、そこで使われた説明スタイルや知識レベルに合わせる

# 出力フォーマット
- Markdown を使ってよい (見出し、箇条書き、コードブロック、数式は \`$...$\` または \`$$...$$\`)
- 長すぎる説明は避け、ポイントを絞る
- 最後に「他に気になる点はありますか?」のような確認は不要 (学生が必要なら追加で聞きます)
- ツールを呼ばずに、知識のみで回答する`;


function qaLogPath(vaultPath: string, subject: string): string {
  return path.join(vaultPath, subject, 'qa', 'log.md');
}

const ensureDir = utilsEnsureDir;

async function readLog(vaultPath: string, subject: string): Promise<string> {
  try {
    return await fs.readFile(qaLogPath(vaultPath, subject), 'utf-8');
  } catch {
    return '';
  }
}

async function appendLog(
  vaultPath: string,
  subject: string,
  q: string,
  a: string
): Promise<void> {
  const root = path.resolve(vaultPath);
  const file = qaLogPath(root, subject);
  validateVaultPath(file, root);
  await ensureDir(path.dirname(file));
  const ts = new Date();
  const stamp = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}-${String(
    ts.getDate()
  ).padStart(2, '0')} ${String(ts.getHours()).padStart(2, '0')}:${String(
    ts.getMinutes()
  ).padStart(2, '0')}`;
  const block = `\n\n## ${stamp} — Q\n${q.trim()}\n\n## ${stamp} — A\n${a.trim()}\n\n---\n`;
  let existing = '';
  try {
    existing = await fs.readFile(file, 'utf-8');
  } catch {
    existing = `# ${subject} — AI Q&A ログ\n\nアプリの「AIに質問」機能で行った質問と回答が時系列で蓄積され、次の質問のコンテキストとして使われます。\n`;
  }
  await atomicWrite(file, existing + block);
}

async function previewRecentNotes(vaultPath: string, subject: string): Promise<string> {
  try {
    const root = path.resolve(vaultPath);
    const dir = path.join(root, subject, 'notes');
    validateVaultPath(dir, root);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = entries.filter((e) => e.isFile() && e.name.endsWith('.md'));
    if (files.length === 0) return '';
    const stats = await Promise.all(
      files.map(async (f) => ({
        name: f.name,
        path: path.join(dir, f.name),
        mtime: (await fs.stat(path.join(dir, f.name))).mtimeMs,
      }))
    );
    stats.sort((a, b) => b.mtime - a.mtime);
    const picks = stats.slice(0, 3);
    const parts: string[] = [];
    for (const p of picks) {
      validateVaultPath(p.path, root);
      const content = await fs.readFile(p.path, 'utf-8');
      const trimmed =
        content.length > MAX_NOTE_PREVIEW
          ? content.slice(0, MAX_NOTE_PREVIEW) + '\n...(略)'
          : content;
      // Sanitize so a malicious note can't escape the system prompt's structure.
      parts.push(`### ${p.name}\n\n${sanitizeForPrompt(trimmed)}`);
    }
    return parts.join('\n\n');
  } catch {
    return '';
  }
}

async function readOverview(vaultPath: string, subject: string): Promise<string> {
  try {
    return await fs.readFile(path.join(vaultPath, subject, '_概要.md'), 'utf-8');
  } catch {
    return '';
  }
}

function buildSystemPrompt(
  subject: string,
  pastLog: string,
  notesPreview: string,
  overview: string
): string {
  const trimmedLog = pastLog.length > MAX_QA_LOG ? pastLog.slice(-MAX_QA_LOG) : pastLog;
  return `${SYSTEM_PROMPT}

# 現在の科目
${subject}

# 科目概要
${overview || '(概要未記入)'}

# 最近のノート抜粋
${notesPreview || '(ノートはまだありません)'}

# この科目の過去のQ&Aログ
${trimmedLog || '(まだ質問履歴がありません)'}
`;
}

export async function checkClaudeStatus(): Promise<{
  installed: boolean;
  path?: string;
  loggedIn: boolean;
  error?: string;
}> {
  const p = await findClaudePath();
  if (!p) return { installed: false, loggedIn: false, error: 'claude CLI が見つかりません' };
  return new Promise((resolve) => {
    execFile(p, ['--version'], { windowsHide: true }, (err) => {
      if (err) return resolve({ installed: false, loggedIn: false, error: String(err) });
      resolve({ installed: true, path: p, loggedIn: true });
    });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createQAHandlers(): Record<string, (...args: any[]) => any> {
  return {
    'qa:readLog': async (_e: unknown, vaultPath: string, subject: string) => {
      return readLog(vaultPath, subject);
    },

    'qa:status': async () => {
      return checkClaudeStatus();
    },

    'qa:login': async () => {
      const p = await findClaudePath();
      if (!p) return { ok: false, error: 'claude CLI が見つかりません' };
      if (process.platform === 'win32') {
        spawn('cmd.exe', ['/c', 'start', '"Claude Login"', 'cmd', '/k', `"${p}" auth login`], {
          detached: true,
          windowsHide: false,
        }).unref();
      } else {
        spawn(p, ['auth', 'login'], { detached: true }).unref();
      }
      return { ok: true };
    },

    'qa:ask': async (e: Electron.IpcMainInvokeEvent, vaultPath: string, subject: string, question: string) => {
      const win = BrowserWindow.fromWebContents(e.sender);
      if (!win) return { ok: false, error: 'window not available' };

      const settings = await loadSettings();
      const provider = settings.aiProvider ?? 'claude';

      // Sanitize user-supplied inputs before embedding them anywhere.
      const safeQuestion = sanitizeForPrompt(question);
      const safeSubject = sanitizeForPrompt(subject).replace(/\s+/g, ' ').slice(0, 200);
      if (!safeQuestion.trim()) {
        win.webContents.send('qa:error', { error: '質問が空です' });
        return { ok: false, error: 'empty question' };
      }

      const pastLog = await readLog(vaultPath, subject);
      const notesPreview = await previewRecentNotes(vaultPath, subject);
      const overview = await readOverview(vaultPath, subject);
      const systemPrompt = buildSystemPrompt(safeSubject, pastLog, notesPreview, overview);

      if (provider === 'none') {
        win.webContents.send('qa:error', {
          error: 'AI 機能が無効です。Settings から有効にしてください。',
        });
        return { ok: false, error: 'ai disabled' };
      }

      if (!(provider === 'claude' && settings.aiAuthMode === 'login')) {
        const apiKey = await loadSelectedAiApiKey(settings);
        if (settings.aiAuthMode === 'api-key' && !apiKey) {
          win.webContents.send('qa:error', { error: 'API キーが未設定です。Settings で登録してください。' });
          return { ok: false, error: 'no api key' };
        }
        const result = await runPrompt(provider, {
          authMode: settings.aiAuthMode,
          prompt: safeQuestion,
          systemPrompt,
          apiKey: apiKey ?? undefined,
          model: selectedAiModel(settings),
          onEvent: (ev) => {
            if (ev.type === 'chunk') {
              win.webContents.send('qa:chunk', { text: ev.text });
            } else if (ev.type === 'error') {
              win.webContents.send('qa:error', { error: ev.error });
            }
          },
        });
        if (result.ok) {
          win.webContents.send('qa:done', { text: result.text, usage: result.usage ?? {} });
          if (result.text.trim()) {
            await appendLog(vaultPath, subject, question, result.text);
          }
          return { ok: true, text: result.text };
        } else {
          return { ok: false, error: result.error };
        }
      }

      // Claude login path retains the original stream-json richness.
      const claudePath = await findClaudePath();
      if (!claudePath) {
        win.webContents.send('qa:error', {
          error:
            'claude CLI が見つかりません。Claude Code をインストールするか、Settings で API キーを設定してください。',
        });
        return { ok: false, error: 'claude not found' };
      }

      const model = selectedAiModel(settings) || settings.model || 'sonnet';
      const effort = settings.effort || 'high';

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'classnotes-qa-'));
      const mcpFile = path.join(tmpDir, 'mcp.json');
      await fs.writeFile(mcpFile, JSON.stringify({ mcpServers: {} }), 'utf-8');

      const args = [
        '-p',
        '--output-format',
        'stream-json',
        '--include-partial-messages',
        '--verbose',
        '--no-session-persistence',
        '--strict-mcp-config',
        '--mcp-config',
        mcpFile,
        '--model',
        model,
        '--effort',
        effort,
      ];
      const stdinPrompt = `${systemPrompt}\n\n---\n\n${safeQuestion}`;

      return new Promise((resolve) => {
        const proc = spawn(claudePath, args, {
          shell: false,
          cwd: tmpDir,
          windowsHide: true,
          env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
        });

        let buffer = '';
        let fullText = '';
        let usage: Record<string, number> = {};
        let stderrBuf = '';
        let killed = false;
        const watchdog = setTimeout(() => {
          killed = true;
          try {
            proc.kill('SIGTERM');
          } catch {
            // ignore
          }
        }, QA_TIMEOUT_MS);

        proc.stdout.setEncoding('utf-8');
        proc.stdout.on('data', (chunk: string) => {
          buffer += chunk;
          let nl: number;
          while ((nl = buffer.indexOf('\n')) >= 0) {
            const line = buffer.slice(0, nl).trim();
            buffer = buffer.slice(nl + 1);
            if (!line) continue;
            let obj: Record<string, unknown>;
            try {
              obj = JSON.parse(line);
            } catch {
              continue;
            }

            if (
              obj.type === 'stream_event' &&
              (obj as { event?: { type?: string; delta?: { type?: string; text?: string } } }).event
                ?.type === 'content_block_delta'
            ) {
              const ev = (obj as { event: { delta: { type: string; text: string } } }).event;
              if (ev.delta.type === 'text_delta' && typeof ev.delta.text === 'string') {
                fullText += ev.delta.text;
                win.webContents.send('qa:chunk', { text: ev.delta.text });
              }
            } else if (obj.type === 'result') {
              const r = obj as {
                result?: string;
                total_cost_usd?: number;
                usage?: Record<string, number>;
                is_error?: boolean;
                api_error_status?: string | null;
              };
              if (r.is_error) {
                win.webContents.send('qa:error', {
                  error: r.api_error_status || 'API エラーが発生しました',
                });
              }
              if (typeof r.result === 'string' && fullText.length === 0) {
                fullText = r.result;
              }
              if (r.usage) {
                usage = {
                  input: r.usage.input_tokens ?? 0,
                  output: r.usage.output_tokens ?? 0,
                  cacheRead: r.usage.cache_read_input_tokens ?? 0,
                  cacheCreate: r.usage.cache_creation_input_tokens ?? 0,
                };
              }
              if (typeof r.total_cost_usd === 'number') {
                usage.costUsdMicro = Math.round(r.total_cost_usd * 1_000_000);
              }
            }
          }
        });

        proc.stderr.setEncoding('utf-8');
        proc.stderr.on('data', (d: string) => {
          stderrBuf += d;
        });
        proc.stdin.on('error', () => {
          // If the CLI exits before reading stdin, close handling below reports it.
        });
        proc.stdin.end(stdinPrompt);

        proc.on('error', (err) => {
          clearTimeout(watchdog);
          win.webContents.send('qa:error', { error: String(err) });
          fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
          resolve({ ok: false, error: String(err) });
        });

        proc.on('close', async (code) => {
          clearTimeout(watchdog);
          await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

          if (killed) {
            const errMsg = `タイムアウト (${Math.round(QA_TIMEOUT_MS / 60000)} 分)`;
            win.webContents.send('qa:error', { error: errMsg });
            return resolve({ ok: false, error: errMsg });
          }

          if (code !== 0 && fullText.length === 0) {
            const errMsg =
              stderrBuf.trim() ||
              `claude が終了コード ${code} で終了しました。'claude auth login' でログイン済みか確認してください。`;
            win.webContents.send('qa:error', { error: errMsg });
            return resolve({ ok: false, error: errMsg });
          }

          win.webContents.send('qa:done', { text: fullText, usage });
          if (fullText.trim()) {
            await appendLog(vaultPath, subject, question, fullText);
          }
          resolve({ ok: true, text: fullText });
        });
      });
    },
  };
}

export function registerQAHandlers() {
  const handlers = createQAHandlers();
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }
}
