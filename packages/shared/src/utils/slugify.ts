/**
 * Bilingual slug generation for Osool SEO pages.
 *
 * English: lowercased, transliterated Arabic chars, hyphens for spaces
 * Arabic: keeps Arabic Unicode range, hyphens for spaces, diacritics stripped
 */

const ARABIC_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g;

/** Generate a URL-safe English slug from any string. */
export function slugifyEn(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['']/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Generate a URL-safe Arabic slug, keeping Arabic chars. */
export function slugifyAr(input: string): string {
  return input
    .trim()
    .replace(ARABIC_DIACRITICS, '')
    .replace(/[\s_]+/g, '-')
    .replace(/[^\u0600-\u06FF\w-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Generate a comparison page slug from two developer names. */
export function comparisonSlug(devA: string, devB: string): string {
  const sorted = [slugifyEn(devA), slugifyEn(devB)].sort();
  return `${sorted[0]}-vs-${sorted[1]}`;
}

/** Generate location area page slug. */
export function locationAreaSlug(location: string, area?: string): string {
  const base = slugifyEn(location);
  return area ? `${base}-${slugifyEn(area)}` : base;
}
