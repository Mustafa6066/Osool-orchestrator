/** CRO audit types used across the orchestrator. */

export type CROPageType = 'property_listing' | 'area_guide' | 'developer_profile' | 'comparison' | 'roi_analysis';

export interface CRODimensionScores {
  headlineClarity: number;
  ctaVisibility: number;
  socialProof: number;
  urgency: number;
  trustSignals: number;
  formFriction: number;
  mobileResponsiveness: number;
  pageSpeed: number;
}

export interface CROFinding {
  dimension: string;
  score: number;
  issues: string[];
  recommendations: string[];
}

export interface CROFix {
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  dimension: string;
  description: string;
  expectedLift: string;
}

export interface CROAuditResult {
  url: string;
  pageType: CROPageType;
  overallScore: number;
  dimensionScores: CRODimensionScores;
  findings: CROFinding[];
  fixes: CROFix[];
}
