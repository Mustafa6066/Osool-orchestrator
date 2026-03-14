import { describe, it, expect } from 'vitest';
import { slugifyEn, slugifyAr, comparisonSlug } from '../utils/slugify.js';

describe('slugifyEn', () => {
  it('converts to lowercase kebab-case', () => {
    expect(slugifyEn('Emaar Misr')).toBe('emaar-misr');
  });

  it('removes special characters', () => {
    expect(slugifyEn('Palm Hills — Developments!')).toBe('palm-hills-developments');
  });

  it('trims leading/trailing dashes', () => {
    expect(slugifyEn(' Hello World ')).toBe('hello-world');
  });
});

describe('slugifyAr', () => {
  it('handles Arabic text', () => {
    const result = slugifyAr('القاهرة الجديدة');
    expect(result).toBeTruthy();
    expect(result).not.toContain(' ');
  });
});

describe('comparisonSlug', () => {
  it('creates sorted comparison slug', () => {
    const slug = comparisonSlug('SODIC', 'Emaar Misr');
    expect(slug).toBe('emaar-misr-vs-sodic');
  });

  it('is deterministic regardless of order', () => {
    expect(comparisonSlug('A', 'B')).toBe(comparisonSlug('B', 'A'));
  });
});
