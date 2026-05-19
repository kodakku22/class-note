import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContextMenu, type ContextMenuItem } from '../../src/components/common/ContextMenu';

function makeItems(): ContextMenuItem[] {
  return [
    { id: 'rename', label: '名前を変更', emoji: '✏️', onSelect: vi.fn() },
    { id: 'delete', label: '削除', emoji: '🗑️', danger: true, onSelect: vi.fn() },
    { id: 'disabled', label: '無効', disabled: true, onSelect: vi.fn() },
  ];
}

describe('ContextMenu', () => {
  it('renders menu items', () => {
    const items = makeItems();
    render(<ContextMenu x={100} y={100} items={items} onClose={vi.fn()} />);
    expect(screen.getByText('名前を変更')).toBeInTheDocument();
    expect(screen.getByText('削除')).toBeInTheDocument();
    expect(screen.getByText('無効')).toBeInTheDocument();
  });

  it('has role="menu"', () => {
    render(<ContextMenu x={0} y={0} items={makeItems()} onClose={vi.fn()} />);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('renders menuitems with role', () => {
    render(<ContextMenu x={0} y={0} items={makeItems()} onClose={vi.fn()} />);
    const menuitems = screen.getAllByRole('menuitem');
    expect(menuitems.length).toBe(3);
  });

  it('calls onSelect and onClose when item is clicked', () => {
    const items = makeItems();
    const onClose = vi.fn();
    render(<ContextMenu x={0} y={0} items={items} onClose={onClose} />);
    fireEvent.click(screen.getByText('名前を変更'));
    expect(items[0].onSelect).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not call onSelect for disabled items', () => {
    const items = makeItems();
    render(<ContextMenu x={0} y={0} items={items} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('無効'));
    expect(items[2].onSelect).not.toHaveBeenCalled();
  });

  it('closes on Escape key', () => {
    const onClose = vi.fn();
    render(<ContextMenu x={0} y={0} items={makeItems()} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('selects item with Enter key', () => {
    const items = makeItems();
    const onClose = vi.fn();
    render(<ContextMenu x={0} y={0} items={items} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(items[0].onSelect).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('navigates with ArrowDown/ArrowUp', () => {
    const items = makeItems();
    const onClose = vi.fn();
    render(<ContextMenu x={0} y={0} items={items} onClose={onClose} />);

    // ArrowDown then Enter should select second enabled item
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(items[1].onSelect).toHaveBeenCalledOnce();
  });

  it('renders emoji if provided', () => {
    render(<ContextMenu x={0} y={0} items={makeItems()} onClose={vi.fn()} />);
    expect(screen.getByText('✏️')).toBeInTheDocument();
    expect(screen.getByText('🗑️')).toBeInTheDocument();
  });

  it('renders danger class for danger items', () => {
    const { container } = render(<ContextMenu x={0} y={0} items={makeItems()} onClose={vi.fn()} />);
    const dangerItems = container.querySelectorAll('.danger');
    expect(dangerItems.length).toBe(1);
  });
});
