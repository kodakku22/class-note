import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContextMenu, type ContextMenuItem } from '../../src/components/common/ContextMenu';

// --------------------------------------------------------------------------
// Coverage targets for ContextMenu.tsx:
//   - onMouseEnter handler (setActive on hover over enabled items)
//   - onClick handler on the menu itself (stopPropagation)
//   - Outside click closing (mousedown outside the menu)
//   - ArrowUp navigation (already partially tested but need more branches)
//   - shortcut rendering
//   - Viewport adjustment branches (right/bottom overflow)
//   - Enter on empty enabled list
//   - Disabled item hover (should not change active index)
// --------------------------------------------------------------------------

function makeItems(): ContextMenuItem[] {
  return [
    { id: 'rename', label: '名前を変更', emoji: '✏️', onSelect: vi.fn() },
    { id: 'delete', label: '削除', emoji: '🗑️', danger: true, onSelect: vi.fn() },
    { id: 'disabled', label: '無効', disabled: true, onSelect: vi.fn() },
  ];
}

describe('ContextMenu – additional branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Shortcut rendering ---

  it('renders shortcut text when provided', () => {
    const items: ContextMenuItem[] = [
      { id: 'copy', label: 'コピー', shortcut: 'Ctrl+C', onSelect: vi.fn() },
    ];
    render(<ContextMenu x={0} y={0} items={items} onClose={vi.fn()} />);
    expect(screen.getByText('Ctrl+C')).toBeInTheDocument();
  });

  it('does not render shortcut span when not provided', () => {
    const items: ContextMenuItem[] = [
      { id: 'paste', label: '貼り付け', onSelect: vi.fn() },
    ];
    const { container } = render(<ContextMenu x={0} y={0} items={items} onClose={vi.fn()} />);
    expect(container.querySelector('.ctx-menu-shortcut')).not.toBeInTheDocument();
  });

  // --- Mouse hover navigation ---

  it('changes active item on mouse hover over enabled items', () => {
    const items = makeItems();
    const onClose = vi.fn();
    render(<ContextMenu x={0} y={0} items={items} onClose={onClose} />);

    // Hover over the second item (delete) — it's enabled[1]
    fireEvent.mouseEnter(screen.getByText('削除').closest('button')!);

    // Now pressing Enter should select the hovered (delete) item
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(items[1].onSelect).toHaveBeenCalledOnce();
  });

  it('does not change active item on hover over disabled items', () => {
    const items = makeItems();
    const onClose = vi.fn();
    render(<ContextMenu x={0} y={0} items={items} onClose={onClose} />);

    // Hover over disabled item
    fireEvent.mouseEnter(screen.getByText('無効').closest('button')!);

    // Enter should still select the first enabled item (rename)
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(items[0].onSelect).toHaveBeenCalledOnce();
    expect(items[2].onSelect).not.toHaveBeenCalled();
  });

  // --- Outside click ---

  it('closes menu on click outside', () => {
    const onClose = vi.fn();
    render(<ContextMenu x={0} y={0} items={makeItems()} onClose={onClose} />);

    // Simulate clicking outside the menu
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not close on click inside the menu', () => {
    const onClose = vi.fn();
    render(<ContextMenu x={0} y={0} items={makeItems()} onClose={onClose} />);

    // Click inside the menu (on the menu container itself)
    const menu = screen.getByRole('menu');
    fireEvent.mouseDown(menu);
    // mouseDown inside should not close (the handler checks ref.current.contains)
    expect(onClose).not.toHaveBeenCalled();
  });

  // --- ArrowUp from first item ---

  it('ArrowUp at first item stays at index 0', () => {
    const items = makeItems();
    const onClose = vi.fn();
    render(<ContextMenu x={0} y={0} items={items} onClose={onClose} />);

    // ArrowUp when already at first item
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    // Then Enter — should still select first enabled item
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(items[0].onSelect).toHaveBeenCalledOnce();
  });

  // --- ArrowDown past last item ---

  it('ArrowDown past last enabled item stays at last', () => {
    const items = makeItems();
    const onClose = vi.fn();
    render(<ContextMenu x={0} y={0} items={items} onClose={onClose} />);

    // There are 2 enabled items (rename, delete). Go down twice from 0.
    fireEvent.keyDown(window, { key: 'ArrowDown' }); // -> index 1 (delete)
    fireEvent.keyDown(window, { key: 'ArrowDown' }); // -> clamped to 1

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(items[1].onSelect).toHaveBeenCalledOnce();
  });

  // --- Viewport overflow ---

  it('adjusts position when menu overflows right edge', () => {
    // Set viewport to be narrow
    Object.defineProperty(window, 'innerWidth', { value: 200, writable: true });
    const { container } = render(
      <ContextMenu x={180} y={0} items={makeItems()} onClose={vi.fn()} />
    );
    const menu = container.querySelector('.ctx-menu') as HTMLElement;
    // The left position should be adjusted to keep within viewport
    const left = parseInt(menu.style.left, 10);
    expect(left).toBeLessThan(180);
    // Reset
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
  });

  it('adjusts position when menu overflows bottom edge', () => {
    Object.defineProperty(window, 'innerHeight', { value: 100, writable: true });
    const { container } = render(
      <ContextMenu x={0} y={90} items={makeItems()} onClose={vi.fn()} />
    );
    const menu = container.querySelector('.ctx-menu') as HTMLElement;
    const top = parseInt(menu.style.top, 10);
    expect(top).toBeLessThan(90);
    // Reset
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true });
  });

  // --- Menu onClick stopPropagation ---

  it('stops propagation on click inside menu', () => {
    const parentHandler = vi.fn();
    const { container } = render(
      <div onClick={parentHandler}>
        <ContextMenu x={0} y={0} items={makeItems()} onClose={vi.fn()} />
      </div>
    );
    const menu = container.querySelector('.ctx-menu')!;
    fireEvent.click(menu);
    expect(parentHandler).not.toHaveBeenCalled();
  });

  // --- All items disabled ---

  it('handles Enter when all items are disabled', () => {
    const items: ContextMenuItem[] = [
      { id: 'a', label: 'A', disabled: true, onSelect: vi.fn() },
      { id: 'b', label: 'B', disabled: true, onSelect: vi.fn() },
    ];
    const onClose = vi.fn();
    render(<ContextMenu x={0} y={0} items={items} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Enter' });
    // No onSelect should have been called, and no crash
    expect(items[0].onSelect).not.toHaveBeenCalled();
    expect(items[1].onSelect).not.toHaveBeenCalled();
  });

  // --- Emoji not rendered when absent ---

  it('does not render emoji span when emoji is not provided', () => {
    const items: ContextMenuItem[] = [
      { id: 'plain', label: 'Plain item', onSelect: vi.fn() },
    ];
    const { container } = render(
      <ContextMenu x={0} y={0} items={items} onClose={vi.fn()} />
    );
    expect(container.querySelector('.ctx-menu-emoji')).not.toBeInTheDocument();
  });

  // --- Cleanup on unmount ---

  it('removes event listeners on unmount without errors', () => {
    const { unmount } = render(
      <ContextMenu x={0} y={0} items={makeItems()} onClose={vi.fn()} />
    );
    // Should not throw
    expect(() => unmount()).not.toThrow();
  });
});
