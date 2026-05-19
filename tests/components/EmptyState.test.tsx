import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState } from '../../src/components/EmptyState';

describe('EmptyState', () => {
  it('renders icon and title', () => {
    render(<EmptyState icon="📝" title="No notes" />);
    expect(screen.getByText('📝')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('No notes');
  });

  it('renders description when provided', () => {
    render(<EmptyState icon="📝" title="No notes" description="Create one to get started" />);
    expect(screen.getByText('Create one to get started')).toBeInTheDocument();
  });

  it('does not render description when not provided', () => {
    const { container } = render(<EmptyState icon="📝" title="No notes" />);
    expect(container.querySelector('.empty-state-desc')).toBeNull();
  });

  it('renders action button when provided', () => {
    const onClick = vi.fn();
    render(<EmptyState icon="📝" title="No notes" action={{ label: 'Create', onClick }} />);
    const btn = screen.getByRole('button', { name: 'Create' });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not render action button when not provided', () => {
    render(<EmptyState icon="📝" title="No notes" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders children', () => {
    render(
      <EmptyState icon="📝" title="No notes">
        <span data-testid="child">Custom content</span>
      </EmptyState>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });
});
