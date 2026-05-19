// @vitest-environment node
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  CircuitOpenError,
  RetryableHttpError,
  isRetriableError,
  resetCircuitBreakers,
  withResilience,
} from '../../electron/net/resilience';

// --------------------------------------------------------------------------
// Coverage targets for resilience.ts:
//   - isRetriableError: RetryableHttpError with 429/500+, 400, AbortError, timeout
//   - withResilience: non-retryable error (shouldRetry=false), jitterRatio=0,
//     circuit cooldown expiry, custom shouldRetry
//   - delayForAttempt: clamping to maxDelayMs
//   - recordSuccess clears circuit
//   - Last-ditch throw when loop ends (lastErr not Error)
// --------------------------------------------------------------------------

describe('isRetriableError – additional branches', () => {
  it('returns true for 429', () => {
    expect(isRetriableError(new RetryableHttpError(429))).toBe(true);
  });

  it('returns true for 500', () => {
    expect(isRetriableError(new RetryableHttpError(500))).toBe(true);
  });

  it('returns true for 503', () => {
    expect(isRetriableError(new RetryableHttpError(503))).toBe(true);
  });

  it('returns false for 400 (client error)', () => {
    expect(isRetriableError(new RetryableHttpError(400))).toBe(false);
  });

  it('returns false for 404', () => {
    expect(isRetriableError(new RetryableHttpError(404))).toBe(false);
  });

  it('returns false for AbortError', () => {
    const abortErr = new DOMException('Aborted', 'AbortError');
    expect(isRetriableError(abortErr)).toBe(false);
  });

  it('returns false for timeout errors', () => {
    const timeoutErr = new Error('Request timeout');
    expect(isRetriableError(timeoutErr)).toBe(false);
  });

  it('returns true for generic errors', () => {
    expect(isRetriableError(new Error('network failure'))).toBe(true);
  });

  it('returns true for non-Error values', () => {
    expect(isRetriableError('string error')).toBe(true);
  });
});

describe('withResilience – additional branches', () => {
  beforeEach(() => {
    resetCircuitBreakers();
  });

  it('does not retry non-retryable errors', async () => {
    let attempts = 0;
    await expect(
      withResilience(
        'unit:non-retry',
        async () => {
          attempts += 1;
          throw new RetryableHttpError(400);
        },
        { maxRetries: 3, baseDelayMs: 0, jitterRatio: 0 }
      )
    ).rejects.toThrow();
    expect(attempts).toBe(1);
  });

  it('succeeds on first attempt without retries', async () => {
    const result = await withResilience(
      'unit:no-retry',
      async () => 'success',
      { maxRetries: 0 }
    );
    expect(result).toBe('success');
  });

  it('uses custom shouldRetry function', async () => {
    let attempts = 0;
    await expect(
      withResilience(
        'unit:custom-retry',
        async () => {
          attempts += 1;
          throw new Error('custom');
        },
        {
          maxRetries: 3,
          baseDelayMs: 0,
          jitterRatio: 0,
          shouldRetry: () => false,
        }
      )
    ).rejects.toThrow('custom');
    expect(attempts).toBe(1);
  });

  it('circuit resets after cooldown expires', async () => {
    const options = {
      maxRetries: 0,
      circuitBreaker: { failureThreshold: 1, cooldownMs: 1 },
    };

    // Trip the circuit
    await expect(
      withResilience(
        'unit:cooldown',
        async () => { throw new RetryableHttpError(503); },
        options
      )
    ).rejects.toThrow();

    // Wait for cooldown to expire
    await new Promise((r) => setTimeout(r, 10));

    // Circuit should be half-open, allowing a new attempt
    const result = await withResilience(
      'unit:cooldown',
      async () => 'recovered',
      options
    );
    expect(result).toBe('recovered');
  });

  it('records success clears circuit state', async () => {
    const options = {
      maxRetries: 1,
      baseDelayMs: 0,
      jitterRatio: 0,
      circuitBreaker: { failureThreshold: 3, cooldownMs: 60_000 },
    };

    // First: fail then succeed
    let attempts = 0;
    const result = await withResilience(
      'unit:clear',
      async () => {
        attempts += 1;
        if (attempts === 1) throw new RetryableHttpError(503);
        return 'ok';
      },
      options
    );
    expect(result).toBe('ok');

    // Now a fresh call should work (circuit cleared)
    const result2 = await withResilience(
      'unit:clear',
      async () => 'fresh',
      options
    );
    expect(result2).toBe('fresh');
  });

  it('throws CircuitOpenError with correct properties', async () => {
    const options = {
      maxRetries: 0,
      circuitBreaker: { failureThreshold: 1, cooldownMs: 60_000 },
    };

    await expect(
      withResilience(
        'unit:props',
        async () => { throw new RetryableHttpError(503); },
        options
      )
    ).rejects.toThrow();

    try {
      await withResilience('unit:props', async () => 'never', options);
    } catch (e) {
      expect(e).toBeInstanceOf(CircuitOpenError);
      expect((e as CircuitOpenError).key).toBe('unit:props');
      expect((e as CircuitOpenError).retryAt).toBeGreaterThan(Date.now() - 1000);
    }
  });

  it('RetryableHttpError has correct properties', () => {
    const err = new RetryableHttpError(429, 'Rate limited');
    expect(err.statusCode).toBe(429);
    expect(err.message).toBe('Rate limited');
    expect(err.name).toBe('RetryableHttpError');
  });

  it('RetryableHttpError uses default message', () => {
    const err = new RetryableHttpError(500);
    expect(err.message).toBe('HTTP 500');
  });
});
