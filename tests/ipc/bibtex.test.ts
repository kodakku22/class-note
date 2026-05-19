// @vitest-environment node
//
// BibTeX export logic tests. The Phase 2 papers handler builds BibTeX entries
// from frontmatter; we replicate the helper here so the test stays focused
// on the format guarantees that downstream LaTeX consumers depend on:
//   - Special chars are escaped: { } \\
//   - Multi-line abstracts collapse to one line
//   - Authors are joined with " and " (BibTeX standard)
//   - Conference venues use @inproceedings, journals use @article
import { describe, it, expect } from 'vitest';
import { bibtexEntryToPaper, parseBibtex } from '../../electron/papers/bibtex';

function escapeBibValue(s: string): string {
  return s.replace(/[{}\\]/g, (c) => `\\${c}`).replace(/\n+/g, ' ');
}

function inferBibtexType(venue: string | undefined): string {
  if (!venue) return 'misc';
  const v = venue.toLowerCase();
  if (
    /proc\.|conference|symposium|workshop|neurips|nips|iclr|icml|cvpr|acl|emnlp|naacl|aaai|kdd|sigir|chi|uist/.test(
      v
    )
  ) {
    return 'inproceedings';
  }
  if (v.includes('arxiv')) return 'misc';
  return 'article';
}

function deriveBibkey(authors: string[], year: number | undefined, title: string): string {
  const first = (authors[0] ?? '').split(/\s+/).pop() ?? 'unknown';
  const yearPart = year ? String(year) : 'nd';
  const word = (title.match(/[A-Za-z]+/) ?? ['paper'])[0].toLowerCase();
  return `${first.toLowerCase()}${yearPart}${word}`.replace(/[^a-z0-9]/g, '');
}

describe('escapeBibValue', () => {
  it('escapes braces and backslashes', () => {
    expect(escapeBibValue('a{b}c\\d')).toBe('a\\{b\\}c\\\\d');
  });
  it('collapses newlines', () => {
    expect(escapeBibValue('a\nb\n\nc')).toBe('a b c');
  });
  it('preserves other characters', () => {
    expect(escapeBibValue('Hello, World! 100%')).toBe('Hello, World! 100%');
  });
});

describe('inferBibtexType', () => {
  it('detects conference venues', () => {
    expect(inferBibtexType('NeurIPS 2017')).toBe('inproceedings');
    expect(inferBibtexType('ICLR 2024')).toBe('inproceedings');
    expect(inferBibtexType('ACL 2023')).toBe('inproceedings');
    expect(inferBibtexType('Proc. of IEEE')).toBe('inproceedings');
  });
  it('treats arXiv as misc', () => {
    expect(inferBibtexType('arXiv (cs.LG)')).toBe('misc');
  });
  it('defaults to article for journals', () => {
    expect(inferBibtexType('Nature')).toBe('article');
    expect(inferBibtexType('Science')).toBe('article');
  });
  it('defaults to misc when venue is missing', () => {
    expect(inferBibtexType(undefined)).toBe('misc');
  });
});

describe('deriveBibkey', () => {
  it('builds authorYearWord from "Vaswani et al. 2017 Attention…"', () => {
    expect(deriveBibkey(['Ashish Vaswani', 'Noam Shazeer'], 2017, 'Attention Is All You Need')).toBe(
      'vaswani2017attention'
    );
  });
  it('handles single-word author', () => {
    expect(deriveBibkey(['Karpathy'], 2024, 'Software 2.0')).toBe('karpathy2024software');
  });
  it('uses "nd" when year missing', () => {
    expect(deriveBibkey(['Smith'], undefined, 'Note')).toBe('smithndnote');
  });
  it('strips non-alphanumeric chars', () => {
    expect(deriveBibkey(["O'Brien"], 2020, 'Multi-Agent')).toBe('obrien2020multi');
  });
});

describe('parseBibtex import', () => {
  it('parses article entries with authors, DOI and URL', () => {
    const [entry] = parseBibtex(`
      @article{doe2024learning,
        title = {Learning Systems},
        author = {Doe, Jane and Smith, John},
        year = {2024},
        journal = {Journal of Learning},
        doi = {10.1234/example},
        url = {https://example.com/paper}
      }
    `);
    const paper = bibtexEntryToPaper(entry);
    expect(paper).toMatchObject({
      bibkey: 'doe2024learning',
      title: 'Learning Systems',
      authors: ['Doe, Jane', 'Smith, John'],
      year: 2024,
      venue: 'Journal of Learning',
      doi: '10.1234/example',
      url: 'https://example.com/paper',
    });
  });

  it('parses inproceedings and preserves braced values with commas', () => {
    const [entry] = parseBibtex(`
      @inproceedings{lee2023robust,
        title = {Robust Parsing, With Commas},
        author = "Lee, Ada and Kim, Min",
        booktitle = {Proceedings of TestConf},
        year = 2023
      }
    `);
    const paper = bibtexEntryToPaper(entry);
    expect(entry.entryType).toBe('inproceedings');
    expect(paper.title).toBe('Robust Parsing, With Commas');
    expect(paper.venue).toBe('Proceedings of TestConf');
    expect(paper.authors).toEqual(['Lee, Ada', 'Kim, Min']);
  });

  it('extracts arXiv IDs from Better BibTeX style fields', () => {
    const [entry] = parseBibtex(`
      @misc{vaswani2017attention,
        title = {Attention Is All You Need},
        author = {Vaswani, Ashish and Shazeer, Noam},
        archivePrefix = {arXiv},
        eprint = {1706.03762},
        url = {https://arxiv.org/abs/1706.03762}
      }
    `);
    expect(bibtexEntryToPaper(entry)).toMatchObject({
      arxiv: '1706.03762',
      url: 'https://arxiv.org/abs/1706.03762',
      year: undefined,
    });
  });

  it('uses bibkey as fallback title for sparse entries', () => {
    const [entry] = parseBibtex('@misc{untitled2026}');
    expect(bibtexEntryToPaper(entry)).toMatchObject({
      bibkey: 'untitled2026',
      title: 'untitled2026',
      authors: [],
    });
  });
});
