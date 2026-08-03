import * as pdfjsLib from 'pdfjs-dist';
import { WorkerMessageHandler } from 'pdfjs-dist/build/pdf.worker.mjs';
import type { ExtractedResume } from './types';

// pdfjs v6 在 Chrome Extension MV3 中无法创建 Worker（CSP 限制）。
// 通过直接 import WorkerMessageHandler 并注入到 globalThis，
// 让 pdfjs 使用主线程解析，绕过 Worker 限制。
(globalThis as any).pdfjsWorker = { WorkerMessageHandler };

export async function extractPDFText(file: File): Promise<ExtractedResume> {
  const arrayBuffer = await file.arrayBuffer();

  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
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

  console.log(`[PDFExtractor] Extracted ${pdf.numPages} pages, ${text.length} chars`);
  if (text.length < 50) {
    console.warn('[PDFExtractor] Very short text extracted:', text);
  }

  return {
    text,
    pageCount: pdf.numPages,
  };
}
