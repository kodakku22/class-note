# ADR 003 — DocAI: chunker pipeline vs PDF direct-attach

**Status**: Accepted — Wave 1 design decision.

## Context

LLM providers exposed by `electron/ai/provider.ts` can ingest PDF in two ways:

1. **Direct attach** — Pass `documents: [{ base64, mediaType: 'application/pdf' }]`
   to `runPrompt`. Supported by Anthropic / OpenAI / Gemini API key paths.
   The model handles OCR / layout itself.
2. **Extracted text** — Run `extractPdfTextFromBuffer` (pdfjs-dist) locally,
   pass `## Page N\n...` chunks through `chunker.ts` → `context-retriever.ts`,
   prompt the model with the relevant chunks.

The DocAI suite needs to support both — they have different trade-offs.

## Decision

| Path | When | Why |
|---|---|---|
| **Chunker pipeline** (default) | Always: text PDFs, Markdown notes, books | Local-first, deterministic citations with page numbers, no provider lock-in, smaller prompts (cheaper) |
| **Direct attach** (fallback) | Scan-only PDF (`imageOnlyPdfError()` returned) AND user is on API key path | Vision-capable model can read scanned pages; required for unstructured PDFs |

The dispatch is in `electron/ipc/docai.ts → readChunkableDocument()`:
- Try `extractPdfTextFromBuffer`
- If text comes back empty → return `imageOnlyPdfError`
- The caller currently surfaces this as an error; future Wave 2+ work will
  add the direct-attach fallback when `authMode === 'api-key'`.

CLI login paths (`claude` / `codex` CLI) **cannot** attach documents
(provider.ts guards against this with an explicit error message), so for
scan-only PDFs the user must switch to API key auth.

## Consequences

- All DocAI citations get accurate `pageNumber: N` because they always come
  from the local chunker (page granularity from `## Page N` markers).
- Multi-doc Q&A (`docai:askMulti`) ONLY uses the chunker path — direct attach
  is single-doc only by current provider APIs.
- Document size is checked via `docaiMaxFileSizeMB` (default 50MB) before
  either path runs, preventing OOM on huge PDFs.
- If we add Embedding-based retrieval later, the chunker pipeline is the
  natural integration point (replace `context-retriever.ts`'s scoring fn).
