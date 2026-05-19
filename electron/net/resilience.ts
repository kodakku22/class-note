export type RetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  circuitBreaker?: {
    failureThreshold?: number;
    cooldownMs?: number;
  };
  shouldRetry?: (err: unknown) => boolean;
};

type CircuitState = {
  failures: number;
  openedUntil: number;
};

const circuits = new Map<string, CircuitState>();

export class RetryableHttpError extends Error {
  constructor(public readonly statusCode: number, message = `HTTP ${statusCode}`) {
    super(message);
    this.name = 'RetryableHttpError';
  }
}

export class CircuitOpenError extends Error {
  constructor(public readonly key: string, public readonly retryAt: number) {
    super(`Circuit is open for ${key}`);
    this.name = 'CircuitOpenError';
  }
}

export function resetCircuitBreakers(): void {
  circuits.clear();
}

export function isRetriableError(err: unknown): boolean {
  if (err instanceof RetryableHttpError) {
    return err.statusCode === 429 || err.statusCode >= 500;
  }
  if (err instanceof DOMException && err.name === 'AbortError') {
    return false;
  }
  if (err instanceof Error && /timeout|タイムアウト/i.test(err.message)) {
    return false;
  }
  return true;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function delayForAttempt(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitterRatio: number
): number {
  const raw = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempt - 1));
  if (jitterRatio <= 0) return raw;
  const jitter = raw * jitterRatio * Math.random();
  return Math.round(raw + jitter);
}

function recordFailure(key: string, opts: Required<NonNullable<RetryOptions['circuitBreaker']>>): void {
  const state = circuits.get(key) ?? { failures: 0, openedUntil: 0 };
  state.failures += 1;
  if (state.failures >= opts.failureThreshold) {
    state.openedUntil = Date.now() + opts.cooldownMs;
  }
  circuits.set(key, state);
}

function recordSuccess(key: string): void {
  circuits.delete(key);
}

export async function withResilience<T>(
  key: string,
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const maxDelayMs = options.maxDelayMs ?? 5_000;
  const jitterRatio = options.jitterRatio ?? 0.2;
  const shouldRetry = options.shouldRetry ?? isRetriableError;
  const circuit = {
    failureThreshold: options.circuitBreaker?.failureThreshold ?? 4,
    cooldownMs: options.circuitBreaker?.cooldownMs ?? 30_000,
  };

  const state = circuits.get(key);
  if (state && state.openedUntil > Date.now()) {
    throw new CircuitOpenError(key, state.openedUntil);
  }
  if (state && state.openedUntil > 0 && state.openedUntil <= Date.now()) {
    circuits.delete(key);
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (attempt > 0) {
      await sleep(delayForAttempt(attempt, baseDelayMs, maxDelayMs, jitterRatio));
    }
    try {
      const result = await operation(attempt);
      recordSuccess(key);
      return result;
    } catch (err) {
      lastErr = err;
      if (attempt >= maxRetries || !shouldRetry(err)) {
        recordFailure(key, circuit);
        throw err;
      }
    }
  }

  recordFailure(key, circuit);
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
