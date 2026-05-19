import { redactSecrets } from './redaction';
import type { VaultIndexStatus } from './vault-index';

export type DiagnosticsSettingsSummary = {
  model: string;
  effort: string;
  theme: string;
  uiMode: string;
  locale: string | null;
  aiProvider: string;
  aiAuthMode?: string;
  aiModels?: Record<string, string>;
  aiApiModel: string;
  telemetryEnabled: boolean;
  recentVaults: string[];
  railItems: string[];
  railCommandIds: string[];
  onboardingCompleted: boolean;
};

export type DiagnosticsAppInfo = {
  name: string;
  version: string;
  platform: string;
  arch: string;
  packaged: boolean;
};

export function countDiagnosticErrors(lines: string[]): number {
  return lines.filter((line) => /\[error\]/i.test(line) || /\berror\b/i.test(line)).length;
}

export function buildDiagnosticsReport(input: {
  app: DiagnosticsAppInfo;
  settings: DiagnosticsSettingsSummary;
  apiKeyConfigured: boolean;
  index: VaultIndexStatus;
  logLines: string[];
}): Record<string, unknown> {
  return redactSecrets({
    app: input.app,
    settings: {
      model: input.settings.model,
      effort: input.settings.effort,
      theme: input.settings.theme,
      uiMode: input.settings.uiMode,
      locale: input.settings.locale,
      aiProvider: input.settings.aiProvider,
      aiAuthMode: input.settings.aiAuthMode,
      aiModels: input.settings.aiModels,
      aiApiModel: input.settings.aiApiModel,
      apiKeyConfigured: input.apiKeyConfigured,
      telemetryEnabled: input.settings.telemetryEnabled,
      recentVaultCount: input.settings.recentVaults.length,
      railItemCount: input.settings.railItems.length,
      railCommandCount: input.settings.railCommandIds.length,
      onboardingCompleted: input.settings.onboardingCompleted,
    },
    index: input.index,
    logs: {
      recentErrorCount: countDiagnosticErrors(input.logLines),
      recentLines: input.logLines.map((line) => redactSecrets(line)),
    },
  });
}
