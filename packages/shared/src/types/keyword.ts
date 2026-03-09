import type { IntentType } from './intent.js';

/** Core keyword entity for SEO tracking. */
export interface Keyword {
  id: string;
  keyword: string;
  keywordAr?: string;
  searchVolume: number;
  difficulty: number;
  cpc?: number;
  intentType: IntentType;
  relatedDevelopers: string[];
  relatedLocations: string[];
  lastUpdated: Date;
  trending: boolean;
}

/** Keyword cluster for topic-based content planning. */
export interface KeywordCluster {
  id: string;
  name: string;
  primaryKeyword: string;
  relatedKeywords: string[];
  totalVolume: number;
  contentGap: boolean;
  assignedPageId?: string;
}

/** Search console performance data for a keyword. */
export interface KeywordPerformance {
  keywordId: string;
  impressions: number;
  clicks: number;
  ctr: number;
  avgPosition: number;
  period: { start: Date; end: Date };
}
