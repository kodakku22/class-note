import { describe, it, expect, vi, beforeEach } from 'vitest';
import { log } from '../../src/utils/logger';

const mockWrite = vi.fn();

describe('renderer logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api.log = { write: mockWrite };
  });

  it('log.info calls window.api.log.write', () => {
    log.info('test message');
    expect(mockWrite).toHaveBeenCalledWith('info', 'test message', undefined);
  });

  it('log.error calls window.api.log.write with error level', () => {
    log.error('something failed', { code: 500 });
    expect(mockWrite).toHaveBeenCalledWith('error', 'something failed', { code: 500 });
  });

  it('log.warn calls window.api.log.write', () => {
    log.warn('caution');
    expect(mockWrite).toHaveBeenCalledWith('warn', 'caution', undefined);
  });

  it('log.debug calls window.api.log.write', () => {
    log.debug('debugging', { detail: 'foo' });
    expect(mockWrite).toHaveBeenCalledWith('debug', 'debugging', { detail: 'foo' });
  });

  it('does not throw when api.log is undefined', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api.log = undefined;
    expect(() => log.info('should not throw')).not.toThrow();
  });

  it('mirrors to console', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    log.info('console test');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('mirrors error to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    log.error('error test');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('mirrors warn to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    log.warn('warn test');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('mirrors debug to console.debug', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {});
    log.debug('debug test');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
