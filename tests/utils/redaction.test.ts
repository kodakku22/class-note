// @vitest-environment node
import path from 'path';
import { describe, expect, it } from 'vitest';
import { redactSecrets, registerSensitivePath } from '../../electron/redaction';

describe('redactSecrets', () => {
  it('masks API keys, bearer tokens, secret fields, and registered paths', () => {
    const vaultPath = path.join('C:\\Users\\adati\\Documents', 'PrivateVault');
    registerSensitivePath(vaultPath);

    const redacted = redactSecrets({
      message: `Bearer abc.def.ghi lives in ${vaultPath}\\Course\\notes\\A.md`,
      apiKey: 'sk-ant-secret-value',
      nested: {
        password: 'hunter2',
        safe: 'visible',
        tokenLine: 'token=plain-secret',
      },
    });

    expect(JSON.stringify(redacted)).not.toContain('abc.def.ghi');
    expect(JSON.stringify(redacted)).not.toContain('sk-ant-secret-value');
    expect(JSON.stringify(redacted)).not.toContain('hunter2');
    expect(JSON.stringify(redacted)).not.toContain('PrivateVault');
    expect(redacted.nested.safe).toBe('visible');
    expect(redacted.message).toContain('[REDACTED_PATH]');
  });
});
