import { lookup } from 'dns/promises';
import * as nodeNet from 'net';

export const PRIVATE_NETWORK_URL_ERROR = 'ローカル/プライベートネットワークのURLは取り込めません';

function cleanHostname(hostname: string): string {
  return hostname.replace(/^\[/, '').replace(/\]$/, '').replace(/\.$/, '').toLowerCase();
}

function isPrivateIPv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }
  const [a, b, c, d] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  if (a === 169 && b === 254 && c === 169 && d === 254) return true;
  return false;
}

function isPrivateIPv6(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;
  if (lower.startsWith('ff')) return true;
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.slice('::ffff:'.length);
    if (nodeNet.isIP(mapped) === 4) return isPrivateIPv4(mapped);
  }
  return false;
}

export function isPrivateAddress(address: string): boolean {
  const kind = nodeNet.isIP(address);
  if (kind === 4) return isPrivateIPv4(address);
  if (kind === 6) return isPrivateIPv6(address);
  return true;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = cleanHostname(hostname);
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === 'metadata.google.internal') return true;
  if (host === '169.254.169.254') return true;
  const ipKind = nodeNet.isIP(host);
  return ipKind !== 0 ? isPrivateAddress(host) : false;
}

export async function validatePublicHttpUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('無効な URL です');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('http または https の URL のみ対応しています');
  }

  const hostname = cleanHostname(parsed.hostname);
  if (isBlockedHostname(hostname)) {
    throw new Error(PRIVATE_NETWORK_URL_ERROR);
  }

  if (nodeNet.isIP(hostname) === 0) {
    const resolved = await lookup(hostname, { all: true, verbatim: true });
    if (resolved.length === 0 || resolved.some((entry) => isPrivateAddress(entry.address))) {
      throw new Error(PRIVATE_NETWORK_URL_ERROR);
    }
  }

  return parsed;
}
