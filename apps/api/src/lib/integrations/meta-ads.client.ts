/**
 * Meta Marketing API client — stub implementation.
 * Logs all calls to console and returns mock success responses.
 * Swap the implementation in this file when real credentials are available.
 */

import { getConfig } from '../../config.js';

export interface MetaAudience {
  id: string;
  name: string;
  description: string;
  rule: Record<string, unknown>;
}

export interface MetaAudienceSync {
  audienceName: string;
  userEmails: string[];
  userPhones?: string[];
}

export interface MetaAdCopy {
  headline: string;
  body: string;
  cta: string;
  imageUrl?: string;
}

/** Determines if Meta Ads integration is configured (real creds present). */
function isConfigured(): boolean {
  const cfg = getConfig();
  return Boolean(cfg.META_ACCESS_TOKEN && cfg.META_AD_ACCOUNT_ID);
}

function log(method: string, data: unknown): void {
  console.info(`[MetaAds:${method}] ${JSON.stringify(data)}`);
}

/** Create a custom audience in Meta Ads Manager. */
export async function createCustomAudience(
  name: string,
  description: string,
): Promise<{ id: string; name: string }> {
  log('createCustomAudience', { name, description });

  if (!isConfigured()) {
    const mockId = `mock_audience_${Date.now()}`;
    return { id: mockId, name };
  }

  // Real implementation placeholder
  // const url = `https://graph.facebook.com/v19.0/act_${cfg.META_AD_ACCOUNT_ID}/customaudiences`;
  // ... real API call here
  return { id: `real_audience_${Date.now()}`, name };
}

/** Sync a list of hashed user emails/phones to an existing Meta audience. */
export async function syncAudience(audienceId: string, sync: MetaAudienceSync): Promise<{ success: boolean; added: number }> {
  log('syncAudience', { audienceId, userCount: sync.userEmails.length });

  if (!isConfigured()) {
    return { success: true, added: sync.userEmails.length };
  }

  // Real implementation would hash emails with SHA256 before sending
  return { success: true, added: sync.userEmails.length };
}

/** Get audience size estimate for a given audience ID. */
export async function getAudienceSize(audienceId: string): Promise<number> {
  log('getAudienceSize', { audienceId });
  if (!isConfigured()) return Math.floor(Math.random() * 5000) + 500;
  return 0; // Real implementation
}

/** Create ad campaign with ad copy variants. */
export async function createCampaign(
  name: string,
  _audienceId: string,
  _copies: MetaAdCopy[],
  dailyBudgetEGP: number,
): Promise<{ campaignId: string; adSetId: string; adIds: string[] }> {
  log('createCampaign', { name, dailyBudgetEGP });

  if (!isConfigured()) {
    return {
      campaignId: `mock_campaign_${Date.now()}`,
      adSetId: `mock_adset_${Date.now()}`,
      adIds: [`mock_ad_${Date.now()}`],
    };
  }

  return { campaignId: '', adSetId: '', adIds: [] };
}

/** Pause or resume a campaign. */
export async function toggleCampaign(campaignId: string, active: boolean): Promise<{ success: boolean }> {
  log('toggleCampaign', { campaignId, active });
  if (!isConfigured()) return { success: true };
  return { success: true };
}

/** Get campaign performance metrics. */
export async function getCampaignMetrics(campaignId: string): Promise<{
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
}> {
  log('getCampaignMetrics', { campaignId });

  if (!isConfigured()) {
    return {
      impressions: Math.floor(Math.random() * 50000),
      clicks: Math.floor(Math.random() * 2000),
      spend: Math.floor(Math.random() * 5000),
      conversions: Math.floor(Math.random() * 50),
    };
  }

  return { impressions: 0, clicks: 0, spend: 0, conversions: 0 };
}
