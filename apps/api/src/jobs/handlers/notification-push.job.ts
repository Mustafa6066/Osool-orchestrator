/**
 * notification-push.job.ts
 *
 * Runs after market-pulse. Matches trending data against users' preferences
 * and creates personalized investment pulse notifications.
 *
 * Logic:
 *  1. Load trending data from Redis (nexus:trending)
 *  2. Load all users with known preferences (metadata.preferredAreas / preferredDevelopers)
 *  3. For each user: find overlaps between trending items and their preferences
 *  4. If overlap found → insert notification row
 */

import { db } from '@osool/db';
import { users, notifications } from '@osool/db/schema';
import { isNotNull, sql } from 'drizzle-orm';
import { getRedis } from '../../lib/redis.js';

export interface NotificationPushJobData {
  triggeredBy?: string;
}

export async function runNotificationPush(
  _data: NotificationPushJobData,
): Promise<{ sent: number }> {
  const redis = getRedis();

  // 1. Load trending data
  const raw = await redis.get('nexus:trending');
  if (!raw) return { sent: 0 };

  const trending = JSON.parse(raw) as {
    trendingDevelopers: { id: string; name: string; mentionCount: number }[];
    trendingLocations: { slug: string; name: string; mentionCount: number }[];
    totalSignals: number;
    computedAt: string;
  };

  if (trending.totalSignals < 5) return { sent: 0 }; // Not enough data

  const trendingDevIds = new Set(trending.trendingDevelopers.map((d) => d.id.toLowerCase()));
  const trendingLocSlugs = new Set(trending.trendingLocations.map((l) => l.slug.toLowerCase()));

  // 2. Load users with preferences in metadata
  const allUsers = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      language: users.language,
      metadata: users.metadata,
    })
    .from(users)
    .where(isNotNull(users.metadata))
    .limit(5000);

  let sentCount = 0;
  const notifRows: (typeof notifications.$inferInsert)[] = [];

  // 3. Match each user
  for (const user of allUsers) {
    const meta = user.metadata as Record<string, unknown> | null;
    if (!meta) continue;

    const prefAreas = (meta.preferredAreas as string[]) ?? [];
    const prefDevs = (meta.preferredDevelopers as string[]) ?? [];
    if (prefAreas.length === 0 && prefDevs.length === 0) continue;

    // Find overlaps
    const matchedDevs = prefDevs.filter((d) => trendingDevIds.has(d.toLowerCase()));
    const matchedAreas = prefAreas.filter((a) => trendingLocSlugs.has(a.toLowerCase()));

    if (matchedDevs.length === 0 && matchedAreas.length === 0) continue;

    // Build notification
    const parts: string[] = [];
    const partsAr: string[] = [];

    if (matchedDevs.length > 0) {
      const devNames = matchedDevs.slice(0, 3).join(', ');
      parts.push(`${devNames} ${matchedDevs.length === 1 ? 'is' : 'are'} trending right now`);
      partsAr.push(`${devNames} بيتريند دلوقتي`);
    }
    if (matchedAreas.length > 0) {
      const areaNames = matchedAreas.slice(0, 3).join(', ');
      parts.push(`High demand in ${areaNames}`);
      partsAr.push(`طلب عالي في ${areaNames}`);
    }

    notifRows.push({
      userId: user.id,
      type: 'market_pulse',
      title: '📈 Investment Pulse',
      titleAr: '📈 نبض الاستثمار',
      body: parts.join('. ') + '. Check the latest opportunities.',
      bodyAr: partsAr.join('. ') + '. اطلع على أحدث الفرص.',
      data: {
        matchedDevelopers: matchedDevs,
        matchedAreas: matchedAreas,
        totalSignals: trending.totalSignals,
        computedAt: trending.computedAt,
      },
      priority: matchedDevs.length + matchedAreas.length >= 3 ? 1 : 0,
    });
  }

  // 4. Batch insert all notifications + send WhatsApp for high-priority
  if (notifRows.length > 0) {
    // Insert in batches of 100
    for (let i = 0; i < notifRows.length; i += 100) {
      const batch = notifRows.slice(i, i + 100);
      await db.insert(notifications).values(batch);
    }
    sentCount = notifRows.length;

    // 5. Send WhatsApp messages for high-priority notifications (≥3 matches)
    try {
      const { getConfig } = await import('../../config.js');
      const config = getConfig();
      const whatsappPhoneId = config.WHATSAPP_PHONE_NUMBER_ID;
      const whatsappToken = config.WHATSAPP_ACCESS_TOKEN;

      if (whatsappPhoneId && whatsappToken) {
        // Get phone numbers for high-priority users
        const highPriorityUserIds = notifRows
          .filter((n) => (n.priority ?? 0) >= 1)
          .map((n) => n.userId);

        if (highPriorityUserIds.length > 0) {
          const usersWithPhones = allUsers.filter(
            (u: { id: string; metadata: Record<string, unknown> | null; language?: string | null }) => highPriorityUserIds.includes(u.id) && (u.metadata as Record<string, unknown>)?.phone,
          );

          for (const u of usersWithPhones.slice(0, 50)) {
            const phone = (u.metadata as Record<string, unknown>).phone as string;
            const notif = notifRows.find((n) => n.userId === u.id);
            if (!notif) continue;

            const messageBody = u.language === 'ar' ? notif.bodyAr : notif.body;

            try {
              await fetch(`https://graph.facebook.com/v18.0/${whatsappPhoneId}/messages`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${whatsappToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  messaging_product: 'whatsapp',
                  to: phone,
                  type: 'text',
                  text: { body: `🏠 Osool Investment Pulse\n\n${messageBody}` },
                }),
              });
            } catch {
              // Silent — WhatsApp delivery is best-effort
            }
          }
        }
      }
    } catch {
      // WhatsApp config not available — skip
    }
  }

  // Log
  await redis.lpush(
    'agent:nexus:logs',
    JSON.stringify({
      timestamp: new Date().toISOString(),
      message: `Notification push: ${sentCount} notifications for ${allUsers.length} users`,
    }),
  );
  await redis.ltrim('agent:nexus:logs', 0, 49);

  return { sent: sentCount };
}
