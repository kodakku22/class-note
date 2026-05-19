// LaTeX / Pandoc export — Phase 3 完成版。
//
// 単体ノートまたは Wiki 全体を `.tex` に変換し、Papers/refs.bib と一緒に
// <vault>/Outputs/ 配下に書出します。Pandoc がローカルにインストール
// されていれば実 LaTeX 変換を行い、無ければ Markdown → 簡易 TeX のフォール
// バック (見出し・リスト・引用のみ) を提供します。
//
// 学会別テンプレート:
//   - neurips     : NeurIPS スタイル + author block
//   - acl         : ACL anthology スタイル
//   - ieee        : IEEE conference スタイル
//   - generic     : article クラス (デフォルト)
//
// テンプレートは <vault>/_templates/latex/<style>.tex に置けばユーザーが
// カスタマイズ可能。無ければ ClassNotes 同梱のデフォルトを使う。
import { ipcMain } from 'electron';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  validateVaultPath,
  atomicWrite,
  ensureDir,
  exists,
  safeName,
} from './utils';
import { parseFrontmatter } from './frontmatter';
import { logger } from '../logger';

type Style = 'neurips' | 'acl' | 'ieee' | 'generic';

const TEX_STYLES: Style[] = ['neurips', 'acl', 'ieee', 'generic'];

// Default LaTeX preambles — kept minimal so the user can customize without
// fighting heavy boilerplate.
const DEFAULT_PREAMBLES: Record<Style, string> = {
  neurips: [
    '\\documentclass{article}',
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage{neurips_2024}',
    '\\usepackage{hyperref}',
    '\\usepackage{graphicx}',
    '\\usepackage{amsmath,amssymb}',
  ].join('\n'),
  acl: [
    '\\documentclass[11pt]{article}',
    '\\usepackage{acl}',
    '\\usepackage{hyperref}',
    '\\usepackage{amsmath,amssymb}',
    '\\usepackage{graphicx}',
  ].join('\n'),
  ieee: [
    '\\documentclass[conference]{IEEEtran}',
    '\\usepackage{cite}',
    '\\usepackage{amsmath,amssymb}',
    '\\usepackage{graphicx}',
    '\\usepackage{hyperref}',
  ].join('\n'),
  generic: [
    '\\documentclass{article}',
    '\\usepackage[utf8]{inputenc}',
    '\\usepackage{hyperref}',
    '\\usepackage{graphicx}',
    '\\usepackage{amsmath,amssymb}',
  ].join('\n'),
};

function detectPandoc(): Promise<string | null> {
  return new Promise((resolve) => {
    const finder = process.platform === 'win32' ? 'where.exe' : 'which';
    execFile(finder, ['pandoc'], { windowsHide: true, timeout: 5_000 }, (err, stdout) => {
      if (err) return resolve(null);
      const lines = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const exe =
        lines.find((l) => l.toLowerCase().endsWith('.exe')) ||
        lines.find((l) => !l.toLowerCase().endsWith('.cmd')) ||
        lines[0];
      resolve(exe || null);
    });
  });
}

/**
 * Convert Markdown to (very simple) LaTeX without invoking Pandoc.
 * Used as a fallback when Pandoc isn't installed. Supports:
 *   - # / ## / ### → \\section / \\subsection / \\subsubsection
 *   - **bold** → \\textbf{bold}
 *   - *italic* → \\textit{italic}
 *   - - list / 1. list → itemize / enumerate
 *   - [@bibkey] → \\cite{bibkey}
 *   - inline `code` → \\texttt{code}
 *   - ``` fenced code ``` → verbatim
 * Math is preserved as-is (LaTeX understands $ ... $ natively).
 */
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
    // Lists
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
    // Headings
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

