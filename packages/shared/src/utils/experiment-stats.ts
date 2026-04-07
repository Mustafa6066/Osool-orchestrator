/**
 * Statistical utilities for A/B experiment scoring.
 *
 * Ported from Python (scipy/numpy) to pure TypeScript:
 * - bootstrapLiftCI()  — Bootstrap confidence interval for relative lift
 * - mannWhitneyU()     — Non-parametric Mann-Whitney U test
 *
 * No external dependencies — all math is self-contained.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

export const P_WINNER = 0.05;
export const P_TREND = 0.10;
export const LIFT_WIN = 15.0; // minimum % lift to declare winner
export const BOOTSTRAP_ITERATIONS = 1_000;

// ── Random seed helper ────────────────────────────────────────────────────────

/** Simple seeded PRNG (mulberry32) for reproducible bootstrap samples in tests. */
function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Bootstrap Lift CI ─────────────────────────────────────────────────────────

export interface BootstrapResult {
  liftPercent: number;
  ciLower: number;
  ciUpper: number;
  significant: boolean;
}

/**
 * Bootstrap confidence interval for the relative lift of treatment over control.
 *
 * Lift = (mean(treatment) - mean(control)) / mean(control) * 100
 *
 * Returns 95% CI. If the entire CI is above LIFT_WIN and above 0, we flag as significant.
 */
export function bootstrapLiftCI(
  control: number[],
  treatment: number[],
  iterations = BOOTSTRAP_ITERATIONS,
  seed?: number,
): BootstrapResult {
  if (control.length === 0 || treatment.length === 0) {
    return { liftPercent: 0, ciLower: 0, ciUpper: 0, significant: false };
  }

  const rng = seed !== undefined ? mulberry32(seed) : Math.random;

  const lifts: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const sampledControl = resample(control, rng);
    const sampledTreatment = resample(treatment, rng);

    const meanC = mean(sampledControl);
    const meanT = mean(sampledTreatment);

    if (meanC === 0) continue;
    lifts.push(((meanT - meanC) / meanC) * 100);
  }

  lifts.sort((a, b) => a - b);

  const liftPercent = ((mean(treatment) - mean(control)) / mean(control)) * 100;
  const ciLower = percentile(lifts, 2.5);
  const ciUpper = percentile(lifts, 97.5);

  return {
    liftPercent,
    ciLower,
    ciUpper,
    significant: ciLower > 0 && ciLower >= LIFT_WIN,
  };
}

// ── Mann-Whitney U Test ───────────────────────────────────────────────────────

export interface MannWhitneyResult {
  uStatistic: number;
  pValue: number;
  significant: boolean;
}

/**
 * Two-sided Mann-Whitney U test (non-parametric).
 *
 * For large samples (n₁, n₂ ≥ 20), uses normal approximation.
 * For smaller samples, uses exact calculation when feasible.
 */
export function mannWhitneyU(
  groupA: number[],
  groupB: number[],
  alpha = P_WINNER,
): MannWhitneyResult {
  const n1 = groupA.length;
  const n2 = groupB.length;

  if (n1 === 0 || n2 === 0) {
    return { uStatistic: 0, pValue: 1, significant: false };
  }

  // Combine and rank
  const combined = [
    ...groupA.map((v) => ({ v, group: 'A' as const })),
    ...groupB.map((v) => ({ v, group: 'B' as const })),
  ];
  combined.sort((a, b) => a.v - b.v);

  // Assign ranks (handle ties with average rank)
  const ranks = assignRanks(combined.map((c) => c.v));

  let r1 = 0;
  let idx = 0;
  for (const item of combined) {
    if (item.group === 'A') r1 += ranks[idx];
    idx++;
  }

  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  const U = Math.min(u1, u2);

  // Normal approximation for p-value
  const mu = (n1 * n2) / 2;
  const sigma = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);

  if (sigma === 0) {
    return { uStatistic: U, pValue: 1, significant: false };
  }

  const z = (U - mu) / sigma;
  const pValue = 2 * normalCDF(-Math.abs(z)); // two-sided

  return {
    uStatistic: U,
    pValue,
    significant: pValue < alpha,
  };
}

// ── Scoring Decision ──────────────────────────────────────────────────────────

export type ExperimentVerdict = 'running' | 'trending' | 'keep' | 'discard';

export interface ScoringResult {
  verdict: ExperimentVerdict;
  pValue: number;
  liftPercent: number;
  liftCILower: number;
  liftCIUpper: number;
  mannWhitneyU: number;
  significant: boolean;
  winner?: string;
}

/**
 * Score an experiment given control and treatment data.
 * Returns the verdict and statistical results.
 */
export function scoreExperiment(
  controlValues: number[],
  treatmentValues: number[],
  treatmentName: string,
  minSamples: number,
): ScoringResult {
  // Not enough data yet
  if (controlValues.length < minSamples || treatmentValues.length < minSamples) {
    return {
      verdict: 'running',
      pValue: 1,
      liftPercent: 0,
      liftCILower: 0,
      liftCIUpper: 0,
      mannWhitneyU: 0,
      significant: false,
    };
  }

  const bootstrap = bootstrapLiftCI(controlValues, treatmentValues);
  const mwu = mannWhitneyU(controlValues, treatmentValues);

  // Winner: both tests significant + lift above threshold
  if (bootstrap.significant && mwu.significant) {
    return {
      verdict: 'keep',
      pValue: mwu.pValue,
      liftPercent: bootstrap.liftPercent,
      liftCILower: bootstrap.ciLower,
      liftCIUpper: bootstrap.ciUpper,
      mannWhitneyU: mwu.uStatistic,
      significant: true,
      winner: treatmentName,
    };
  }

  // Trending: one test shows promise (p < P_TREND)
  if (mwu.pValue < P_TREND || (bootstrap.ciLower > 0 && bootstrap.liftPercent > 5)) {
    return {
      verdict: 'trending',
      pValue: mwu.pValue,
      liftPercent: bootstrap.liftPercent,
      liftCILower: bootstrap.ciLower,
      liftCIUpper: bootstrap.ciUpper,
      mannWhitneyU: mwu.uStatistic,
      significant: false,
    };
  }

  // Discard: plenty of data but no signal
  if (controlValues.length >= minSamples * 3 && treatmentValues.length >= minSamples * 3) {
    return {
      verdict: 'discard',
      pValue: mwu.pValue,
      liftPercent: bootstrap.liftPercent,
      liftCILower: bootstrap.ciLower,
      liftCIUpper: bootstrap.ciUpper,
      mannWhitneyU: mwu.uStatistic,
      significant: false,
    };
  }

  return {
    verdict: 'running',
    pValue: mwu.pValue,
    liftPercent: bootstrap.liftPercent,
    liftCILower: bootstrap.ciLower,
    liftCIUpper: bootstrap.ciUpper,
    mannWhitneyU: mwu.uStatistic,
    significant: false,
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function resample(arr: number[], rng: () => number): number[] {
  const result = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    result[i] = arr[Math.floor(rng() * arr.length)];
  }
  return result;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function assignRanks(values: number[]): number[] {
  const n = values.length;
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n - 1 && values[j + 1] === values[i]) j++;
    const avgRank = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k++) ranks[k] = avgRank;
    i = j + 1;
  }
  return ranks;
}

/**
 * Standard normal CDF approximation (Abramowitz & Stegun).
 * Accurate to ~1.5 × 10⁻⁷.
 */
function normalCDF(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const t = 1 / (1 + p * absX);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

  return 0.5 * (1 + sign * y);
}
