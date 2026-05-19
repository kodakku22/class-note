// Convert special markdown extensions into URLs the renderer can hand to a
// custom <a>/<img> component. URL prefixes used:
//   embed:<encoded-name>[|<encoded-opt>]   → image / pdf embed (![[name]])
//   wikilink:<encoded-name>                → wikilink jump ([[name]])
//   tag:<encoded-tag>                      → tag filter (#tag)
//
// Order matters: process ![[...]] before [[...]] so the trailing `[[...]]`
// regex doesn't match the inner part of an embed.
export function preprocessNotes(text: string): string {
  return text
    .replace(/!\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_m, name, opt) => {
      const trimmedName = name.trim();
      const trimmedOpt = opt?.trim();
      const url = `embed:${encodeURIComponent(trimmedName)}${
        trimmedOpt ? `|${encodeURIComponent(trimmedOpt)}` : ''
      }`;
      return `![${trimmedName}](${url})`;
    })
    .replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_m, target, label) => {
      const display = (label || target).trim();
      const url = `wikilink:${encodeURIComponent(target.trim())}`;
      return `[${display}](${url})`;
    })
    .replace(
      /(^|[\s(])#([\p{L}\p{N}_\-/]+)/gu,
      (_m, lead, tag) => `${lead}[#${tag}](tag:${encodeURIComponent(tag)})`
    );
}

export function extractTags(text: string): string[] {
  const set = new Set<string>();
  const re = /(?:^|\s)#([\p{L}\p{N}_\-/]+)/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) set.add(m[1]);
  return Array.from(set);
}

export function parseEmbedSrc(src: string): { name: string; width?: number } {
  // src example: "embed:photo.jpg|400" or "embed:photo.jpg"
  const body = src.slice('embed:'.length);
  const pipe = body.indexOf('|');
  if (pipe < 0) return { name: decodeURIComponent(body) };
  const name = decodeURIComponent(body.slice(0, pipe));
  const opt = decodeURIComponent(body.slice(pipe + 1));
  const w = parseInt(opt, 10);
  return { name, width: Number.isFinite(w) && w > 0 ? w : undefined };
}