function transformInline(s: string): string {
  return s
    .replace(/\[@([^\]]+)\]/g, '\\cite{$1}')
    .replace(/`([^`]+)`/g, '\\texttt{$1}')
    .replace(/\*\*([^*]+)\*\*/g, '\\textbf{$1}')
    .replace(/\*([^*]+)\*/g, '\\textit{$1}')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '\\href{$2}{$1}');
}

/**
 * Read a user-provided LaTeX template if present, else return the default.
 * The user template should contain the placeholder `%%CONTENT%%` where the
 * converted Markdown will be substituted.
 */
async function loadTemplate(vaultPath: string, style: Style): Promise<string> {
  const userPath = path.join(vaultPath, '_templates', 'latex', `${style}.tex`);
  if (await exists(userPath)) {
    try {
      return await fs.readFile(userPath, 'utf-8');
    } catch {
      // fall back
    }
  }
  return [
    DEFAULT_PREAMBLES[style],
    '',
    '\\title{%%TITLE%%}',
    '\\author{%%AUTHORS%%}',
    '\\date{%%DATE%%}',
    '\\begin{document}',
    '\\maketitle',
    '',
    '%%CONTENT%%',
    '',
    '\\bibliographystyle{plain}',
    '\\bibliography{refs}',
    '\\end{document}',
  ].join('\n');
}

export function createLatexHandlers() {
  return {
    'latex:detectPandoc': async (_e: unknown) => {
      const p = await detectPandoc();
      return p ? { ok: true, path: p } : { ok: false };
    },

    'latex:listStyles': async (_e: unknown) => TEX_STYLES,

    /**
     * Export a single Markdown note to LaTeX in `<vault>/Outputs/<date>_<title>_<style>/`.
     * Also copies `Papers/refs.bib` alongside if present, so the LaTeX
     * compiles standalone with `pdflatex && bibtex && pdflatex && pdflatex`.
     */
    'latex:exportNote': async (
      _e: unknown,
      vaultPath: string,
      filePath: string,
      style: Style = 'generic'
    ): Promise<{ ok: boolean; outputDir?: string; texPath?: string; usedPandoc?: boolean; error?: string }> => {
      const root = path.resolve(vaultPath);
      validateVaultPath(filePath, root);
      if (!(await exists(filePath))) return { ok: false, error: 'ファイルが見つかりません' };
      if (!TEX_STYLES.includes(style)) return { ok: false, error: '未対応のスタイルです' };

      const raw = await fs.readFile(filePath, 'utf-8');
      const { meta, body } = parseFrontmatter(raw);
      const title = (meta as { title?: string }).title ?? path.basename(filePath, '.md');
      const authorsRaw = (meta as { authors?: unknown }).authors;
      const authors = Array.isArray(authorsRaw)
        ? (authorsRaw as string[]).join(', ')
        : typeof authorsRaw === 'string'
          ? authorsRaw
          : '';
      const date = new Date().toISOString().slice(0, 10);

      const outputsRoot = path.join(root, 'Outputs');
      const subdir = `${date}_${safeName(title) || 'note'}_${style}`;
      const outDir = path.join(outputsRoot, subdir);
      validateVaultPath(outDir, root);
      await ensureDir(outDir);

      // Convert body. Try pandoc first; fall back to local converter.
      const pandoc = await detectPandoc();
      let converted: string;
      let usedPandoc = false;
      if (pandoc) {
        try {
          converted = await new Promise<string>((resolve, reject) => {
            execFile(
              pandoc,
              ['-f', 'markdown+raw_tex', '-t', 'latex', '--standalone=false'],
              { timeout: 60_000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
              (err, stdout) => {
                if (err) reject(err);
                else resolve(stdout);
              }
            ).stdin?.end(body);
          });
          usedPandoc = true;
        } catch (err) {
          logger.warn('[latex:exportNote] pandoc failed, falling back', err);
          converted = markdownToTexFallback(body);
        }
      } else {
        converted = markdownToTexFallback(body);
      }

      // Wrap with template.
      const template = await loadTemplate(root, style);
      const tex = template
        .replace('%%TITLE%%', title.replace(/[{}\\]/g, (c) => `\\${c}`))
        .replace('%%AUTHORS%%', authors.replace(/[{}\\]/g, (c) => `\\${c}`))
        .replace('%%DATE%%', date)
        .replace('%%CONTENT%%', converted);

      const texPath = path.join(outDir, 'main.tex');
      validateVaultPath(texPath, root);
      await atomicWrite(texPath, tex);

      // Copy refs.bib if present
      const refsBib = path.join(root, 'Papers', 'refs.bib');
      if (await exists(refsBib)) {
        try {
          await fs.copyFile(refsBib, path.join(outDir, 'refs.bib'));
        } catch (err) {
          logger.warn('[latex:exportNote] copy refs.bib failed', err);
        }
      }

      // README inside output dir explaining how to compile.
      const readme = [
        `# ${title} — LaTeX export`,
        '',
        `Generated by ClassNotes on ${date} using the **${style}** style.`,
        '',
        '## Compile',
        '',
        '```',
        'pdflatex main.tex',
        'bibtex main',
        'pdflatex main.tex',
        'pdflatex main.tex',
        '```',
        '',
        usedPandoc
          ? 'Body conversion used Pandoc.'
          : 'Body conversion used the built-in fallback (install Pandoc for full Markdown support).',
      ].join('\n');
      await atomicWrite(path.join(outDir, 'README.md'), readme);

      logger.info('[latex:exportNote] ok', { texPath, style, usedPandoc });
      return { ok: true, outputDir: outDir, texPath, usedPandoc };
    },
  };
}

export function registerLatexHandlers() {
  const handlers = createLatexHandlers();
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler as (...args: unknown[]) => unknown);
  }
}
