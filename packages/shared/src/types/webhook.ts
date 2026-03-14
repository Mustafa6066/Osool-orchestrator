/**
 * Webhook payload types — structures the existing Osool frontend sends to the Orchestrator.
 * These are POST bodies for each webhook endpoint.
 */

/** Sent on every AI chat message (both user and assistant turns) */
export interface ChatMessageWebhook {
  eventType: 'chat_message';
  sessionId: string;
  userId?: string;
  anonymousId: string;
  message: {
    role: 'user' | 'assistant';
    content: string;
    timestamp: string; // ISO 8601
  };
  pageContext: {
    url: string;
    pageType: 'landing' | 'comparison' | 'roi' | 'project' | 'guide' | 'chat' | 'other';
    locale: 'en' | 'ar';
  };
  utmParams?: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
    term?: string;
  };
}

/** Sent when a chat session ends (user closes chat or navigates away) */
export interface ChatSessionEndWebhook {
  eventType: 'chat_session_end';
  sessionId: string;
  userId?: string;
  anonymousId: string;
  messageCount: number;
  durationSeconds: number;
  lastPageUrl: string;
}

/** Sent on every page view */
export interface PageViewWebhook {
  eventType: 'page_view';
  userId?: string;
  anonymousId: string;
  url: string;
  pageType: 'landing' | 'comparison' | 'roi' | 'project' | 'guide' | 'chat' | 'other';
  referrer?: string;
  utmParams?: Record<string, string>;
  timestamp: string;
}

/** Sent on signup or waitlist join */
export interface SignupWebhook {
  eventType: 'signup' | 'waitlist_join';
  userId: string;
  email: string;
  name?: string;
  source: string;
  anonymousId: string;
}

/** Sent when a user arrives via an ad click */
export interface AdClickWebhook {
  eventType: 'ad_click';
  anonymousId: string;
  utmParams: Record<string, string>;
  landingUrl: string;
  timestamp: string;
}

export type WebhookPayload =
  | ChatMessageWebhook
  | ChatSessionEndWebhook
  | PageViewWebhook
  | SignupWebhook
  | AdClickWebhook;
