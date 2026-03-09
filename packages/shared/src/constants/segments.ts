import type { ICPSegmentProfile } from '../types/icp.js';

/** Full ICP segment definitions for Osool's market. */
export const ICP_SEGMENTS: ICPSegmentProfile[] = [
  {
    segment: 'expat_investor',
    label: 'Expat Investor',
    labelAr: 'مستثمر مغترب',
    description: 'Egyptian expats in the Gulf, Europe, or US investing remotely in Egyptian real estate.',
    budgetRange: { min: 3_000_000, max: 20_000_000, currency: 'EGP' },
    preferredLocations: ['new-capital', 'new-cairo', 'north-coast', 'ras-el-hikma'],
    investmentGoal: 'capital_appreciation',
    riskTolerance: 'medium',
    decisionTimeline: '3_months',
  },
  {
    segment: 'domestic_hnw',
    label: 'Domestic High Net Worth',
    labelAr: 'أثرياء محليون',
    description: 'High-income Egyptian professionals and business owners seeking premium properties.',
    budgetRange: { min: 5_000_000, max: 50_000_000, currency: 'EGP' },
    preferredLocations: ['new-cairo', 'sheikh-zayed', 'north-coast', 'ras-el-hikma'],
    investmentGoal: 'portfolio_diversification',
    riskTolerance: 'high',
    decisionTimeline: 'immediate',
  },
  {
    segment: 'first_time_buyer',
    label: 'First-Time Buyer',
    labelAr: 'مشتري لأول مرة',
    description: 'Young professionals (25-35) buying their first apartment, typically for marriage.',
    budgetRange: { min: 1_500_000, max: 5_000_000, currency: 'EGP' },
    preferredLocations: ['6th-october', 'shorouk', 'new-capital-r5', 'mostakbal-city'],
    investmentGoal: 'primary_residence',
    riskTolerance: 'low',
    decisionTimeline: '6_months',
  },
  {
    segment: 'institutional',
    label: 'Institutional Buyer',
    labelAr: 'مشتري مؤسسي',
    description: 'Investment funds, family offices, and corporate buyers looking for bulk deals.',
    budgetRange: { min: 50_000_000, max: 500_000_000, currency: 'EGP' },
    preferredLocations: ['new-capital', 'new-alamein', 'new-cairo'],
    investmentGoal: 'portfolio_diversification',
    riskTolerance: 'high',
    decisionTimeline: '12_months',
  },
];

/** Get ICP segment profile by segment type. */
export function getSegmentProfile(segment: string): ICPSegmentProfile | undefined {
  return ICP_SEGMENTS.find((s) => s.segment === segment);
}
