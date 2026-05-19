import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// --------------------------------------------------------------------------
// Coverage targets for MarkdownRenderer.tsx:
//   - Wikilink preview popup (showPreview/hidePreview)
//   - External link with non-http href (no preventDefault)
//   - Mermaid error rendering
//   - Embed image with width
//   - Embed with unresolved missing (no attachIndex at all)
//   - fetchPreview cache hit
//   - resolveWikilink returning null (no preview)
// --------------------------------------------------------------------------

// Mock mermaid to test error path
const mockMermaidRender = vi.fn();
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: (...args: any[]) => mockMermaidRender(...args),
  },
}));

vi.mock('react-markdown', () => ({
  default: ({ children, components }: any) => {
    const A = components?.a;
    const Img = components?.img;
    const Code = components?.code;
    return (
      <div data-testid="md-root">
        {children}
        {A && (
          <A href="wikilink:PreviewTest" data-testid="wikilink-preview-test">
            preview-link
          </A>
        )}
        {A && <A href="mailto:test@example.com">email-link</A>}
        {Img && <Img src="embed:sized.png" alt="sized" />}
        {Img && <Img src="embed:unknown-embed" alt="unknown" />}
        {Code && <Code className="language-mermaid">graph TD; X--&gt;Y</Code>}
      </div>
    );
  },
}));
vi.mock('remark-gfm', () => ({ default: vi.fn() }));
vi.mock('remark-math', () => ({ default: vi.fn() }));
vi.mock('rehype-katex', () => ({ default: vi.fn() }));
vi.mock('rehype-highlight', () => ({ default: vi.fn() }));

vi.mock('../../src/components/Wikilink', () => ({
  preprocessNotes: (s: string) => s,
  parseEmbedSrc: (src: string) => {
    const name = src.replace('embed:', '');
    // Return a width for sized.png to test the width branch
    return { name, width: name === 'sized.png' ? 300 : null };
  },
}));

vi.mock('../../src/utils/paths', () => ({
  toAppFileUrl: (p: string) => `file://${p}`,
}));

import { MarkdownRenderer } from '../../src/components/MarkdownRenderer';

describe('MarkdownRenderer – additional branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMermaidRender.mockResolvedValue({ svg: '<svg>ok</svg>' });
    (window as any).api = {
      vault: { readNote: vi.fn().mockResolvedValue('---\ntitle: T\n---\nPreview text here') },
      materials: {
        openUrl: vi.fn(),
        openExternal: vi.fn(),
      },
    };
  });

  it('shows wikilink preview on mouse enter', async () => {
    const resolveWikilink = vi.fn().mockReturnValue('/vault/PreviewTest.md');
    render(
      <MarkdownRenderer
        content="text"
        resolveWikilink={resolveWikilink}
        onJumpToWikilink={vi.fn()}
      />
    );

    const link = screen.getByText('preview-link');

    // Mouse enter triggers preview
    await act(async () => {
      fireEvent.mouseEnter(link);
    });

    // Wait for the preview to appear
    await waitFor(() => {
      expect(document.querySelector('.wikilink-preview')).toBeInTheDocument();
    });
  });

  it('wikilink preview contains fetched text', async () => {
    const resolveWikilink = vi.fn().mockReturnValue('/vault/PreviewTest.md');
    render(
      <MarkdownRenderer
        content="text"
        resolveWikilink={resolveWikilink}
        onJumpToWikilink={vi.fn()}
      />
    );

    const link = screen.getByText('preview-link');

    await act(async () => {
      fireEvent.mouseEnter(link);
    });

    await waitFor(() => {
      const previewEl = document.querySelector('.wikilink-preview');
      expect(previewEl).toBeInTheDocument();
      expect(previewEl?.textContent).toContain('Preview text here');
    });
  });

  it('does not show preview when resolveWikilink is not provided', async () => {
    render(
      <MarkdownRenderer content="text" onJumpToWikilink={vi.fn()} />
    );

    const link = screen.getByText('preview-link');
    await act(async () => {
      fireEvent.mouseEnter(link);
    });

    // No preview should appear
    expect(document.querySelector('.wikilink-preview')).not.toBeInTheDocument();
  });

  it('does not show preview when resolveWikilink returns null', async () => {
    const resolveWikilink = vi.fn().mockReturnValue(null);
    render(
      <MarkdownRenderer
        content="text"
        resolveWikilink={resolveWikilink}
        onJumpToWikilink={vi.fn()}
      />
    );

    const link = screen.getByText('preview-link');
    await act(async () => {
      fireEvent.mouseEnter(link);
    });

    expect(document.querySelector('.wikilink-preview')).not.toBeInTheDocument();
  });

  it('renders non-http external links without preventDefault', () => {
    render(<MarkdownRenderer content="text" />);
    const emailLink = screen.getByText('email-link');
    // clicking should not call openUrl since href is mailto:
    fireEvent.click(emailLink);
    expect((window as any).api.materials.openUrl).not.toHaveBeenCalled();
  });

  it('renders embedded image with width style', () => {
    render(
      <MarkdownRenderer
        content="text"
        attachIndex={{ 'sized.png': '/vault/sized.png' }}
      />
    );
    const img = document.querySelector('.note-embed-img') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.style.maxWidth).toBe('300px');
  });

  it('shows missing embed when attachIndex is not provided', () => {
    render(<MarkdownRenderer content="text" />);
    // Without attachIndex, embed lookups return undefined
    const missing = document.querySelectorAll('.embed-missing');
    expect(missing.length).toBeGreaterThan(0);
  });

  it('renders mermaid error state', async () => {
    mockMermaidRender.mockRejectedValue(new Error('syntax error'));
    render(<MarkdownRenderer content="text" />);

    await waitFor(() => {
      const errEl = document.querySelector('.mermaid-error');
      expect(errEl).toBeInTheDocument();
    });
  });

  it('does not show preview when readNote returns empty body', async () => {
    (window as any).api.vault.readNote = vi.fn().mockResolvedValue('');
    const resolveWikilink = vi.fn().mockReturnValue('/vault/empty.md');
    render(
      <MarkdownRenderer
        content="text"
        resolveWikilink={resolveWikilink}
        onJumpToWikilink={vi.fn()}
      />
    );

    const link = screen.getByText('preview-link');
    await act(async () => {
      fireEvent.mouseEnter(link);
    });

    // Empty preview text should not show popup
    expect(document.querySelector('.wikilink-preview')).not.toBeInTheDocument();
  });

  it('handles readNote error gracefully in fetchPreview', async () => {
    (window as any).api.vault.readNote = vi.fn().mockRejectedValue(new Error('fail'));
    const resolveWikilink = vi.fn().mockReturnValue('/vault/error.md');
    render(
      <MarkdownRenderer
        content="text"
        resolveWikilink={resolveWikilink}
        onJumpToWikilink={vi.fn()}
      />
    );

    const link = screen.getByText('preview-link');
    await act(async () => {
      fireEvent.mouseEnter(link);
    });

    // Error should result in no preview
    expect(document.querySelector('.wikilink-preview')).not.toBeInTheDocument();
  });
});
