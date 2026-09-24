import type { DOMField } from '../types';
import { guopinSiteAdapter } from './GuopinAdapter.ts';

export interface SiteFillResult {
  success: boolean;
  reason?: string;
}

/**
 * Site adapters are intentionally separate from component adapters. Add one
 * only after a confirmed Moka/Beisen/Nowcoder behavior cannot be handled by a
 * component adapter.
 */
export interface SiteAdapter {
  canHandle(url: string): boolean;
  canFill(field: DOMField, element: HTMLElement): boolean;
  fill(field: DOMField, element: HTMLElement, value: string): Promise<SiteFillResult>;
}

const SITE_ADAPTERS: SiteAdapter[] = [guopinSiteAdapter];

export function getSiteAdapter(url: string): SiteAdapter | null {
  return SITE_ADAPTERS.find(adapter => adapter.canHandle(url)) || null;
}
