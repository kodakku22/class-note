// @vitest-environment node
//
// activeEditor tests — single-slot global registry semantics.
import { describe, it, expect, beforeEach } from 'vitest';
import { registerActiveInserter, insertAtActiveCaret } from '../../src/state/activeEditor';

describe('activeEditor registry', () => {
  beforeEach(() => {
    // Reset by registering a no-op then unregistering.
    const off = registerActiveInserter(() => false);
    off();
  });

  it('returns false when no inserter is registered', () => {
    expect(insertAtActiveCaret('x')).toBe(false);
  });

  it('returns whatever the registered inserter returns', () => {
    const off = registerActiveInserter(() => true);
    expect(insertAtActiveCaret('hello')).toBe(true);
    off();
  });

  it('passes the text to the inserter', () => {
    let received = '';
    const off = registerActiveInserter((t) => {
      received = t;
      return true;
    });
    insertAtActiveCaret('[@vaswani2017attention]');
    expect(received).toBe('[@vaswani2017attention]');
    off();
  });

  it('replaces older registrations', () => {
    const off1 = registerActiveInserter(() => false);
    const off2 = registerActiveInserter(() => true);
    expect(insertAtActiveCaret('x')).toBe(true);
    off2();
    off1();
  });

  it('unregister returns to no-active state when the active one unregisters', () => {
    const off = registerActiveInserter(() => true);
    off();
    expect(insertAtActiveCaret('x')).toBe(false);
  });

  it('catches exceptions thrown by the inserter and returns false', () => {
    const off = registerActiveInserter(() => {
      throw new Error('editor blew up');
    });
    expect(insertAtActiveCaret('x')).toBe(false);
    off();
  });
});
