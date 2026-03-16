/**
 * scraper-event.job.ts
 *
 * Processes scraper events from the Platform backend.
 * When significant market changes are detected, triggers:
 *   - SEO content regeneration for affected pages
 *   - Notification push for users with matching preferences
 */

import type { ScraperEventJobData } from '../queue.js';
import { getSEOContentGenQueue, getNotificationPushQueue } from '../queue.js';

export async function processScraperEvent(data: ScraperEventJobData): Promise<{ seoJobsQueued: number; notificationTriggered: boolean }> {
  const seoQueue = getSEOContentGenQueue();
  const notifQueue = getNotificationPushQueue();
  let seoJobsQueued = 0;
  let notificationTriggered = false;

  if (data.eventType === 'property_scrape_complete') {
    // Meaningful property changes → regenerate location guides and ROI pages
    if (data.significantChanges && data.significantChanges > 10) {
      for (const locale of ['en', 'ar'] as const) {
        await seoQueue.add('scraper-seo-regen', {
          pageType: 'location_guide',
          locale,
          forceRegenerate: true,
        });
        await seoQueue.add('scraper-seo-regen', {
          pageType: 'roi_analysis',
          locale,
          forceRegenerate: true,
        });
        seoJobsQueued += 2;
      }
    }
  }

  if (data.eventType === 'economic_update') {
    // Economic indicator changes → regenerate buying guides and ROI pages
    for (const locale of ['en', 'ar'] as const) {
      await seoQueue.add('scraper-seo-regen', {
        pageType: 'buying_guide',
        locale,
        forceRegenerate: true,
      });
      seoJobsQueued += 1;
    }

    // Trigger notification push so users get alerts on rate changes
    await notifQueue.add('scraper-notification', {
      triggeredBy: `economic_update:${data.runId ?? 'unknown'}`,
    });
    notificationTriggered = true;
  }

  if (data.eventType === 'geopolitical_shift') {
    // High-impact geopolitical events → notify users + refresh market guides
    if (data.sentimentShift !== undefined && Math.abs(data.sentimentShift) > 0.3) {
      for (const locale of ['en', 'ar'] as const) {
        await seoQueue.add('scraper-seo-regen', {
          pageType: 'buying_guide',
          locale,
          forceRegenerate: true,
        });
        seoJobsQueued += 1;
      }

      await notifQueue.add('scraper-notification', {
        triggeredBy: `geopolitical_shift:${data.runId ?? 'unknown'}`,
      });
      notificationTriggered = true;
    }
  }

  console.info(
    `[scraper-event] Processed ${data.eventType}: seoJobs=${seoJobsQueued}, notification=${notificationTriggered}`,
  );

  return { seoJobsQueued, notificationTriggered };
}
