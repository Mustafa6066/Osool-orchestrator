/**
 * PostHog analytics client — optional event tracking.
 */

import { PostHog } from 'posthog-node';
import { getConfig } from '../../config.js';

let _posthog: PostHog | null = null;

function getPostHog(): PostHog | null {
  const cfg = getConfig();
  if (!cfg.POSTHOG_API_KEY) return null;

  if (!_posthog) {
    _posthog = new PostHog(cfg.POSTHOG_API_KEY, {
      host: cfg.POSTHOG_HOST,
      flushAt: 20,
      flushInterval: 10000,
    });
  }
  return _posthog;
}

/** Track an event for a specific user/anonymous ID. */
export function trackEvent(
  distinctId: string,
  event: string,
  properties?: Record<string, unknown>,
): void {
  const ph = getPostHog();
  if (!ph) return;

  ph.capture({ distinctId, event, properties: properties ?? {} });
}

/** Identify a user in PostHog with profile properties. */
export function identifyUser(
  distinctId: string,
  properties: Record<string, unknown>,
): void {
  const ph = getPostHog();
  if (!ph) return;

  ph.identify({ distinctId, properties });
}

/** Flush all pending events (call on graceful shutdown). */
export async function flushPostHog(): Promise<void> {
  const ph = getPostHog();
  if (!ph) return;
  await ph.shutdown();
}
