# Architecture Decision Records

Short, single-page documents capturing non-obvious technical decisions and
their rationale. Format: Michael Nygard's classic ADR template (Context →
Decision → Consequences).

| # | Title | Status |
|---|---|---|
| [001](001-context-bridge-frozen.md) | `contextBridge` exposed objects are frozen | Accepted |
| [002](002-pdf-jump-signal.md) | PDF page-jump uses a `{ page, seq }` signal | Accepted |
| [003](003-docai-chunker-vs-pdf-direct.md) | DocAI: chunker pipeline vs PDF direct-attach | Accepted |

## When to add an ADR

Add an ADR when:
- A decision is **non-obvious** (the next maintainer will wonder why)
- A decision **rules out** alternatives that look attractive
- An invariant **must be maintained** for security or correctness
- A decision was made after a **failed attempt** or surprising discovery

Don't add an ADR for:
- Routine bug fixes
- Style/format changes
- Choices well-documented in the file's header comment
