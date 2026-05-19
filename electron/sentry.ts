// Sentry integration — opt-in crash reporting.
//
// We deliberately load `@sentry/electron` lazily so the production bundle
// only pays for the SDK when a DSN is configured. In development and in
// open-source forks without a DSN, this module is a no-op.
//
// Privacy: errors are sent only when settings.telemetryEnabled === true
// AND a DSN is configured. The opt-in is captured in OnboardingWizard
// (or via Settings later) and persisted via electron/ipc/settings.ts.
import { SENTRY_DSN, APP_RELEASE } from './config';
import { logger } from './logger';

let initialized = false;

/**
 * Initialize Sentry if a DSN is configured AND the user opted in.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export async function initSentryIfEnabled(opts: { telemetryEnabled: boolean }): Promise<void> {
  if (initialized) return;
  if (!SENTRY_DSN) {
    logger.debug('[sentry] no DSN configured — skipping');
    return;
  }
  if (!opts.telemetryEnabled) {
    logger.info('[sentry] telemetry disabled by user — skipping');
    return;
  }
  try {
    // Lazy require so the bundle is portable: if `@sentry/electron` is not
    // installed (open-source forks without crash reporting), we skip silently.
    // We use require here rather than dynamic import to keep the type fully
    // optional — the package may not be present at all.
     
    const Sentry = (() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
        return require('@sentry/electron/main') as any;
      } catch {
        return null;
      }
    })();
    if (!Sentry || typeof Sentry.init !== 'function') {
      logger.warn('[sentry] @sentry/electron not installed — skipping');
      return;
    }
    Sentry.init({
      dsn: SENTRY_DSN,
      release: APP_RELEASE,
      autoSessionTracking: true,
      tracesSampleRate: 0.0,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      beforeSend(event: any) {
        const stripSecrets = (s: string) =>
          s
            .replace(/sk-ant-[A-Za-z0-9_-]+/g, '[REDACTED-API-KEY]')
            .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]');
        if (event.message) event.message = stripSecrets(event.message);
        if (event.exception?.values) {
           
          for (const v of event.exception.values as Array<{ value?: string }>) {
            if (v.value) v.value = stripSecrets(v.value);
          }
        }
        return event;
      },
    });
    initialized = true;
    logger.info('[sentry] initialized');
  } catch (err) {
    logger.error('[sentry] init failed', err);
  }
}

/** Capture an exception if Sentry is initialized. */
export async function captureException(err: unknown): Promise<void> {
  if (!initialized) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const Sentry = require('@sentry/electron/main') as any;
    Sentry?.captureException?.(err);
  } catch {
    // ignore
  }
}
