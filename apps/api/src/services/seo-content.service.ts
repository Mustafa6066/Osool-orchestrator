/**
 * SEO Content Service — content, keyword, and page management helpers
 */
import { db } from '@osool/db';
import { seoContent, keywords, seoPages } from '@osool/db/schema';
import { eq, desc, and, sql, ilike } from 'drizzle-orm';

export async function getSEOContentList(opts: { page?: number; limit?: number; status?: string } = {}) {
  const { page = 1, limit = 20, status } = opts;
  const offset = (page - 1) * limit;
  const where = status ? eq(seoContent.status, status as any) : undefined;
  const [rows, countRow] = await Promise.all([
    db.select().from(seoContent).where(where).orderBy(desc(seoContent.updatedAt)).offset(offset).limit(limit),
    db.select({ count: sql<number>`count(*)::int` }).from(seoContent).where(where),
  ]);
  return { content: rows, total: countRow[0]?.count ?? 0, page, limit };
}

export async function getSEOContentBySlug(slug: string, locale: 'en' | 'ar' = 'en') {
  const [row] = await db
    .select()
    .from(seoContent)
    .where(and(eq(seoContent.slug, slug), eq(seoContent.locale, locale)))
    .orderBy(desc(seoContent.version))
    .limit(1);
  return row ?? null;
}

export async function upsertSEOContent(data: {
  pageType: string;
  slug: string;
  locale: 'en' | 'ar';
  title: string;
  description: string;
  metaDescription: string;
  h1: string;
  body: string;
  schemaMarkup?: Record<string, unknown>;
  wordCount?: number;
}) {
  const existing = await getSEOContentBySlug(data.slug, data.locale);
  const version = (existing?.version ?? 0) + 1;

  const insertValues: Record<string, unknown> = {
    pageType: data.pageType,
    slug: data.slug,
    locale: data.locale,
    version,
    title: data.title,
    description: data.description,
    metaDescription: data.metaDescription,
    h1: data.h1,
    body: data.body,
    schemaMarkup: data.schemaMarkup ?? {},
    wordCount: data.wordCount ?? 0,
    status: 'published',
    publishedAt: new Date(),
  };

  await db
    .insert(seoContent)
    .values(insertValues as any)
    .onConflictDoUpdate({
      target: [seoContent.slug, seoContent.locale, seoContent.version],
      set: {
        title: data.title,
        description: data.description,
        body: data.body,
        wordCount: data.wordCount ?? 0,
        updatedAt: new Date(),
      },
    });
}

export async function getKeywordList(opts: { page?: number; limit?: number; search?: string } = {}) {
  const { page = 1, limit = 20, search } = opts;
  const offset = (page - 1) * limit;
  const where = search ? ilike(keywords.keyword, `%${search}%`) : undefined;
  const [rows, countRow] = await Promise.all([
    db.select().from(keywords).where(where).orderBy(desc(keywords.createdAt)).offset(offset).limit(limit),
    db.select({ count: sql<number>`count(*)::int` }).from(keywords).where(where),
  ]);
  return { keywords: rows, total: countRow[0]?.count ?? 0, page, limit };
}

export async function getTotalSEOPages(): Promise<number> {
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(seoPages);
  return row?.count ?? 0;
}
