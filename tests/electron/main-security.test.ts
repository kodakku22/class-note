// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  buildContentSecurityPolicy,
  decodeProtocolPath,
  sanitizeRendererLogPayload,
  validateExternalUrl,
} from '../../electron/main-security';

describe('main security contracts', () => {
  it('builds a production CSP without dev websocket/eval allowances', () => {
    const csp = buildContentSecurityPolicy(false);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('https://api.openai.com');
    expect(csp).toContain('https://generativelanguage.googleapis.com');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('http://localhost:*');
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('builds a development CSP with localhost allowances', () => {
    const csp = buildContentSecurityPolicy(true);
    expect(csp).toContain('http://localhost:*');
    expect(csp).toContain('ws://localhost:*');
    expect(csp).toContain("'unsafe-eval'");
  });

  it('allows only http, https, and obsidian external URLs', () => {
    expect(validateExternalUrl('https://example.com')).toEqual({
      ok: true,
      url: 'https://example.com',
      protocol: 'https:',
    });
    expect(validateExternalUrl('obsidian://open?vault=ClassVault')).toMatchObject({
      ok: true,
      protocol: 'obsidian:',
    });
    expect(validateExternalUrl('file:///C:/secret.txt')).toEqual({
      ok: false,
      error: 'Protocol not allowed: file:',
    });
    expect(validateExternalUrl('javascript:alert(1)')).toEqual({
      ok: false,
      error: 'Protocol not allowed: javascript:',
    });
  });

  it('decodes protocol paths consistently', () => {
    expect(decodeProtocolPath('app-file://C%3A%5CVault%5Cnote.md', 'app-file')).toBe(
      'C:\\Vault\\note.md'
    );
  });

  it('redacts renderer log metadata and clamps messages', () => {
    const safe = sanitizeRendererLogPayload(
      'trace',
      'x'.repeat(5000),
      { apiKey: 'sk-secret', nested: { password: 'pw' } }
    );

    expect(safe.level).toBe('info');
    expect(safe.message).toHaveLength(4000);
    expect(JSON.stringify(safe.meta)).not.toContain('sk-secret');
    expect(JSON.stringify(safe.meta)).not.toContain('pw');
  });
});
