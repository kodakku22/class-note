import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HoverToolbar } from '../../src/components/common/HoverToolbar';

describe('HoverToolbar', () => {
  it('renders children', () => {
    render(
      <HoverToolbar toolbar={<span>TB</span>}>
        <div>Content</div>
      </HoverToolbar>,
    );
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('renders toolbar content', () => {
    render(
      <HoverToolbar toolbar={<button>Edit</button>}>
        <span>child</span>
      </HoverToolbar>,
    );
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('applies hover-toolbar-host class', () => {
    const { container } = render(
      <HoverToolbar toolbar={<span />}>
        <span />
      </HoverToolbar>,
    );
    expect(container.querySelector('.hover-toolbar-host')).toBeInTheDocument();
  });

  it('adds custom className', () => {
    const { container } = render(
      <HoverToolbar toolbar={<span />} className="custom-class">
        <span />
      </HoverToolbar>,
    );
    const host = container.firstElementChild!;
    expect(host.className).toContain('custom-class');
    expect(host.className).toContain('hover-toolbar-host');
  });

  it('wraps toolbar in hover-toolbar div', () => {
    const { container } = render(
      <HoverToolbar toolbar={<span data-testid="tb" />}>
        <span />
      </HoverToolbar>,
    );
    expect(container.querySelector('.hover-toolbar')).toBeInTheDocument();
  });
});
