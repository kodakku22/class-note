import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MaterialCard } from '../../src/components/cards/MaterialCard';

const DEFAULTS = {
  filePath: '/vault/Math/materials/diagram.png',
  fileName: 'diagram.png',
  kind: 'image' as const,
  mtime: new Date('2025-06-01T10:00:00').getTime(),
  onOpen: vi.fn(),
};

describe('MaterialCard', () => {
  it('renders file name', () => {
    render(<MaterialCard {...DEFAULTS} />);
    expect(screen.getByText('diagram.png')).toBeInTheDocument();
  });

  it('renders date from mtime', () => {
    render(<MaterialCard {...DEFAULTS} />);
    expect(screen.getByText('2025-06-01')).toBeInTheDocument();
  });

  it('shows kind label uppercased', () => {
    render(<MaterialCard {...DEFAULTS} />);
    expect(screen.getByText('IMAGE')).toBeInTheDocument();
  });

  it('renders image thumbnail for image kind', () => {
    const { container } = render(<MaterialCard {...DEFAULTS} />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.alt).toBe('diagram.png');
  });

  it('renders fallback icon for pdf kind', () => {
    render(<MaterialCard {...DEFAULTS} kind="pdf" />);
    expect(screen.getByText('PDF')).toBeInTheDocument();
    // Should show the fallback icon, not an img
    const { container } = render(<MaterialCard {...DEFAULTS} kind="pdf" />);
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders fallback icon for office kind', () => {
    render(<MaterialCard {...DEFAULTS} kind="office" />);
    expect(screen.getByText('OFFICE')).toBeInTheDocument();
  });

  it('renders fallback icon for other kind', () => {
    render(<MaterialCard {...DEFAULTS} kind="other" />);
    expect(screen.getByText('OTHER')).toBeInTheDocument();
  });

  it('calls onOpen when clicked', () => {
    const onOpen = vi.fn();
    render(<MaterialCard {...DEFAULTS} onOpen={onOpen} />);
    fireEvent.click(screen.getByText('diagram.png'));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('applies active class when active', () => {
    const { container } = render(<MaterialCard {...DEFAULTS} active />);
    expect(container.querySelector('.material-card.active')).not.toBeNull();
  });

  it('does not apply active class when not active', () => {
    const { container } = render(<MaterialCard {...DEFAULTS} />);
    expect(container.querySelector('.material-card.active')).toBeNull();
  });
});
