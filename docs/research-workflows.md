# Research Workflows

ClassNotes is optimized for individual researchers and graduate students who
want plain Markdown files, Obsidian-compatible links, local ownership, and
optional AI assistance.

## Zotero / Obsidian Interop Check

Settings includes a **Zotero / Obsidian compatibility check** under the
Obsidian Skills section. It inspects the local Vault only and reports:

- whether `.obsidian` exists, Markdown files have frontmatter, and wikilinks are present;
- whether `Papers/refs.bib` exists for Zotero / Better BibTeX workflows;
- how many Paper notes have `bibkey` and DOI metadata;
- duplicate `bibkey` values that would make citation resolution unstable.

The report is advisory and never modifies the Vault. It also returns a dry-run
repair plan for common issues such as missing frontmatter, unresolved wikilinks,
missing `bibkey` / DOI metadata, and stale `refs.bib` exports. Fixes such as
exporting `refs.bib` or adding missing citation keys remain explicit user
actions.

## Workflow 1: Literature Review

Goal: move from paper discovery to cited writing without losing source context.

1. Import papers through DOI, arXiv, PDF, or BibTeX.
2. Keep one Markdown note per paper in `Papers/`.
3. Add or verify frontmatter fields:
   - `title`
   - `bibkey`
   - `authors`
   - `year`
   - `venue`
   - `doi` or `arxiv`
   - `status`
   - `tags`
4. Write reading notes with:
   - one-line claim
   - method
   - evidence
   - limitations
   - related papers
5. Use the citation picker to insert `[@bibkey]`.
6. Export `refs.bib` before drafting in LaTeX.

Quality checks:

- Every cited paper has a stable `bibkey`.
- `refs.bib` can be regenerated from Vault metadata.
- Notes link to related concepts with `[[wikilinks]]`.
- The research dashboard counts match the expected reading status.

## Workflow 2: Course and Reading Notes

Goal: connect lecture notes, books, and papers into one knowledge graph.

1. Create a subject per course or research theme.
2. Keep lecture notes in `<subject>/notes/`.
3. Add materials to `<subject>/materials/`.
4. Use Books for long-form reading progress.
5. Use backlinks to identify concept notes that are under-connected.
6. Compile or update Wiki pages only after source notes are stable.

Quality checks:

- Each subject has `_概要.md`.
- Important notes include tags and frontmatter.
- Generated Wiki pages link back to source notes.
- AI-generated content is reviewed before being treated as knowledge.

## Workflow 3: Experiment Tracking

Goal: keep enough context to understand and reproduce a result later.

Recommended experiment note frontmatter:

```yaml
---
type: experiment
title: "Short experiment name"
date: "2026-05-13"
status: running
dataset: "dataset-name@version"
model: "model-name"
code_commit: "git-sha"
seed: 42
tags: [reproducibility]
---
```

Recommended body:

```markdown
# Hypothesis

# Setup

- Dataset:
- Code commit:
- Environment:
- Hardware:
- Seed:

# Results

| Metric | Baseline | This run | Delta |
|---|---:|---:|---:|

# Interpretation

# Next action
```

Quality checks:

- Dataset version and code commit are recorded.
- Random seeds are recorded when relevant.
- Results are linked to the paper or hypothesis that motivated them.
- Failed experiments are kept if they prevent repeated mistakes.

## Workflow 4: Exporting for Writing

Goal: produce a writing-ready bundle without locking source notes into a hosted
system.

1. Keep Markdown source notes in the Vault.
2. Keep paper metadata in frontmatter.
3. Export BibTeX from Papers.
4. Export notes to LaTeX when needed.
5. Store generated outputs under `Outputs/`.

Quality checks:

- Exported files are reproducible from Vault files.
- Generated outputs do not replace the source Markdown.
- `refs.bib` is regenerated before submission.

## AI Use Policy for Research Notes

AI is optional. Treat generated output as draft assistance.

Recommended practice:

- Send only notes you intend to use with AI.
- Review summaries and tags before saving.
- Keep original source notes separate from generated interpretations.
- Prefer short scoped prompts for unpublished or sensitive work.
- Use `none` provider mode when external sending is not acceptable.

AI data flow is documented in [privacy.md](privacy.md) and
[threat-model.md](threat-model.md).

## Reproducibility Checklist

Before relying on a Vault for a paper, thesis chapter, or lab report:

- [ ] Settings -> `研究再現性` -> `再現性チェック` is acceptable for the project.
- [ ] Important notes have frontmatter and tags.
- [ ] Paper notes have stable citation keys.
- [ ] `refs.bib` exports successfully.
- [ ] Experiment notes include dataset, code commit, environment, and seed.
- [ ] Generated outputs can be rebuilt from source notes.
- [ ] Vault is backed up outside the app.
- [ ] Diagnostics export contains no note bodies when support is needed.

## Product Check

ClassNotes checks the following metadata in Settings -> `研究再現性`:

- Paper notes under `Papers/`, or with `type: paper` / `type: paper-note`,
  should have `bibkey`.
- Duplicate `bibkey` values are flagged.
- Citation keys like `[@smith2024]` or `@smith2024` should resolve to a paper
  note with the same `bibkey`.
- Experiment notes with `type: experiment`, or under `Experiments/` / `実験/`,
  should include `dataset`, `code_commit` or `commit`, `seed`, and
  `environment` or `env`.

The score is a local quality signal. It does not send Vault contents outside
the machine.
