export type BibtexEntry = {
  entryType: string;
  bibkey: string;
  fields: Record<string, string>;
};

export type BibtexPaperInput = {
  title: string;
  bibkey: string;
  authors?: string[];
  year?: number;
  venue?: string;
  doi?: string;
  arxiv?: string;
  url?: string;
};

function readBalanced(input: string, start: number, open: string, close: string): { value: string; end: number } | null {
  let depth = 0;
  for (let i = start; i < input.length; i += 1) {
    const ch = input[i];
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return { value: input.slice(start + 1, i), end: i + 1 };
    }
  }
  return null;
}

function cleanValue(value: string): string {
  let v = value.trim();
  if ((v.startsWith('{') && v.endsWith('}')) || (v.startsWith('"') && v.endsWith('"'))) {
    v = v.slice(1, -1);
  }
  return v
    .replace(/\\([{}"\\])/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitFields(body: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /[\s,]/.test(body[i])) i += 1;
    const nameStart = i;
    while (i < body.length && /[A-Za-z0-9_-]/.test(body[i])) i += 1;
    const name = body.slice(nameStart, i).toLowerCase();
    while (i < body.length && /\s/.test(body[i])) i += 1;
    if (!name || body[i] !== '=') {
      i += 1;
      continue;
    }
    i += 1;
    while (i < body.length && /\s/.test(body[i])) i += 1;

    let raw = '';
    if (body[i] === '{') {
      const balanced = readBalanced(body, i, '{', '}');
      if (!balanced) break;
      raw = body.slice(i, balanced.end);
      i = balanced.end;
    } else if (body[i] === '"') {
      i += 1;
      const start = i;
      while (i < body.length && body[i] !== '"') i += body[i] === '\\' ? 2 : 1;
      raw = `"${body.slice(start, i)}"`;
      i += 1;
    } else {
      const start = i;
      while (i < body.length && body[i] !== ',') i += 1;
      raw = body.slice(start, i);
    }
    fields[name] = cleanValue(raw);
    while (i < body.length && body[i] !== ',') i += 1;
  }
  return fields;
}

export function parseBibtex(input: string): BibtexEntry[] {
  const entries: BibtexEntry[] = [];
  let i = 0;
  while (i < input.length) {
    const at = input.indexOf('@', i);
    if (at < 0) break;
    const typeMatch = input.slice(at + 1).match(/^\s*([A-Za-z]+)\s*[{(]/);
    if (!typeMatch) {
      i = at + 1;
      continue;
    }
    const entryType = typeMatch[1].toLowerCase();
    const openIndex = at + 1 + typeMatch[0].lastIndexOf(typeMatch[0].includes('{') ? '{' : '(');
    const open = input[openIndex];
    const balanced = readBalanced(input, openIndex, open, open === '{' ? '}' : ')');
    if (!balanced) break;
    const content = balanced.value;
    const comma = content.indexOf(',');
    const bibkey = (comma > 0 ? content.slice(0, comma) : content).trim();
    if (bibkey) {
      entries.push({
        entryType,
        bibkey,
        fields: comma > 0 ? splitFields(content.slice(comma + 1)) : {},
      });
    }
    i = balanced.end;
  }
  return entries;
}

function authorsFromBibtex(authorField?: string): string[] | undefined {
  if (!authorField) return undefined;
  const authors = authorField
    .split(/\s+and\s+/i)
    .map((author) => author.trim())
    .filter(Boolean);
  return authors.length > 0 ? authors : undefined;
}

function arxivFromEntry(fields: Record<string, string>): string | undefined {
  if (fields.archiveprefix?.toLowerCase() === 'arxiv' && fields.eprint) return fields.eprint;
  const url = fields.url ?? '';
  return url.match(/arxiv\.org\/(?:abs|pdf)\/([^/?#]+)/i)?.[1];
}

export function bibtexEntryToPaper(entry: BibtexEntry): BibtexPaperInput {
  const f = entry.fields;
  const title = f.title || entry.bibkey;
  const venue = f.journal || f.booktitle || f.publisher || f.school || f.organization;
  const yearMatch = (f.year ?? f.date ?? '').match(/\d{4}/);
  return {
    title,
    bibkey: entry.bibkey,
    authors: authorsFromBibtex(f.author || f.editor) ?? [],
    year: yearMatch ? Number(yearMatch[0]) : undefined,
    venue,
    doi: f.doi,
    arxiv: arxivFromEntry(f),
    url: f.url,
  };
}
