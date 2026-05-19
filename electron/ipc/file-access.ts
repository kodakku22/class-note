import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

export type FileAccessPurpose =
  | 'paper-pdf'
  | 'paper-bibtex'
  | 'pdf-markdown'
  | 'attachment-source';

export type FileAccessGrant = {
  token: string;
  fileName: string;
  size: number;
};

type GrantRecord = {
  filePath: string;
  fileName: string;
  size: number;
  purpose: FileAccessPurpose;
  senderId: number;
  expiresAt: number;
  used: boolean;
};

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const grants = new Map<string, GrantRecord>();

function nowMs(): number {
  return Date.now();
}

export function isLikelyFileAccessToken(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export async function createFileAccessGrant(
  filePath: string,
  purpose: FileAccessPurpose,
  senderId: number,
  ttlMs = DEFAULT_TTL_MS
): Promise<FileAccessGrant> {
  const resolved = path.resolve(filePath);
  const stat = await fs.stat(resolved);
  if (!stat.isFile()) {
    throw new Error('file access grant requires a regular file');
  }

  clearExpiredFileAccessGrants();
  const token = crypto.randomUUID();
  grants.set(token, {
    filePath: resolved,
    fileName: path.basename(resolved),
    size: stat.size,
    purpose,
    senderId,
    expiresAt: nowMs() + ttlMs,
    used: false,
  });
  return { token, fileName: path.basename(resolved), size: stat.size };
}

export async function consumeFileAccessGrant(
  token: string,
  purpose: FileAccessPurpose,
  senderId: number
): Promise<string> {
  const record = grants.get(token);
  if (!record) {
    throw new Error('file access grant is invalid or expired');
  }
  if (record.used) {
    grants.delete(token);
    throw new Error('file access grant has already been used');
  }
  if (record.expiresAt <= nowMs()) {
    grants.delete(token);
    throw new Error('file access grant is invalid or expired');
  }
  if (record.senderId !== senderId) {
    throw new Error('file access grant sender mismatch');
  }
  if (record.purpose !== purpose) {
    throw new Error('file access grant purpose mismatch');
  }

  record.used = true;
  grants.delete(token);

  const stat = await fs.stat(record.filePath);
  if (!stat.isFile()) {
    throw new Error('file access grant target is not a regular file');
  }
  return record.filePath;
}

export function clearExpiredFileAccessGrants(referenceTime = nowMs()): void {
  for (const [token, record] of grants) {
    if (record.used || record.expiresAt <= referenceTime) {
      grants.delete(token);
    }
  }
}

export function __resetFileAccessGrantsForTests(): void {
  grants.clear();
}
