/**
 * Browser PDF -> text, for the "drop the OFP PDF" flow. Runs pdf.js in the phone
 * WebView (the same library and line-reconstruction the CLI uses), so the OFP is
 * read on-device with no upload. Imported dynamically so pdf.js only loads when
 * a PDF is actually dropped.
 */
import * as pdfjs from 'pdfjs-dist';
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker&inline';

// Inline the worker as a Blob-backed module worker instead of pointing pdf.js at
// a worker URL. A packaged .ehpk is served by the Even WebView's own file
// server, which returns .mjs as text/plain; pdf.js then fails to start the
// worker ("text/plain is not a valid JavaScript MIME type"). An inlined Blob
// worker carries the correct type and needs no fetch, so it works offline.
pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();

/** Extract text from a PDF, reassembling lines from item Y positions. */
export async function pdfToText(data: ArrayBuffer): Promise<string> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    for (const it of content.items) {
      if (!('str' in it)) continue; // skip marked-content items
      const y = it.transform[5];
      if (lastY != null && Math.abs(y - lastY) > 2) text += '\n';
      text += it.str + (it.hasEOL ? '\n' : ' ');
      lastY = y;
    }
    text += '\n';
  }
  return text;
}
