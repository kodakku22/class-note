import { useEffect, useId, useState, ReactNode } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { preprocessNotes, parseEmbedSrc } from './Wikilink';
import { CitationBadge, type CitationJumpPayload } from './ai/CitationBadge';
import type { DocAICitation } from '../types';

const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;
const PDF_RE = /\.pdf$/i;

// Lazily resolved at first Mermaid render so the ~500KB chunk doesn't ship
// in the initial bundle.
type MermaidApi = {
  initialize: (cfg: Record<string, unknown>) => void;
  render: (id: string, src: string) => Promise<{ svg: string }>;
};
let mermaidPromise: Promise<MermaidApi> | null = null;
function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      const api = (mod.default ?? mod) as MermaidApi;
      api.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'strict',
        fontFamily: 'inherit',
      });
      return api;
    });
  }
  return mermaidPromise;
}

function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);
  const reactId = useId();
  const renderId = `mmd-${reactId.replace(/:/g, '')}`;

  useEffect(() => {
    let cancelled = false;
    setErr(null);
    loadMermaid()
      .then((api) => api.render(renderId, code))
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg);
      })
      .catch((e) => {
        if (!cancelled) setErr(e?.message ?? String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [code, renderId]);

  if (err) {
    return (
      <pre className="mermaid-error">
        ⚠️ Mermaid 図の解析エラー:{'\n'}
        {err}
      </pre>
    );
  }
  if (!svg) {
    return <div className="mermaid-loading">図を描画中…</div>;
  }
  return <div className="mermaid-render" dangerouslySetInnerHTML={{ __html: svg }} />;
}

import { toAppFileUrl as fileToAppUrl } from '../utils/paths';

type Props = {
  content: string;
  attachIndex?: Record<string, string>;
  onJumpToWikilink?: (name: string) => void;
  onJumpToFile?: (filePath: string) => void;
  resolveWikilink?: (name: string) => string | null;
  /** Optional citations table: when provided, [出典 N] markers in the content
   * are converted to clickable CitationBadge components. */
  citations?: DocAICitation[];
  citationFilePathBySource?: Record<string, string>;
  onJumpToSource?: (payload: CitationJumpPayload) => void;
};

/**
 * Pre-process the body so [出典 N] markers become Markdown anchors with the
 * custom `cite:N` protocol. The custom `a` renderer below replaces them with
 * a CitationBadge component.
 */
function preprocessCitations(content: string): string {
  return content.replace(/\[出典\s*[: ]?\s*(\d+)\]/g, (_m, n) => `[\u200B${n}](cite:${n})`);
}

const previewCache = new Map<string, string>();

async function fetchPreview(filePath: string): Promise<string> {
  const cached = previewCache.get(filePath);
  if (cached !== undefined) return cached;
  try {
    const raw = await window.api.vault.readNote(filePath);
    const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
    const text = body.replace(/\s+/g, ' ').slice(0, 280).trim();
    previewCache.set(filePath, text);
    return text;
  } catch {
    return '';
  }
}

export function MarkdownRenderer({
  content,
  attachIndex,
  onJumpToWikilink,
  onJumpToFile,
  resolveWikilink,
  citations,
  citationFilePathBySource,
  onJumpToSource,
}: Props) {
  const [preview, setPreview] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  const showPreview = async (e: React.MouseEvent<HTMLAnchorElement>, name: string) => {
    if (!resolveWikilink) return;
    const filePath = resolveWikilink(name);
    if (!filePath) return;
    const rect = (e.currentTarget as HTMLAnchorElement).getBoundingClientRect();
    const text = await fetchPreview(filePath);
    if (!text) return;
    setPreview({ text, x: rect.left, y: rect.bottom + 6 });
  };
  const hidePreview = () => setPreview(null);

  const components: Components = {
    a: ({ href, children }) => {
      if (href?.startsWith('cite:') && citations) {
        const id = Number(href.slice('cite:'.length));
        return (
          <CitationBadge
            id={id}
            citations={citations}
            filePathBySource={citationFilePathBySource}
            onJump={onJumpToSource}
          />
        );
      }
      if (href?.startsWith('wikilink:')) {
        const name = decodeURIComponent(href.slice('wikilink:'.length));
        return (
          <a
            href="#"
            className="wikilink"
            onClick={(e) => {
              e.preventDefault();
              hidePreview();
              onJumpToWikilink?.(name);
            }}
            onMouseEnter={(e) => showPreview(e, name)}
            onMouseLeave={hidePreview}
          >
            {children}
          </a>
        );
      }
      if (href?.startsWith('tag:')) {
        return <span className="tag-chip inline">{children}</span>;
      }
      return (
        <a
          href={href}
          onClick={(e) => {
            if (href && /^https?:/.test(href)) {
              e.preventDefault();
              window.api.materials.openUrl(href);
            }
          }}
        >
          {children}
        </a>
      );
    },
    img: ({ src, alt }) => {
      if (!src?.startsWith('embed:')) return <img src={src} alt={alt} />;
      const { name, width } = parseEmbedSrc(src);
      const resolved = attachIndex?.[name];
      if (!resolved) {
        return <span className="embed-missing">⚠️ {name} が見つかりません</span>;
      }
      if (PDF_RE.test(name)) {
        return (
          <span
            className="pdf-embed-card"
            onClick={() => onJumpToFile?.(resolved)}
            role="button"
            tabIndex={0}
          >
            <span className="pdf-embed-icon">📕</span>
            <span className="pdf-embed-text">
              <span className="pdf-embed-name">{name}</span>
              <span className="pdf-embed-hint">クリックで開く</span>
            </span>
          </span>
        );
      }
      if (IMAGE_RE.test(name)) {
        return (
          <img
            src={fileToAppUrl(resolved)}
            alt={alt || name}
            className="note-embed-img"
            style={width ? { maxWidth: `${width}px` } : undefined}
          />
        );
      }
      return (
        <a
          href="#"
          className="other-embed-link"
          onClick={(ev) => {
            ev.preventDefault();
            window.api.materials.openExternal(resolved);
          }}
        >
          📎 {name}
        </a>
      );
    },
    code: (props) => {
      const { className, children, ...rest } = props as {
        className?: string;
        children?: ReactNode;
      };
      if (className?.includes('language-mermaid')) {
        return <MermaidBlock code={String(children).trim()} />;
      }
      return (
        <code className={className} {...rest}>
          {children}
        </code>
      );
    },
  };

  return (
    <>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeHighlight]}
        components={components}
      >
        {citations ? preprocessCitations(preprocessNotes(content)) : preprocessNotes(content)}
      </ReactMarkdown>
      {preview && (
        <div
          className="wikilink-preview"
          style={{ left: preview.x, top: preview.y }}
        >
          {preview.text}
        </div>
      )}
    </>
  );
}
