import type { ExtractedResume } from './types';

// Lazy import pdfjs to avoid blocking popup render if module init fails
export async function extractPDFText(file: File): Promise<ExtractedResume> {
  const pdfjsLib = await import('pdfjs-dist');

  // For Chrome Extension MV3: use the bundled worker via inline workerSrc
  // Setting to empty string + using the legacy build avoids the Worker CSP issue
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    // Point to the worker file bundled alongside our extension
    // The worker will be fetched as a same-origin module
    const workerUrl = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url
    ).href;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  }

  const arrayBuffer = await file.arrayBuffer();

  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({
      data: arrayBuffer,
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;
  } catch (err) {
    // If worker fails (CSP), retry with worker disabled
    console.warn('[PDFExtractor] Worker failed, retrying without worker:', err);
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    pdf = await pdfjsLib.getDocument({
      data: arrayBuffer,
      isEvalSupported: false,
      useSystemFonts: true,
    }).promise;
  }

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => 'str' in item ? item.str : '')
      .join(' ');
    pages.push(pageText);
  }

  const text = pages.join('\n').trim();

  console.log(`[PDFExtractor] Extracted ${pdf.numPages} pages, ${text.length} chars`);
  if (text.length < 50) {
    console.warn('[PDFExtractor] Very short text extracted:', text);
  }

  return {
    text,
    pageCount: pdf.numPages,
  };
}
