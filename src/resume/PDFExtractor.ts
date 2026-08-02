import * as pdfjsLib from 'pdfjs-dist';
import type { ExtractedResume } from './types';

// Tell pdfjs to use the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export async function extractPDFText(file: File): Promise<ExtractedResume> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item) => 'str' in item ? item.str : '')
      .join(' ');
    pages.push(pageText);
  }

  return {
    text: pages.join('\n').trim(),
    pageCount: pdf.numPages,
  };
}
