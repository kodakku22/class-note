// Web Clipper — Obsidian Skill #2 equivalent.
//
// Uses Defuddle (https://github.com/kepano/defuddle) to strip ads, navigation,
// and boilerplate from a fetched URL, then converts the clean DOM to
// Markdown. The output is saved to <vault>/Web/<safe-title>.md with
// frontmatter (source URL, capture date, byline if available).
//
// Token efficiency: Defuddle reduces a typical news article from ~50 KB of
// HTML+ads to ~3-8 KB of clean Markdown — a 5-15x token saving when the
// clip is fed to AI agents downstream.
import { ipcMain, net } from 'electron';
import * as path from 'path';
import {
  validateVaultPath,
  atomicWrite,
  ensureDir,
  exists,
  safeName,
} from './utils';
import { stringifyFrontmatter } from './frontmatter';
import { logger } from '../logger';
import { RetryableHttpError, withResilience } from '../net/resilience';
import { PRIVATE_NETWORK_URL_ERROR, validatePublicHttpUrl } from '../net/url-security';

const WEB_DIR = 'Web';

type ClipResult = {
  ok: true;
  filePath: string;
  title: string;
  byline?: string;
  wordCount: number;
};

type ClipFailure = { ok: false; error: string };

/**
 * Fetch a URL using Electron's net module (respects proxy + system
 * certificates). Returns the body as a UTF-8 string. We cap at 5 MB to
 * avoid pathological pages.
 */
type FetchOnceResult =
  | { kind: 'html'; html: string }
  | { kind: 'redirect'; location: string };

async function fetchHTMLOnce(url: string): Promise<FetchOnceResult> {
  return new Promise((resolve, reject) => {
    const req = net.request({ method: 'GET', url, redirect: 'manual' });
    req.setHeader('user-agent', 'Mozilla/5.0 ClassNotes WebClipper');
    req.setHeader('accept', 'text/html,application/xhtml+xml');
    let buf: Buffer[] = [];
    let total = 0;
    const MAX = 5 * 1024 * 1024;
    const timeout = setTimeout(() => {
      req.abort();
      reject(new Error('タイムアウト (30s)'));
    }, 30_000);
    req.on('response', (resp) => {
      if (resp.statusCode >= 300 && resp.statusCode < 400) {
        clearTimeout(timeout);
        const locationHeader = resp.headers.location ?? resp.headers.Location;
        const location = Array.isArray(locationHeader) ? locationHeader[0] : locationHeader;
        if (!location) {
          reject(new Error('リダイレクト先がありません'));
          return;
        }
        resolve({ kind: 'redirect', location: String(location) });
        return;
      }
      if (resp.statusCode < 200 || resp.statusCode >= 300) {
        clearTimeout(timeout);
        reject(new RetryableHttpError(resp.statusCode));
        return;
      }
      resp.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX) {
          clearTimeout(timeout);
          req.abort();
          reject(new Error('ページサイズが上限を超えています (5 MB)'));
          return;
        }
        buf.push(chunk);
      });
      resp.on('end', () => {
        clearTimeout(timeout);
        resolve({ kind: 'html', html: Buffer.concat(buf).toString('utf-8') });
      });
      resp.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
    req.on('error', (err: Error) => {
      clearTimeout(timeout);
      reject(err);
    });
    req.end();
  });
}

async function fetchHTML(url: string, maxRetries = 2): Promise<string> {
  let current = url;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const parsed = await validatePublicHttpUrl(current);
    const result = await withResilience(`web:${parsed.host || 'unknown'}`, () => fetchHTMLOnce(parsed.toString()), {
      maxRetries,
      baseDelayMs: 600,
      circuitBreaker: { failureThreshold: 3, cooldownMs: 30_000 },
    });
    if (result.kind === 'html') return result.html;
    current = new URL(result.location, parsed).toString();
  }
  throw new Error('リダイレクトが多すぎます');
}

