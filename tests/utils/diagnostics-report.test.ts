// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildDiagnosticsReport, countDiagnosticErrors } from '../../electron/diagnostics-report';

describe('diagnostics report', () => {
  it('summarizes settings without vault paths or secrets', () => {
    const report = buildDiagnosticsReport({
      app: {
        name: 'ClassNotes',
        version: '0.1.0',
        platform: 'win32',
        arch: 'x64',
        packaged: false,
      },
      settings: {
        model: 'opus',
        effort: 'xhigh',
        theme: 'dark',
        uiMode: 'simple',
        locale: null,
        aiProvider: 'anthropic-api',
        aiApiModel: 'claude-sonnet-4-5',
        telemetryEnabled: false,
        recentVaults: ['C:\\Users\\adati\\Documents\\PrivateVault'],
        railItems: ['subjects'],
        railCommandIds: ['papers'],
        onboardingCompleted: true,
      },
      apiKeyConfigured: true,
      index: { ready: true, fileCount: 3, builtAt: '2026-05-13T00:00:00.000Z' },
      logLines: ['[info] ok', '[error] token=secret Bearer abc.def'],
    });

    const text = JSON.stringify(report);
    expect(text).not.toContain('PrivateVault');
    expect(text).not.toContain('abc.def');
    expect(text).not.toContain('token=secret');
    expect(text).toContain('recentVaultCount');
    expect(text).not.toContain('recentVaults');
  });

  it('counts recent error lines only', () => {
    expect(countDiagnosticErrors(['[info] ok', '[warn] noisy', '[error] failed'])).toBe(1);
  });
});
