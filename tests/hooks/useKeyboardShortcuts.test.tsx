import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  useKeyboardShortcuts,
  type KeyboardShortcutsOptions,
} from '../../src/hooks/useKeyboardShortcuts';

function makeOptions(overrides: Partial<KeyboardShortcutsOptions> = {}): KeyboardShortcutsOptions {
  return {
    vaultPath: 'C:\\vault',
    showPalette: false,
    showSettings: false,
    showTypeSelector: false,
    setShowPalette: vi.fn(),
    setShowSettings: vi.fn(),
    setShowTypeSelector: vi.fn(),
    setShowWebClip: vi.fn(),
    setShowCitation: vi.fn(),
    setViewMode: vi.fn(),
    setSubjectView: vi.fn(),
    handleNewNote: vi.fn(),
    ...overrides,
  };
}

function press(key: string, modifiers: { ctrl?: boolean; shift?: boolean; meta?: boolean } = {}, target?: HTMLElement | null) {
  const ev = new KeyboardEvent('keydown', {
    key,
    ctrlKey: !!modifiers.ctrl,
    shiftKey: !!modifiers.shift,
    metaKey: !!modifiers.meta,
    bubbles: true,
    cancelable: true,
  });
  if (target) {
    Object.defineProperty(ev, 'target', { value: target, writable: false });
    target.dispatchEvent(ev);
  } else {
    window.dispatchEvent(ev);
  }
  return ev;
}

describe('useKeyboardShortcuts', () => {
  it('registers no handler when vaultPath is null', () => {
    const opts = makeOptions({ vaultPath: null });
    renderHook(() => useKeyboardShortcuts(opts));
    press('k', { ctrl: true });
    expect(opts.setShowPalette).not.toHaveBeenCalled();
    expect(opts.setViewMode).not.toHaveBeenCalled();
  });

  it('toggles palette on Ctrl+K and Ctrl+P', () => {
    const opts = makeOptions();
    renderHook(() => useKeyboardShortcuts(opts));
    press('k', { ctrl: true });
    expect(opts.setShowPalette).toHaveBeenCalledTimes(1);
    press('P', { ctrl: true });
    expect(opts.setShowPalette).toHaveBeenCalledTimes(2);
  });

  it('triggers new note on Ctrl+N', () => {
    const opts = makeOptions();
    renderHook(() => useKeyboardShortcuts(opts));
    press('n', { ctrl: true });
    expect(opts.handleNewNote).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['1', 'subject'],
    ['2', 'daily'],
    ['3', 'timetable'],
    ['4', 'books'],
    ['5', 'memos'],
    ['6', 'wiki'],
    ['7', 'outputs'],
    ['8', 'papers'],
    ['9', 'progress'],
  ] as const)('switches view on Ctrl+%s', (key, mode) => {
    const opts = makeOptions();
    renderHook(() => useKeyboardShortcuts(opts));
    press(key, { ctrl: true });
    expect(opts.setViewMode).toHaveBeenCalledWith(mode);
  });

  it('opens web clip on Ctrl+Shift+L', () => {
    const opts = makeOptions();
    renderHook(() => useKeyboardShortcuts(opts));
    press('L', { ctrl: true, shift: true });
    expect(opts.setShowWebClip).toHaveBeenCalledWith(true);
  });

  it('opens citation picker on Ctrl+Shift+@', () => {
    const opts = makeOptions();
    renderHook(() => useKeyboardShortcuts(opts));
    press('@', { ctrl: true, shift: true });
    expect(opts.setShowCitation).toHaveBeenCalledWith(true);
  });

  it('toggles gallery view on Ctrl+E outside text inputs', () => {
    const opts = makeOptions();
    renderHook(() => useKeyboardShortcuts(opts));
    press('e', { ctrl: true });
    expect(opts.setSubjectView).toHaveBeenCalled();
  });

  it('skips Ctrl+E when target is an INPUT element', () => {
    const opts = makeOptions();
    renderHook(() => useKeyboardShortcuts(opts));
    const input = document.createElement('input');
    document.body.appendChild(input);
    press('e', { ctrl: true }, input);
    expect(opts.setSubjectView).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('skips Ctrl+E when target is contenteditable', () => {
    const opts = makeOptions();
    renderHook(() => useKeyboardShortcuts(opts));
    const div = document.createElement('div');
    // jsdom doesn't propagate contentEditable → isContentEditable reliably.
    Object.defineProperty(div, 'isContentEditable', { value: true, configurable: true });
    document.body.appendChild(div);
    press('e', { ctrl: true }, div);
    expect(opts.setSubjectView).not.toHaveBeenCalled();
    document.body.removeChild(div);
  });

  it('closes palette first on Escape when palette is open', () => {
    const opts = makeOptions({ showPalette: true, showSettings: true });
    renderHook(() => useKeyboardShortcuts(opts));
    press('Escape');
    expect(opts.setShowPalette).toHaveBeenCalled();
    expect(opts.setShowSettings).not.toHaveBeenCalled();
  });

  it('closes type selector on Escape when palette is closed', () => {
    const opts = makeOptions({ showPalette: false, showTypeSelector: true, showSettings: true });
    renderHook(() => useKeyboardShortcuts(opts));
    press('Escape');
    expect(opts.setShowTypeSelector).toHaveBeenCalledWith(false);
    expect(opts.setShowSettings).not.toHaveBeenCalled();
  });

  it('closes settings on Escape when nothing else is open', () => {
    const opts = makeOptions({ showSettings: true });
    renderHook(() => useKeyboardShortcuts(opts));
    press('Escape');
    expect(opts.setShowSettings).toHaveBeenCalledWith(false);
  });

  it('cleans up listener on unmount', () => {
    const opts = makeOptions();
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useKeyboardShortcuts(opts));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    removeSpy.mockRestore();
  });

  it('responds to Cmd+K (metaKey) for macOS users', () => {
    const opts = makeOptions();
    renderHook(() => useKeyboardShortcuts(opts));
    press('k', { meta: true });
    expect(opts.setShowPalette).toHaveBeenCalled();
  });

  it('preventDefault is called for handled shortcuts', () => {
    const opts = makeOptions();
    renderHook(() => useKeyboardShortcuts(opts));
    const ev = press('k', { ctrl: true });
    expect(ev.defaultPrevented).toBe(true);
  });
});
