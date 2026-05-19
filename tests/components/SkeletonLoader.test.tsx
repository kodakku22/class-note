import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SkeletonLine, SkeletonNote, SkeletonCard, SkeletonCardGrid } from '../../src/components/SkeletonLoader';

describe('SkeletonLine', () => {
  it('renders with default width', () => {
    const { container } = render(<SkeletonLine />);
    const el = container.querySelector('.skeleton-line');
    expect(el).not.toBeNull();
    expect(el?.getAttribute('style')).toContain('width: 100%');
  });

  it('renders with custom width', () => {
    const { container } = render(<SkeletonLine width="60%" />);
    const el = container.querySelector('.skeleton-line');
    expect(el?.getAttribute('style')).toContain('width: 60%');
  });

  it('is aria-hidden', () => {
    const { container } = render(<SkeletonLine />);
    const el = container.querySelector('.skeleton-line');
    expect(el?.getAttribute('aria-hidden')).toBeTruthy();
  });
});

describe('SkeletonNote', () => {
  it('renders with busy state', () => {
    render(<SkeletonNote />);
    expect(screen.getByLabelText('読み込み中')).toBeInTheDocument();
  });

  it('renders 4 skeleton lines', () => {
    const { container } = render(<SkeletonNote />);
    const lines = container.querySelectorAll('.skeleton-line');
    expect(lines.length).toBe(4);
  });
});

describe('SkeletonCard', () => {
  it('renders with aria-busy', () => {
    const { container } = render(<SkeletonCard />);
    const el = container.querySelector('.skeleton-card');
    expect(el?.getAttribute('aria-busy')).toBe('true');
  });

  it('renders 3 skeleton lines', () => {
    const { container } = render(<SkeletonCard />);
    const lines = container.querySelectorAll('.skeleton-line');
    expect(lines.length).toBe(3);
  });
});

describe('SkeletonCardGrid', () => {
  it('renders default 6 cards', () => {
    const { container } = render(<SkeletonCardGrid />);
    const cards = container.querySelectorAll('.skeleton-card');
    expect(cards.length).toBe(6);
  });

  it('renders custom count', () => {
    const { container } = render(<SkeletonCardGrid count={3} />);
    const cards = container.querySelectorAll('.skeleton-card');
    expect(cards.length).toBe(3);
  });
});
