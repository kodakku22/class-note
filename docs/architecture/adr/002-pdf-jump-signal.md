# ADR 002 — PDF page-jump uses a `{ page, seq }` signal, not a bare number

**Status**: Accepted — Phase 2-C.

## Context

When a DocAI citation badge for `Page 5` is clicked twice in a row, the
PDFViewer should re-snap to page 5 the second time too (the user might have
scrolled away). The original implementation passed a bare `requestedPage: number`
prop and used a fractional bump hack:

```ts
setPdfRequestedPage((prev) => (prev === target ? target + 0.0001 : target));
```

This worked by accident: `Math.floor(5.0001)` is 5, but React saw the prop
change and re-ran the effect. Brittle, undocumented, and lost the original
target's integer identity.

## Decision

Adopt a signal pattern with two fields:

```ts
type PdfPageSignal = { page: number; seq: number };

// Viewer side: bump seq on every request
setPageSignal((prev) => ({ page: target, seq: (prev?.seq ?? 0) + 1 }));

// PDFViewer side: effect keys off seq, not page
useEffect(() => {
  if (!requestedPageSignal) return;
  setPage(Math.min(numPages, requestedPageSignal.page));
}, [requestedPageSignal?.seq, requestedPageSignal?.page, numPages]);
```

The dependency on `page` and `numPages` is intentional: handles the
"signal arrived before doc loaded" case (re-clamp once `numPages` becomes
known).

The legacy `requestedPage?: number` prop is kept for backwards-compat with
any caller that hasn't migrated; the two effects coexist.

## Consequences

- No more 0.0001 bumps in the code; integer page numbers throughout.
- `PdfPageSignal` type exported from `PDFViewer.tsx` for callers.
- 4 new tests in `tests/components/PDFViewer.signal.test.tsx` cover the
  re-trigger and clamp-on-load behaviour.
- Future imperative re-trigger patterns (e.g. "scroll to anchor again")
  should follow the same signal pattern.
