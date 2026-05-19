import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NoteCard } from '../../src/components/cards/NoteCard';

const DEFAULTS = {
  filePath: '/vault/Math/notes/calc.md',
  fileName: 'calc.md',
  mtime: Date.now(),
  onOpen: vi.fn(),
};

describe('NoteCard', () => {
  it('renders title from fileName (strips .md)', () => {
    render(<NoteCard {...DEFAULTS} />);
    expect(screen.getByText('calc')).toBeInTheDocument();
  });

  it('uses meta.title if available', () => {
    render(<NoteCard {...DEFAULTS} meta={{ title: 'Calculus Notes' }} />);
    expect(screen.getByText('Calculus Notes')).toBeInTheDocument();
  });

  it('shows preview text', () => {
    render(<NoteCard {...DEFAULTS} preview="Integration basics" />);
    expect(screen.getByText('Integration basics')).toBeInTheDocument();
  });

  it('shows date', () => {
    const mtime = new Date('2025-03-15T10:00:00').getTime();
    render(<NoteCard {...DEFAULTS} mtime={mtime} />);
    expect(screen.getByText('2025-03-15')).toBeInTheDocument();
  });

  it('shows tags', () => {
    render(<NoteCard {...DEFAULTS} meta={{ tags: ['math', 'calculus'] }} />);
    expect(screen.getByText('#math')).toBeInTheDocument();
    expect(screen.getByText('#calculus')).toBeInTheDocument();
  });

  it('truncates tags beyond 3', () => {
    render(<NoteCard {...DEFAULTS} meta={{ tags: ['a', 'b', 'c', 'd', 'e'] }} />);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('calls onOpen when clicked', () => {
    const onOpen = vi.fn();
    render(<NoteCard {...DEFAULTS} onOpen={onOpen} />);
    fireEvent.click(screen.getByText('calc'));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('renders rename button when onRename provided', () => {
    const onRename = vi.fn();
    render(<NoteCard {...DEFAULTS} onRename={onRename} />);
    expect(screen.getByTitle('名前変更')).toBeInTheDocument();
  });

  it('renders delete button when onDelete provided', () => {
    const onDelete = vi.fn();
    render(<NoteCard {...DEFAULTS} onDelete={onDelete} />);
    expect(screen.getByTitle('削除')).toBeInTheDocument();
  });

  it('shows color picker on color button click', () => {
    const { container } = render(<NoteCard {...DEFAULTS} />);
    fireEvent.click(screen.getByTitle('色を変更'));
    expect(container.querySelector('.color-picker')).not.toBeNull();
  });

  it('calls onChangeColor when color swatch is clicked', () => {
    const onChangeColor = vi.fn();
    render(<NoteCard {...DEFAULTS} onChangeColor={onChangeColor} />);
    fireEvent.click(screen.getByTitle('色を変更'));
    fireEvent.click(screen.getByLabelText('色: blue'));
    expect(onChangeColor).toHaveBeenCalledWith('blue');
  });

  it('shows active class when active', () => {
    const { container } = render(<NoteCard {...DEFAULTS} active />);
    expect(container.querySelector('.note-card.active')).not.toBeNull();
  });

  it('shows subject accent stripe', () => {
    const { container } = render(<NoteCard {...DEFAULTS} subject="数学" />);
    expect(container.querySelector('.note-card-accent')).not.toBeNull();
  });
});
