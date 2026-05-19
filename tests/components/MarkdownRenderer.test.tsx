import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

// Use a more realistic ReactMarkdown mock that actually calls the components
vi.mock('react-markdown', () => ({
  default: ({ children, components }: any) => {
    // Render children as text and also test the custom components
    const A = components?.a;
    const Img = components?.img;
    const Code = components?.code;
    return (
      <div data-testid="markdown-root">
        {children}
        {A && <A href="wikilink:TestLink">wikilink-child</A>}
        {A && <A href="tag:ml">tag-child</A>}
        {A && <A href="https://example.com">external-link</A>}
        {Img && <Img src="embed:photo.png" alt="photo" />}
        {Img && <Img src="embed:doc.pdf" alt="pdf" />}
        {Img && <Img src="embed:missing.xyz" alt="missing" />}
        {Img && <Img src="embed:file.docx" alt="docx" />}
        {Img && <Img src="https://example.com/img.png" alt="normal-img" />}
        {Code && <Code className="language-mermaid">graph TD; A--&gt;B</Code>}
        {Code && <Code className="language-js">const x = 1;</Code>}
      </div>
    );
  },
}));
vi.mock('remark-gfm', () => ({ default: vi.fn() }));
vi.mock('remark-math', () => ({ default: vi.fn() }));
vi.mock('rehype-katex', () => ({ default: vi.fn() }));
vi.mock('rehype-highlight', () => ({ default: vi.fn() }));
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg>mermaid</svg>' }),
  },
}));

vi.mock('../../src/components/Wikilink', () => ({
  preprocessNotes: (s: string) => s,
  parseEmbedSrc: (src: string) => {
    const name = src.replace('embed:', '');
    return { name, width: null };
  },
}));

vi.mock('../../src/utils/paths', () => ({
  toAppFileUrl: (p: string) => `file://${p}`,
}));

import { MarkdownRenderer } from '../../src/components/MarkdownRenderer';

describe('MarkdownRenderer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (window as any).api = {
      vault: { readNote: vi.fn().mockResolvedValue('---\ntitle: T\n---\nPreview text here') },
      materials: {
        openUrl: vi.fn(),
        openExternal: vi.fn(),
      },
    };
  });

  it('renders markdown root', () => {
    render(<MarkdownRenderer content="# Hello" />);
    expect(screen.getByTestId('markdown-root')).toBeInTheDocument();
  });

  it('renders wikilink as clickable anchor', () => {
    const onJump = vi.fn();
    render(<MarkdownRenderer content="text" onJumpToWikilink={onJump} />);
    const wikilink = screen.getByText('wikilink-child');
    expect(wikilink).toBeInTheDocument();
    expect(wikilink.className).toContain('wikilink');
  });

  it('calls onJumpToWikilink on click', async () => {
    const onJump = vi.fn();
    render(<MarkdownRenderer content="text" onJumpToWikilink={onJump} />);
    await act(async () => {
      fireEvent.click(screen.getByText('wikilink-child'));
    });
    expect(onJump).toHaveBeenCalledWith('TestLink');
  });

  it('renders tag as span with tag-chip class', () => {
    render(<MarkdownRenderer content="text" />);
    const tag = screen.getByText('tag-child');
    expect(tag.className).toContain('tag-chip');
  });

  it('renders external link and opens via API', async () => {
    render(<MarkdownRenderer content="text" />);
    const link = screen.getByText('external-link');
    await act(async () => {
      fireEvent.click(link);
    });
    expect((window as any).api.materials.openUrl).toHaveBeenCalledWith('https://example.com');
  });

  it('renders embedded image with file URL', () => {
    render(
      <MarkdownRenderer
        content="text"
        attachIndex={{ 'photo.png': '/vault/attachments/photo.png' }}
      />
    );
    const img = document.querySelector('.note-embed-img') as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.src).toContain('file://');
  });

  it('renders embed-missing for unknown attachments', () => {
    render(<MarkdownRenderer content="text" attachIndex={{}} />);
    const missing = document.querySelectorAll('.embed-missing');
    expect(missing.length).toBeGreaterThan(0);
  });

  it('renders PDF embed card', () => {
    render(
      <MarkdownRenderer
        content="text"
        attachIndex={{ 'doc.pdf': '/vault/attachments/doc.pdf' }}
        onJumpToFile={vi.fn()}
      />
    );
    expect(document.querySelector('.pdf-embed-card')).toBeInTheDocument();
  });

  it('renders other embed as link', () => {
    render(
      <MarkdownRenderer
        content="text"
        attachIndex={{ 'file.docx': '/vault/attachments/file.docx' }}
      />
    );
    expect(document.querySelector('.other-embed-link')).toBeInTheDocument();
  });

  it('renders normal img tag for non-embed src', () => {
    render(<MarkdownRenderer content="text" />);
    const img = document.querySelector('img[alt="normal-img"]');
    expect(img).toBeInTheDocument();
  });

  it('renders mermaid block for language-mermaid code', () => {
    render(<MarkdownRenderer content="text" />);
    // Mermaid block shows loading state initially
    expect(document.querySelector('.mermaid-loading')).toBeInTheDocument();
  });

  it('renders regular code block for non-mermaid', () => {
    render(<MarkdownRenderer content="text" />);
    const codeEls = document.querySelectorAll('code.language-js');
    expect(codeEls.length).toBe(1);
  });

  it('calls onJumpToFile on PDF embed click', async () => {
    const onJumpToFile = vi.fn();
    render(
      <MarkdownRenderer
        content="text"
        attachIndex={{ 'doc.pdf': '/vault/attachments/doc.pdf' }}
        onJumpToFile={onJumpToFile}
      />
    );
    const card = document.querySelector('.pdf-embed-card') as HTMLElement;
    await act(async () => {
      fireEvent.click(card);
    });
    expect(onJumpToFile).toHaveBeenCalledWith('/vault/attachments/doc.pdf');
  });

  it('calls openExternal on other embed click', async () => {
    render(
      <MarkdownRenderer
        content="text"
        attachIndex={{ 'file.docx': '/vault/attachments/file.docx' }}
      />
    );
    const link = document.querySelector('.other-embed-link') as HTMLElement;
    await act(async () => {
      fireEvent.click(link);
    });
    expect((window as any).api.materials.openExternal).toHaveBeenCalledWith('/vault/attachments/file.docx');
  });
});
