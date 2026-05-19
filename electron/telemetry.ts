// Anonymous usage telemetry — opt-in, batched, privacy-respecting.
//
// What we collect:
//   - Random anonymous user UUID (regenerated on cleared install)
//   - Coarse event counters: app_launched, vault_opened, note_created,
//     wiki_compiled, qa_asked
//   - OS family + app version
//
// What we DO NOT collect:
//   - Note content
//   - File paths
//   - User identity
//   - API keys
//   - Vault contents of any kind
//
// Events queue locally and flush once a day via the configured endpoint.
// If `TELEMETRY_ENDPOINT` is empty, this module is entirely a no-op.
import { app, net } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { TELEMETRY_ENDPOINT, APP_RELEASE } from './config';
import { logger } from './logger';

type Event = {
  type:
    | 'app_launched'
    | 'vault_opened'
    | 'note_created'
    | 'wiki_compiled'
    | 'qa_asked'
    // Phase 3-C: DocAI usage telemetry. Props are opt-in and never include
    // file paths or note content — only feature mode + outcome + duration.
    | 'docai_summary'
    | 'docai_ask'
    | 'docai_multi_analyze'
    | 'docai_generate';
  ts: number;
  /** Optional non-PII properties (mode, durationMs, ok, etc). */
  props?: Record<string, string | number | boolean>;
};

let cachedUserId: string | null = null;
let enabled = false;
let queue: Event[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function userIdPath(): string {
  return path.join(app.getPath('userData'), 'telemetry-id.txt');
}

function queuePath(): string {
  return path.join(app.getPath('userData'), 'telemetry-queue.json');
}

async function getOrCreateUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  try {
    const existing = await fs.readFile(userIdPath(), 'utf-8');
    cachedUserId = existing.trim();
    if (cachedUserId.length > 0) return cachedUserId;
  } catch {
    // create
  }
  cachedUserId = crypto.randomUUID();
  await fs.mkdir(path.dirname(userIdPath()), { recursive: true }).catch(() => {});
  await fs.writeFile(userIdPath(), cachedUserId, 'utf-8').catch(() => {});
  return cachedUserId;
}

async function loadQueue(): Promise<Event[]> {
  try {
    const raw = await fs.readFile(queuePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.slice(-1000);
  } catch {
    // empty
  }
  return [];
}

async function persistQueue(): Promise<void> {
  try {
    await fs.writeFile(queuePath(), JSON.stringify(queue.slice(-1000)), 'utf-8');
  } catch {
    // ignore
  }
}

/**
 * Initialize telemetry. Idempotent. Pass enabled=false to disable at runtime
 * (e.g. user toggled the opt-in off in Settings).
 */
export async function initTelemetry(opts: { enabled: boolean }): Promise<void> {
  enabled = opts.enabled && Boolean(TELEMETRY_ENDPOINT);
  if (!enabled) {
    logger.debug('[telemetry] disabled');
    return;
  }
  queue = await loadQueue();
  scheduleFlush();
  logger.info('[telemetry] enabled');
}

function scheduleFlush(): void {
  if (flushTimer) clearTimeout(flushTimer);
  // Flush once a day, OR sooner if the queue is large.
  const delayMs = queue.length > 100 ? 60_000 : 24 * 60 * 60 * 1000;
  flushTimer = setTimeout(flush, delayMs);
  flushTimer.unref?.();
}

export async function track(
  type: Event['type'],
  props?: Record<string, string | number | boolean>
): Promise<void> {
  if (!enabled) return;
  queue.push({ type, ts: Date.now(), ...(props ? { props } : {}) });
  await persistQueue();
  if (queue.length > 100) {
    scheduleFlush();
  }
}

async function flush(): Promise<void> {
  if (!enabled || queue.length === 0 || !TELEMETRY_ENDPOINT) return;
  const userId = await getOrCreateUserId();
  const payload = {
    userId,
    release: APP_RELEASE,
    platform: process.platform,
    events: queue,
  };
  try {
    const req = net.request({
      method: 'POST',
      url: TELEMETRY_ENDPOINT,
    });
    req.setHeader('content-type', 'application/json');
    await new Promise<void>((resolve, reject) => {
      req.on('response', (resp) => {
        if (resp.statusCode >= 200 && resp.statusCode < 300) {
          // success — clear queue
          queue = [];
          persistQueue().finally(resolve);
        } else {
          reject(new Error(`status ${resp.statusCode}`));
        }
      });
      req.on('error', reject);
      req.write(JSON.stringify(payload));
      req.end();
    });
    logger.debug('[telemetry] flushed', queue.length, 'events');
  } catch (err) {
    logger.warn('[telemetry] flush failed', err);
    // keep queue for next time
  } finally {
    scheduleFlush();
  }
}
