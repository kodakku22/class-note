// Renderer-side YAML frontmatter helpers. Parses with the same library
// (`yaml`) as the main process so behaviour is identical on both sides.
import YAML from 'yaml';

export type Frontmatter = Record<string, unknown>;

export function parseFrontmatter(content: string): { meta: Frontmatter; body: string } {
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
  // Drop empty / null fields so the on-disk file stays clean.
  const clean: Frontmatter = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v == null) continue;
    if (typeof v === 'string' && !v.trim()) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    clean[k] = v;
  }
  if (Object.keys(clean).length === 0) {
    // No frontmatter to write — return plain body
    return body.replace(/^\n+/, '');
  }
  const yaml = YAML.stringify(clean, { indent: 2, lineWidth: 0, nullStr: 'null' });
  const trimmedBody = body.replace(/^\n+/, '');
  return `---\n${yaml.trimEnd()}\n---\n\n${trimmedBody}`;
}
