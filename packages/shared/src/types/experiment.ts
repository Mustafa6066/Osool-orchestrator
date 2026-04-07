/** Experiment-related types used across the orchestrator. */

export type ExperimentStatus = 'running' | 'trending' | 'keep' | 'discard';
export type ExperimentAgent = 'seo' | 'email' | 'chat' | 'ads';

export interface ExperimentVariant {
  name: string;
  config: Record<string, unknown>;
}

export interface ExperimentDataPoint {
  variant: string;
  metric: string;
  value: number;
  ts: string;
}

export interface ExperimentResult {
  pValue: number;
  liftPercent: number;
  liftCILower: number;
  liftCIUpper: number;
  mannWhitneyU: number;
  significant: boolean;
  scoredAt: string;
}

export interface PlaybookEntry {
  variable: string;
  bestPractice: string;
  liftPercent: number;
  confidence: number;
  adoptedAt: string;
}

export interface ExperimentSuggestion {
  agent: ExperimentAgent;
  variable: string;
  hypothesis: string;
  variants: ExperimentVariant[];
  rationale: string;
}
