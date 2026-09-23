import type { DOMField } from '../types';

/**
 * Site adapters are intentionally separate from component adapters. Add one
 * only after a confirmed Moka/Beisen/Nowcoder behavior cannot be handled by a
 * component adapter.
 */
export interface SiteAdapter {
  canHandle(url: string): boolean;
  enhanceField(field: DOMField): DOMField;
}

export function getSiteAdapter(_url: string): SiteAdapter | null {
  return null;
}
