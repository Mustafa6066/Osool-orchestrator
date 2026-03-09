import type { ICPSegment } from './icp.js';

/** Funnel stage in the user journey. */
export type FunnelStage =
  | 'discover'
  | 'engage'
  | 'qualify'
  | 'convert'
  | 'retain';

/** Individual funnel event. */
export interface FunnelEvent {
  id: string;
  userId?: string;
  sessionId: string;
  stage: FunnelStage;
  action: string;
  metadata: Record<string, unknown>;
  source: 'chat' | 'seo_page' | 'ad_click' | 'email' | 'whatsapp' | 'direct';
  timestamp: Date;
}

/** Lead profile with qualification score. */
export interface LeadProfile {
  userId: string;
  score: number;
  segment: ICPSegment;
  budgetRange?: { min: number; max: number };
  preferredAreas: string[];
  preferredDevelopers: string[];
  investmentTimeline?: 'immediate' | '3_months' | '6_months' | '12_months';
  chatMessageCount: number;
  pagesVisited: string[];
  emailCaptured: boolean;
  premiumWaitlist: boolean;
  lastActivity: Date;
}

/** Feedback loop types connecting system components. */
export type FeedbackLoopType =
  | 'chat_to_seo'
  | 'chat_to_ads'
  | 'seo_to_chat'
  | 'ads_to_seo';

/** Feedback loop execution record. */
export interface FeedbackLoopEvent {
  id: string;
  loopType: FeedbackLoopType;
  trigger: string;
  action: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  metadata: Record<string, unknown>;
  createdAt: Date;
  completedAt?: Date;
}

/** Email sequence definition. */
export interface EmailSequence {
  id: string;
  name: string;
  triggerCondition: string;
  steps: EmailStep[];
  active: boolean;
}

/** Individual email step in a sequence. */
export interface EmailStep {
  order: number;
  delayDays: number;
  subject: string;
  subjectAr?: string;
  templateId: string;
  ctaType: 'roi_report' | 'content_piece' | 'premium_invite';
}

/** Waitlist entry. */
export interface WaitlistEntry {
  id: string;
  userId: string;
  email: string;
  name: string;
  segment: ICPSegment;
  leadScore: number;
  source: string;
  createdAt: Date;
}
