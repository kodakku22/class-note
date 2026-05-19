// YAML-backed frontmatter parser. Replaces the previous hand-rolled parser to
// support full YAML semantics (multi-line lists, nested objects, quoted strings, etc.)
import YAML from 'yaml';

export type Frontmatter = Record<string, unknown>;

export interface FrontmatterResult {
  meta: Frontmatter;
  body: string;
}

export function parseFrontmatter(content: string): FrontmatterResult {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: content };
  let meta: Frontmatter = {};
  try {
    const parsed = YAML.parse(m[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      meta = parsed as Frontmatter;
    }
  } catch {
    meta = {};
  }
  return { meta, body: m[2] };
}

export function stringifyFrontmatter(meta: Frontmatter, body: string): string {
  const yaml = YAML.stringify(meta, {
    indent: 2,
    lineWidth: 0,
    nullStr: 'null',
  });
  const trimmedBody = body.replace(/^\n+/, '');
  return `---\n${yaml.trimEnd()}\n---\n\n${trimmedBody}`;
}
