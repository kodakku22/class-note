import { describe, expect, it, beforeEach } from 'vitest';
import {
  CircuitOpenError,
  RetryableHttpError,
  resetCircuitBreakers,
  withResilience,
} from '../../electron/net/resilience';

describe('withResilience', () => {
  beforeEach(() => {
    resetCircuitBreakers();
  });

  it('retries retryable failures and returns the eventual result', async () => {
    let attempts = 0;

    const result = await withResilience(
      'unit:retry',
      async () => {
        attempts += 1;
        if (attempts < 3) throw new RetryableHttpError(503);
        return 'ok';
      },
      { maxRetries: 2, baseDelayMs: 0, jitterRatio: 0 }
    );

    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('opens the circuit after repeated terminal failures', async () => {
    const options = {
      maxRetries: 0,
      circuitBreaker: { failureThreshold: 2, cooldownMs: 60_000 },
    };

    await expect(
      withResilience(
        'unit:circuit',
        async () => {
          throw new RetryableHttpError(503);
        },
        options
      )
    ).rejects.toBeInstanceOf(RetryableHttpError);

    await expect(
      withResilience(
        'unit:circuit',
        async () => {
          throw new RetryableHttpError(503);
        },
        options
      )
    ).rejects.toBeInstanceOf(RetryableHttpError);

    await expect(
      withResilience('unit:circuit', async () => 'never', options)
    ).rejects.toBeInstanceOf(CircuitOpenError);
  });
});