/**
 * Parse the HTML through Defuddle (browser-side library — we use linkedom in
 * main to provide a lightweight DOM). Returns the cleaned Markdown plus metadata.
 *
 * Defuddle expects a `Document` instance, so we feed it a linkedom-built one.
 */
async function defuddleHTML(
  html: string,
  url: string
): Promise<{ markdown: string; title: string; byline?: string; wordCount: number }> {
  // Lazy require so the renderer bundle never sees these.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { parseHTML } = require('linkedom') as typeof import('linkedom');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Defuddle } = require('defuddle') as { Defuddle: new (doc: Document) => { parse(): { content?: string; title?: string; byline?: string; wordCount?: number } } };

  const { document } = parseHTML(html);
  const base = document.createElement('base');
  base.href = url;
  document.head.prepend(base);
  const defuddle = new Defuddle(document as unknown as Document);
  const result = defuddle.parse();
  const markdown = (result.content ?? '').trim();
  return {
    markdown,
    title: result.title?.trim() || 'Untitled',
    byline: result.byline?.trim(),
    wordCount: result.wordCount ?? markdown.split(/\s+/).length,
  };
}

export function createWebHandlers() {
  return {
    /**
     * Clip a URL into a Markdown note under <vault>/Web/.
     * Idempotent: if the same URL was clipped before (matched by safe-name),
     * the new clip overwrites the old one (with backup via atomicWrite).
     */
    'web:clip': async (_e: unknown, vaultPath: string, url: string): Promise<ClipResult | ClipFailure> => {
      const root = path.resolve(vaultPath);
      validateVaultPath(root, root);

      try {
        await validatePublicHttpUrl(url);
      } catch (err) {
        const msg = String(err instanceof Error ? err.message : err);
        return {
          ok: false,
          error: msg.includes(PRIVATE_NETWORK_URL_ERROR) ? PRIVATE_NETWORK_URL_ERROR : msg,
        };
      }

      let html: string;
      try {
        html = await fetchHTML(url);
      } catch (err) {
        logger.warn('[web:clip] fetch failed', err);
        const msg = String(err instanceof Error ? err.message : err);
        if (msg.includes(PRIVATE_NETWORK_URL_ERROR)) {
          return { ok: false, error: PRIVATE_NETWORK_URL_ERROR };
        }
        return { ok: false, error: `取得失敗: ${String(err)}` };
      }

      let cleaned: Awaited<ReturnType<typeof defuddleHTML>>;
      try {
        cleaned = await defuddleHTML(html, url);
      } catch (err) {
        logger.error('[web:clip] defuddle failed', err);
        return { ok: false, error: `本文抽出失敗: ${String(err)}` };
      }
      if (!cleaned.markdown || cleaned.markdown.length < 50) {
        return { ok: false, error: '本文が抽出できませんでした (短すぎる)' };
      }

      const dir = path.join(root, WEB_DIR);
      await ensureDir(dir);
      const fileName = `${safeName(cleaned.title) || 'clip'}.md`;
      const full = path.join(dir, fileName);
      validateVaultPath(full, root);

      const meta: Record<string, unknown> = {
        title: cleaned.title,
        type: 'web-clip',
        source: url,
        capturedAt: new Date().toISOString(),
        wordCount: cleaned.wordCount,
        ...(cleaned.byline ? { byline: cleaned.byline } : {}),
      };
      const body = `# ${cleaned.title}\n\n> Source: <${url}>\n\n${cleaned.markdown}\n`;
      const content = stringifyFrontmatter(meta, body);

      // If a clip with the same name exists, atomicWrite overwrites — but
      // backupFile is run by some callers. Here we just overwrite (clipping
      // the same URL is meant to refresh).
      const wasNew = !(await exists(full));
      await atomicWrite(full, content);

      logger.info('[web:clip] ok', { url, fileName, wasNew, wordCount: cleaned.wordCount });
      return {
        ok: true,
        filePath: full,
        title: cleaned.title,
        byline: cleaned.byline,
        wordCount: cleaned.wordCount,
      };
    },
  };
}

export function registerWebHandlers() {
  const handlers = createWebHandlers();
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }
}
