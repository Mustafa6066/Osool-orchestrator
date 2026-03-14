import { describe, it, expect } from 'vitest';
import { calculateLeadScore } from '../utils/scoring.js';
import type { LeadScoringInput } from '../utils/scoring.js';

describe('calculateLeadScore', () => {
  it('returns 0 for minimal input', () => {
    const input: LeadScoringInput = {
      chatMessageCount: 0,
      budgetDisclosed: false,
      areaPreferenceSet: false,
      developersComparedCount: 0,
      pagesVisited: 0,
      emailCaptured: false,
      lastActiveAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    };
    const score = calculateLeadScore(input);
    expect(score.total).toBe(0);
    expect(score.qualifiedForEmail).toBe(false);
    expect(score.qualifiedForWaitlist).toBe(false);
  });

  it('scores high for engaged leads', () => {
    const input: LeadScoringInput = {
      chatMessageCount: 10,
      budgetDisclosed: true,
      budgetAmount: 5_000_000,
      areaPreferenceSet: true,
      developersComparedCount: 3,
      pagesVisited: 6,
      emailCaptured: true,
      lastActiveAt: new Date(),
    };
    const score = calculateLeadScore(input);
    expect(score.total).toBeGreaterThan(80);
    expect(score.qualifiedForWaitlist).toBe(true);
  });

  it('qualifies for email at 60+', () => {
    const input: LeadScoringInput = {
      chatMessageCount: 5,
      budgetDisclosed: true,
      areaPreferenceSet: true,
      developersComparedCount: 1,
      pagesVisited: 3,
      emailCaptured: false,
      lastActiveAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
    };
    const score = calculateLeadScore(input);
    expect(score.qualifiedForEmail).toBe(score.total >= 60);
  });

  it('caps each dimension', () => {
    const input: LeadScoringInput = {
      chatMessageCount: 100,
      budgetDisclosed: true,
      budgetAmount: 100_000_000,
      areaPreferenceSet: true,
      developersComparedCount: 50,
      pagesVisited: 100,
      emailCaptured: true,
      lastActiveAt: new Date(),
    };
    const score = calculateLeadScore(input);
    expect(score.total).toBeLessThanOrEqual(100);
  });
});
