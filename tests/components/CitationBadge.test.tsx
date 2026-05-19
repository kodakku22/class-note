import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CitationBadge } from '../../src/components/ai/CitationBadge';
import type { DocAICitation } from '../../src/types';

const CITATIONS: DocAICitation[] = [
  {
    id: 1,
    source: 'doc.pdf',
    section: 'Page 3',
    excerpt: 'sample excerpt text',
    pageNumber: 3,
  },
  {
    id: 2,
    source: 'note.md',
    section: '勾配降下法',
    excerpt: 'another excerpt',
  },
];

describe('CitationBadge', () => {
  it('renders [N] + page label when pageNumber present', () => {
    render(<CitationBadge id={1} citations={CITATIONS} />);
    expect(screen.getByText('[1]')).toBeInTheDocument();
    expect(screen.getByText('p.3')).toBeInTheDocument();
  });

  it('renders the section label when no pageNumber', () => {
    render(<CitationBadge id={2} citations={CITATIONS} />);
    expect(screen.getByText('[2]')).toBeInTheDocument();
    expect(screen.getByText('勾配降下法')).toBeInTheDocument();
  });

  it('renders the bare [N] for missing citation ids', () => {
    render(<CitationBadge id={99} citations={CITATIONS} />);
    expect(screen.getByText('[出典 99]')).toBeInTheDocument();
  });

  it('invokes onJump with payload on click', () => {
    const onJump = vi.fn();
    render(
      <CitationBadge
        id={1}
        citations={CITATIONS}
        filePathBySource={{ 'doc.pdf': '/abs/doc.pdf' }}
        onJump={onJump}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onJump).toHaveBeenCalledWith({
      filePath: '/abs/doc.pdf',
      source: 'doc.pdf',
      section: 'Page 3',
      pageNumber: 3,
      startLine: undefined,
    });
  });

  it('responds to Enter key', () => {
    const onJump = vi.fn();
    render(<CitationBadge id={1} citations={CITATIONS} onJump={onJump} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(onJump).toHaveBeenCalled();
  });

  it('shows tooltip on hover with excerpt', () => {
    render(<CitationBadge id={1} citations={CITATIONS} />);
    const badge = screen.getByRole('button');
    fireEvent.mouseEnter(badge);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByText('sample excerpt text')).toBeInTheDocument();
  });

  it('hides tooltip on mouse leave', () => {
    render(<CitationBadge id={1} citations={CITATIONS} />);
    const badge = screen.getByRole('button');
    fireEvent.mouseEnter(badge);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.mouseLeave(badge);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
