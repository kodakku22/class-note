import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../src/store/appStore';

describe('useAppStore', () => {
  beforeEach(() => {
    // Reset store to defaults
    useAppStore.setState({
      theme: 'light',
      sidebarOpen: true,
      currentFilePath: null,
    });
  });

  it('has default light theme', () => {
    expect(useAppStore.getState().theme).toBe('light');
  });

  it('setTheme changes theme', () => {
    useAppStore.getState().setTheme('dark');
    expect(useAppStore.getState().theme).toBe('dark');
  });

  it('toggleSidebar toggles sidebarOpen', () => {
    expect(useAppStore.getState().sidebarOpen).toBe(true);
    useAppStore.getState().toggleSidebar();
    expect(useAppStore.getState().sidebarOpen).toBe(false);
    useAppStore.getState().toggleSidebar();
    expect(useAppStore.getState().sidebarOpen).toBe(true);
  });

  it('setCurrentFilePath updates currentFilePath', () => {
    expect(useAppStore.getState().currentFilePath).toBeNull();
    useAppStore.getState().setCurrentFilePath('/vault/notes/test.md');
    expect(useAppStore.getState().currentFilePath).toBe('/vault/notes/test.md');
  });

  it('setCurrentFilePath can clear to null', () => {
    useAppStore.getState().setCurrentFilePath('/some/path');
    useAppStore.getState().setCurrentFilePath(null);
    expect(useAppStore.getState().currentFilePath).toBeNull();
  });
});
