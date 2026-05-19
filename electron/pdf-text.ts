export type PdfTextExtraction = {
  text: string;
  pageCount: number;
};

export async function extractPdfTextFromBuffer(buffer: Buffer): Promise<PdfTextExtraction> {
  const pdfjs = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as {
    getDocument: (options: Record<string, unknown>) => {
      promise: Promise<{
        numPages: number;
        getPage: (pageNumber: number) => Promise<{
          getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
        }>;
      }>;
    };
  };
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const doc = await loadingTask.promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => (typeof item.str === 'string' ? item.str : ''))
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text) pages.push(`## Page ${pageNumber}\n${text}`);
  }
  return { text: pages.join('\n\n'), pageCount: doc.numPages };
}

export function imageOnlyPdfError(): string {
  return '画像のみ、またはテキスト抽出できない PDF です。ログイン方式では処理できないため、API キー方式に切り替えてください。';
}
