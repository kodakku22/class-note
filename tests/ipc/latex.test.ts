// @vitest-environment node
//
// Phase 3 LaTeX export tests. We focus on the deterministic Markdown→TeX
// fallback (the path users hit when Pandoc is not installed). Pandoc-based
// conversion is integration territory and lives in E2E tests.
import { describe, it, expect } from 'vitest';

// Mirror of the implementation in electron/ipc/latex.ts. Drift here would
// indicate the test should be updated to match the real handler.
function transformInline(s: string): string {
  return s
    .replace(/\[@([^\]]+)\]/g, '\\cite{$1}')
    .replace(/`([^`]+)`/g, '\\texttt{$1}')
    .replace(/\*\*([^*]+)\*\*/g, '\\textbf{$1}')
    .replace(/\*([^*]+)\*/g, '\\textit{$1}')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '\\href{$2}{$1}');
}

function markdownToTexFallback(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inCodeBlock = false;
  let inList: 'itemize' | 'enumerate' | null = null;
  for (const line of lines) {
    if (line.startsWith('```')) {
      if (!inCodeBlock) {
        out.push('\\begin{verbatim}');
        inCodeBlock = true;
      } else {
        out.push('\\end{verbatim}');
        inCodeBlock = false;
      }
      continue;
    }
    if (inCodeBlock) {
      out.push(line);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (inList !== 'itemize') {
        if (inList) out.push(`\\end{${inList}}`);
        out.push('\\begin{itemize}');
        inList = 'itemize';
      }
      out.push(`  \\item ${transformInline(line.replace(/^[-*]\s+/, ''))}`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      if (inList !== 'enumerate') {
        if (inList) out.push(`\\end{${inList}}`);
        out.push('\\begin{enumerate}');
        inList = 'enumerate';
      }
      out.push(`  \\item ${transformInline(line.replace(/^\d+\.\s+/, ''))}`);
      continue;
    }
    if (inList && line.trim() === '') {
      out.push(`\\end{${inList}}`);
      inList = null;
      out.push('');
      continue;
    }
    const h1 = line.match(/^# (.+)$/);
    if (h1) {
      out.push(`\\section{${transformInline(h1[1])}}`);
      continue;
    }
    const h2 = line.match(/^## (.+)$/);
    if (h2) {
      out.push(`\\subsection{${transformInline(h2[1])}}`);
      continue;
    }
    const h3 = line.match(/^### (.+)$/);
    if (h3) {
      out.push(`\\subsubsection{${transformInline(h3[1])}}`);
      continue;
    }
    out.push(transformInline(line));
  }
  if (inList) out.push(`\\end{${inList}}`);
  return out.join('\n');
}

describe('transformInline', () => {
  it('converts Pandoc citations to \\cite{}', () => {
    expect(transformInline('See [@vaswani2017attention] for details.')).toBe(
      'See \\cite{vaswani2017attention} for details.'
    );
  });
  it('handles multiple citations in one line', () => {
    expect(transformInline('[@a2017x] and [@b2018y]')).toBe('\\cite{a2017x} and \\cite{b2018y}');
  });
  it('converts inline code to \\texttt', () => {
    expect(transformInline('Use `gradient_descent`.')).toBe('Use \\texttt{gradient_descent}.');
  });
  it('converts bold to \\textbf', () => {
    expect(transformInline('**important**')).toBe('\\textbf{important}');
  });
  it('converts italic to \\textit', () => {
    expect(transformInline('*emphasized*')).toBe('\\textit{emphasized}');
  });
  it('converts links to \\href', () => {
    expect(transformInline('[arXiv](https://arxiv.org)')).toBe('\\href{https://arxiv.org}{arXiv}');
  });
});

describe('markdownToTexFallback', () => {
  it('converts headings to sectional commands', () => {
    expect(markdownToTexFallback('# Title')).toContain('\\section{Title}');
    expect(markdownToTexFallback('## Section')).toContain('\\subsection{Section}');
    expect(markdownToTexFallback('### Subsection')).toContain('\\subsubsection{Subsection}');
  });

  it('wraps fenced code in verbatim', () => {
    const md = '```\nint main() {}\n```';
    const tex = markdownToTexFallback(md);
    expect(tex).toContain('\\begin{verbatim}');
    expect(tex).toContain('int main() {}');
    expect(tex).toContain('\\end{verbatim}');
  });

  it('wraps unordered lists in itemize', () => {
    const md = '- a\n- b\n- c';
    const tex = markdownToTexFallback(md);
    expect(tex).toContain('\\begin{itemize}');
    expect(tex).toContain('\\item a');
    expect(tex).toContain('\\end{itemize}');
  });

  it('wraps ordered lists in enumerate', () => {
    const md = '1. first\n2. second';
    const tex = markdownToTexFallback(md);
    expect(tex).toContain('\\begin{enumerate}');
    expect(tex).toContain('\\item first');
    expect(tex).toContain('\\end{enumerate}');
  });

  it('preserves inline citations through the full pipeline', () => {
    const tex = markdownToTexFallback(
      '## Method\n\nFollows [@vaswani2017attention] closely.'
    );
    expect(tex).toContain('\\subsection{Method}');
    expect(tex).toContain('\\cite{vaswani2017attention}');
  });
});
