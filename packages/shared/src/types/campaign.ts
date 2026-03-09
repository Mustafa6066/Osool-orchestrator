/** Ad channel. */
export type AdChannel = 'meta' | 'google' | 'linkedin' | 'whatsapp';

/** Campaign status. */
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';

/** Campaign objective. */
export type CampaignObjective =
  | 'awareness'
  | 'traffic'
  | 'leads'
  | 'conversions'
  | 'retargeting';

/** Ad campaign definition. */
export interface Campaign {
  id: string;
  name: string;
  channel: AdChannel;
  objective: CampaignObjective;
  status: CampaignStatus;
  budgetDaily: number;
  budgetTotal: number;
  currency: 'EGP' | 'USD';
  audienceId?: string;
  adCopy: {
    headline: string;
    headlineAr?: string;
    body: string;
    bodyAr?: string;
    ctaText: string;
    ctaUrl: string;
    imageUrl?: string;
  };
  targeting: {
    locations: string[];
    segments: string[];
    interests: string[];
    lookalikes: boolean;
  };
  metrics: CampaignMetrics;
  startDate: Date;
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** Campaign performance metrics. */
export interface CampaignMetrics {
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  spend: number;
  conversions: number;
  costPerConversion: number;
  roas: number;
}

/** Budget allocation across channels. */
export interface BudgetAllocation {
  meta: number;
  google: number;
  linkedin: number;
  whatsapp: number;
}

/** Retargeting audience built from intent data. */
export interface RetargetingAudience {
  id: string;
  name: string;
  description: string;
  rules: AudienceRule[];
  size: number;
  channels: AdChannel[];
  externalIds: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

/** Audience segmentation rule. */
export interface AudienceRule {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'in';
  value: string | number | string[];
}
