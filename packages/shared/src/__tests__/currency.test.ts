import { describe, it, expect } from 'vitest';
import { formatEGP, formatUSD, formatCompact, egpToUsd } from '../utils/currency.js';

describe('formatEGP', () => {
  it('formats number with EGP prefix', () => {
    const result = formatEGP(1500000);
    expect(result).toContain('EGP');
    expect(result).toContain('1,500,000');
  });
});

describe('formatUSD', () => {
  it('formats number with $ prefix', () => {
    const result = formatUSD(50000);
    expect(result).toContain('$');
  });
});

describe('formatCompact', () => {
  it('formats millions', () => {
    expect(formatCompact(2500000)).toBe('2.5M');
  });

  it('formats thousands', () => {
    expect(formatCompact(150000)).toBe('150K');
  });

  it('returns plain number for small values', () => {
    expect(formatCompact(500)).toBe('500');
  });
});

describe('egpToUsd', () => {
  it('converts using default rate of 50', () => {
    const usd = egpToUsd(500000);
    expect(usd).toBe(10000);
  });
});
