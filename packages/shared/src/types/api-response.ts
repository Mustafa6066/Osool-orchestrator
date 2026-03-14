/**
 * API response types — structures the Orchestrator sends back to the Osool frontend.
 * These are the typed JSON bodies returned by the /data/* endpoints.
 */

import type { Developer, LocationROI, Project } from './property.js';
import type { ICPSegment } from './icp.js';
import type { IntentSignal } from './intent.js';

/** GET /data/comparison/:devA/:devB */
export interface ComparisonDataResponse {
  developerA: DeveloperProfile;
  developerB: DeveloperProfile;
  comparison: {
    deliveryScore: { a: number; b: number };
    avgPricePerMeter: { a: number; b: number; currency: 'EGP' };
    paymentFlexibility: { a: number; b: number };
    resaleRetention: { a: number; b: number };
    communityScore: { a: number; b: number };
  };
  generatedCopy?: {
    summaryEn: string;
    summaryAr: string;
    seoTitle: string;
    seoDescription: string;
  };
  lastUpdated: string;
}

export interface DeveloperProfile {
  id: string;
  name: string;
  nameAr: string;
  slug: string;
  tier: 'premium' | 'mid_market' | 'budget';
  founded?: number;
  projectCount: number;
  avgDeliveryRatePercent: number;
  avgPricePerSqm: number;
  regions: string[];
}

export interface LocationProfile {
  location: string;
  locationAr: string;
  slug: string;
  region: string;
  avgPricePerSqm: number;
  rentalYieldPercent: number;
  liquidityScore: number;
}

export interface ProjectSummary {
  id: string;
  slug: string;
  name: string;
  nameAr: string;
  developerId: string;
  location: string;
  minPrice: number;
  maxPrice: number;
  avgPricePerSqm: number;
  currency: 'EGP' | 'USD';
  deliveryStatus: string;
}

/** GET /data/roi/:location */
export interface ROITrackerResponse {
  location: LocationProfile;
  pricePerMeterHistory: { date: string; value: number }[];
  predictedGrowth: { '1yr': number; '3yr': number; '5yr': number };
  rentalYield: number;
  liquidityScore: number;
  topProjects: ProjectSummary[];
  generatedCopy?: {
    analysisEn: string;
    analysisAr: string;
    seoTitle: string;
    seoDescription: string;
  };
  lastUpdated: string;
}

/** GET /data/project/:slug */
export interface ProjectDataResponse {
  project: Project;
  developer: Developer;
  priceHistory: { date: string; value: number }[];
  nearbyProjects: ProjectSummary[];
  generatedCopy?: {
    descriptionEn: string;
    descriptionAr: string;
    seoTitle: string;
    seoDescription: string;
  };
  lastUpdated: string;
}

/** GET /data/chat-context/:sessionId */
export interface ChatContextResponse {
  leadScore: number;
  segment: ICPSegment;
  previousIntents: IntentSignal[];
  suggestedTopics: string[];
  personalizationHints: {
    preferredAreas: string[];
    preferredDevelopers: string[];
    budgetRange?: { min: number; max: number };
    interactionCount: number;
  };
}

/** GET /data/trending */
export interface TrendingResponse {
  trendingDevelopers: { name: string; mentionCount: number; trend: 'up' | 'down' | 'stable' }[];
  trendingLocations: { name: string; mentionCount: number; trend: 'up' | 'down' | 'stable' }[];
  trendingQueries: { query: string; count: number }[];
  period: '24h' | '7d' | '30d';
}

/** GET /data/seo-content/:pageType/:slug */
export interface SEOContentResponse {
  pageType: 'comparison' | 'roi' | 'project' | 'guide';
  slug: string;
  locale: 'en' | 'ar';
  title: string;
  description: string;
  body: string;
  schemaMarkup?: Record<string, unknown>;
  generatedAt: string;
  version: number;
}

/** Admin: GET /admin/dashboard */
export interface DashboardResponse {
  system: {
    apiUptime: string;
    dbStatus: 'healthy' | 'degraded' | 'down';
    redisStatus: 'healthy' | 'degraded' | 'down';
    queueDepth: number;
    lastAgentRun: Record<string, string>;
  };
  metrics: {
    totalUsers: number;
    totalChatSessions: number;
    totalIntentSignals: number;
    totalSEOPages: number;
    waitlistCount: number;
    today: {
      newUsers: number;
      chatSessions: number;
      intentSignals: number;
      emailsSent: number;
      waitlistJoins: number;
    };
  };
  funnel: {
    discover: number;
    engage: number;
    qualify: number;
    convert: number;
    retain: number;
  };
  topTrending: {
    developers: { name: string; count: number }[];
    locations: { name: string; count: number }[];
  };
}
