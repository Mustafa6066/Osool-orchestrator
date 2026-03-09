/** ICP segment classification for Osool's Egyptian real estate audience. */
export type ICPSegment =
  | 'expat_investor'
  | 'domestic_hnw'
  | 'first_time_buyer'
  | 'institutional';

/** Full ICP segment profile with targeting parameters. */
export interface ICPSegmentProfile {
  segment: ICPSegment;
  label: string;
  labelAr: string;
  description: string;
  budgetRange: { min: number; max: number; currency: 'EGP' | 'USD' };
  preferredLocations: string[];
  investmentGoal: 'capital_appreciation' | 'rental_income' | 'primary_residence' | 'portfolio_diversification';
  riskTolerance: 'low' | 'medium' | 'high';
  decisionTimeline: 'immediate' | '3_months' | '6_months' | '12_months';
}
