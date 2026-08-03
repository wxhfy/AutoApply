import * as pdfjsLib from 'pdfjs-dist';
import type { ExtractedResume } from './types';

// Chrome Extension MV3 CSP 限制 Worker 加载，禁用 worker 使用主线程解析。
// 简历 PDF 一般 1-3 页，性能完全没问题。
pdfjsLib.GlobalWorkerOptions.workerSrc = '';

export async function extractPDFText(file: File): Promise<ExtractedResume> {
  const arrayBuffer = await file.arrayBuffer();

  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    useWorkerFetch: false,
    useSystemFonts: true,
  }).promise;

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

  // Debug: log extracted text length in devtools console
  console.log(`[PDFExtractor] Extracted ${pdf.numPages} pages, ${text.length} chars`);
  if (text.length < 50) {
    console.warn('[PDFExtractor] Very short text extracted:', text);
  }

  return {
    text,
    pageCount: pdf.numPages,
  };
}
