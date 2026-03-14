import type { ICPSegment } from './icp.js';

/** Classification of user intent from chat or page interaction. */
export type IntentType =
  | 'comparison'
  | 'roi_inquiry'
  | 'price_check'
  | 'developer_review'
  | 'area_research'
  | 'payment_plan'
  | 'general';

/** Parsed entities extracted from a user query. */
export interface IntentEntities {
  developers?: string[];
  locations?: string[];
  projects?: string[];
  priceRange?: { min: number; max: number; currency: 'EGP' | 'USD' };
}

/** Structured intent signal logged from every user interaction. */
export interface IntentSignal {
  id: string;
  sessionId: string;
  userId?: string;
  timestamp: Date;
  intentType: IntentType;
  entities: IntentEntities;
  rawQuery: string;
  confidence: number;
  segment: ICPSegment;
  source: 'chat' | 'seo_page' | 'ad_click';
  utmParams?: Record<string, string>;
}

/** Aggregated intent summary for trending topic detection. */
export interface IntentAggregation {
  entity: string;
  entityType: 'developer' | 'location' | 'project' | 'keyword';
  count: number;
  uniqueUsers: number;
  avgConfidence: number;
  dominantSegment: ICPSegment;
  period: { start: Date; end: Date };
  hasExistingSeoPage: boolean;
}
