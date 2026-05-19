import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TypeSelector } from '../../src/components/TypeSelector';

describe('TypeSelector', () => {
  it('renders heading', () => {
    render(<TypeSelector onPick={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('新規ノートのタイプを選択');
  });

  it('renders pickable type cards', () => {
    render(<TypeSelector onPick={vi.fn()} onClose={vi.fn()} />);
    // Should have 6 pickable types: lecture, summary, review, research, memo, free
    const buttons = screen.getAllByRole('button');
    // 6 type cards + 1 cancel button = 7
    expect(buttons.length).toBe(7);
  });

  it('calls onPick when a type card is clicked', () => {
    const onPick = vi.fn();
    render(<TypeSelector onPick={onPick} onClose={vi.fn()} />);
    // Click the first type card
    const cards = screen.getAllByRole('button').filter((b) => b.classList.contains('type-card'));
    fireEvent.click(cards[0]);
    expect(onPick).toHaveBeenCalledOnce();
  });

  it('calls onClose when cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<TypeSelector onPick={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByText(/キャンセル/));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(<TypeSelector onPick={vi.fn()} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when overlay is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<TypeSelector onPick={vi.fn()} onClose={onClose} />);
    const overlay = container.querySelector('.modal-overlay');
    fireEvent.click(overlay!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not close when modal content is clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<TypeSelector onPick={vi.fn()} onClose={onClose} />);
    const modal = container.querySelector('.modal.type-selector');
    fireEvent.click(modal!);
    expect(onClose).not.toHaveBeenCalled();
  });
});
