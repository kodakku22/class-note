// Build-time configuration injected via environment variables.
//
// Defaults are safe (no remote endpoints active) so a fresh checkout
// runs offline without leaking telemetry. Production builds set these
// in CI before the bundle step.
//
// Variables:
//   SENTRY_DSN          — crash reporting endpoint (empty = disabled)
//   TELEMETRY_ENDPOINT  — anonymous usage stats (empty = disabled)
//   APP_RELEASE         — release identifier (defaults to package version)
import { app } from 'electron';

export const SENTRY_DSN = process.env.SENTRY_DSN || '';
export const TELEMETRY_ENDPOINT = process.env.TELEMETRY_ENDPOINT || '';
export const APP_RELEASE = process.env.APP_RELEASE || app.getVersion();

/** True if any production observability is configured. */
export function hasObservability(): boolean {
  return Boolean(SENTRY_DSN);
}
