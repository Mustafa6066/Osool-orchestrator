/**
 * Google Ads API client — stub implementation.
 * Logs all calls and returns mock responses.
 */

import { getConfig } from '../../config.js';

function isConfigured(): boolean {
  const cfg = getConfig();
  return Boolean(cfg.GOOGLE_ADS_DEVELOPER_TOKEN && cfg.GOOGLE_ADS_CUSTOMER_ID);
}

function log(method: string, data: unknown): void {
  console.info(`[GoogleAds:${method}] ${JSON.stringify(data)}`);
}

/** Create a Customer Match audience list in Google Ads. */
export async function createAudienceList(name: string, description: string): Promise<{ resourceName: string }> {
  log('createAudienceList', { name, description });
  if (!isConfigured()) return { resourceName: `customers/mock/userLists/${Date.now()}` };
  return { resourceName: '' };
}

/** Upload hashed email list to a Google Ads audience. */
export async function uploadAudienceMembers(
  resourceName: string,
  emails: string[],
): Promise<{ added: number; removed: number }> {
  log('uploadAudienceMembers', { resourceName, count: emails.length });
  if (!isConfigured()) return { added: emails.length, removed: 0 };
  return { added: 0, removed: 0 };
}

/** Create a Performance Max campaign targeting a specific audience. */
export async function createPMaxCampaign(
  name: string,
  _audienceResourceName: string,
  dailyBudgetEGP: number,
): Promise<{ campaignResourceName: string }> {
  log('createPMaxCampaign', { name, dailyBudgetEGP });
  if (!isConfigured()) return { campaignResourceName: `customers/mock/campaigns/${Date.now()}` };
  return { campaignResourceName: '' };
}

/** Get campaign performance metrics from Google Ads. */
export async function getCampaignMetrics(campaignResourceName: string): Promise<{
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
}> {
  log('getCampaignMetrics', { campaignResourceName });
  if (!isConfigured()) {
    return {
      impressions: Math.floor(Math.random() * 30000),
      clicks: Math.floor(Math.random() * 1500),
      costMicros: Math.floor(Math.random() * 10_000_000),
      conversions: Math.floor(Math.random() * 30),
    };
  }
  return { impressions: 0, clicks: 0, costMicros: 0, conversions: 0 };
}
