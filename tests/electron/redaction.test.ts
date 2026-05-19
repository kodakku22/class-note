// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { redactSecrets, registerSensitivePath } from '../../electron/redaction';

describe('redactSecrets', () => {
  it('redacts Bearer tokens', () => {
    const result = redactSecrets('Authorization: Bearer sk-ant-abc123xyz');
    expect(result).toContain('Bearer [REDACTED]');
    expect(result).not.toContain('sk-ant-abc123xyz');
  });

  it('redacts Anthropic API keys', () => {
    const result = redactSecrets('key: sk-ant-api03-abcdefghijklmnop');
    expect(result).toContain('[REDACTED_API_KEY]');
  });

  it('redacts OpenAI-style API keys', () => {
    const result = redactSecrets('key: sk-abcdefghijklmnopqrstuvwxyz');
    expect(result).toContain('[REDACTED_API_KEY]');
  });

  it('redacts key=value patterns', () => {
    const result = redactSecrets('api_key=my-secret-value');
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('my-secret-value');
  });

  it('redacts password patterns', () => {
    const result = redactSecrets('password: supersecret123');
    expect(result).toContain('[REDACTED]');
  });

  it('redacts token patterns', () => {
    const result = redactSecrets('token=abc123def456');
    expect(result).toContain('[REDACTED]');
  });

  it('passes through safe strings unchanged', () => {
    const input = 'This is a normal log message with no secrets';
    expect(redactSecrets(input)).toBe(input);
  });

  it('handles Error objects', () => {
    const err = new Error('api_key=secret123 failed');
    const result = redactSecrets(err);
    expect(result.message).toContain('[REDACTED]');
    expect(result.message).not.toContain('secret123');
  });

  it('handles arrays', () => {
    const arr = ['normal', 'Bearer sk-ant-test123456789'];
    const result = redactSecrets(arr);
    expect(result[0]).toBe('normal');
    expect(result[1]).toContain('[REDACTED]');
  });

  it('handles objects with sensitive keys', () => {
    const obj = { api_key: 'mysecret', name: 'test' };
    const result = redactSecrets(obj);
    expect(result.api_key).toBe('[REDACTED]');
    expect(result.name).toBe('test');
  });

  it('handles nested objects', () => {
    const obj = { config: { token: 'secret', url: 'https://example.com' } };
    const result = redactSecrets(obj);
    expect(result.config.token).toBe('[REDACTED]');
    expect(result.config.url).toBe('https://example.com');
  });

  it('passes through numbers and booleans', () => {
    expect(redactSecrets(42)).toBe(42);
    expect(redactSecrets(true)).toBe(true);
    expect(redactSecrets(null)).toBeNull();
  });
});

describe('registerSensitivePath', () => {
  it('does not throw on null', () => {
    expect(() => registerSensitivePath(null)).not.toThrow();
  });

  it('does not throw on undefined', () => {
    expect(() => registerSensitivePath(undefined)).not.toThrow();
  });

  it('does not throw on empty string', () => {
    expect(() => registerSensitivePath('')).not.toThrow();
  });

  it('registers a path for redaction', () => {
    registerSensitivePath('C:\\Users\\testuser\\secret-vault');
    const result = redactSecrets('Loading from C:\\Users\\testuser\\secret-vault\\notes');
    expect(result).toContain('[REDACTED_PATH]');
  });
});
