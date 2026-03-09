import Anthropic from '@anthropic-ai/sdk';
import { env } from '../lib/env.js';
import { db } from '@osool/db';
import { seoPages, keywords } from '@osool/db/schema';
import { eq } from 'drizzle-orm';
import { DEVELOPERS, LOCATIONS } from '@osool/shared';
import { slugifyEn, comparisonSlug } from '@osool/shared';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

export interface SEOPageInput {
  pageType: 'developer_profile' | 'location_guide' | 'developer_comparison' | 'roi_analysis' | 'buying_guide';
  entityId?: string;
  entityIds?: string[];
  locale: 'en' | 'ar';
  keywordId?: string;
}

export interface GeneratedPage {
  path: string;
  title: string;
  metaDescription: string;
  h1: string;
  content: string;
  schemaMarkup: Record<string, unknown>;
}

const PAGE_PROMPTS: Record<string, string> = {
  developer_profile: `Generate a comprehensive SEO-optimized developer profile page for Egyptian real estate.
Include: company overview, key projects, delivery track record, pricing analysis, pros & cons, buyer verdict.
Format: Markdown with clear H2/H3 headings. Target 1500-2000 words.`,

  location_guide: `Generate a comprehensive SEO-optimized location/area guide for Egyptian real estate investment.
Include: area overview, infrastructure, key developments, price trends, ROI analysis, lifestyle, transport links.
Format: Markdown with clear H2/H3 headings. Target 1500-2000 words.`,

  developer_comparison: `Generate a detailed SEO-optimized comparison between two Egyptian real estate developers.
Include: side-by-side table, delivery rates, pricing, project quality, customer reviews, verdict.
Format: Markdown with comparison tables. Target 1200-1500 words.`,

  roi_analysis: `Generate a data-driven ROI analysis for Egyptian real estate investment in the specified area.
Include: historical price trends, rental yields, capital appreciation, risk factors, 5-year projection.
Format: Markdown with data tables. Target 1000-1500 words.`,

  buying_guide: `Generate a comprehensive first-time buyer guide for Egyptian real estate.
Include: step-by-step process, legal requirements, payment plans, common mistakes, developer selection criteria.
Format: Markdown with clear sections. Target 2000-2500 words.`,
};

export async function generateSEOPage(input: SEOPageInput): Promise<GeneratedPage> {
  const prompt = PAGE_PROMPTS[input.pageType] ?? PAGE_PROMPTS.developer_profile;
  let context = '';
  let path = '';
  let entity = '';

  switch (input.pageType) {
    case 'developer_profile': {
      const dev = DEVELOPERS.find((d) => d.id === input.entityId);
      if (!dev) throw new Error(`Developer ${input.entityId} not found`);
      entity = dev.name;
      context = `Developer: ${dev.name} (${dev.nameAr}). Founded: ${dev.founded}. Projects: ${dev.projectCount}. Delivery rate: ${dev.avgDeliveryRatePercent}%. Avg price/sqm: ${dev.avgPricePerSqm} EGP. Regions: ${dev.regions.join(', ')}. Tier: ${dev.tier}.`;
      path = `/${input.locale}/developers/${dev.slug}`;
      break;
    }
    case 'location_guide': {
      const loc = LOCATIONS.find((l) => l.slug === input.entityId);
      if (!loc) throw new Error(`Location ${input.entityId} not found`);
      entity = loc.name;
      context = `Location: ${loc.name} (${loc.nameAr}). Region: ${loc.region}. ${loc.description}`;
      path = `/${input.locale}/areas/${loc.slug}`;
      break;
    }
    case 'developer_comparison': {
      const [id1, id2] = input.entityIds ?? [];
      const dev1 = DEVELOPERS.find((d) => d.id === id1);
      const dev2 = DEVELOPERS.find((d) => d.id === id2);
      if (!dev1 || !dev2) throw new Error('Both developers required for comparison');
      entity = `${dev1.name} vs ${dev2.name}`;
      context = `Developer A: ${dev1.name}, founded ${dev1.founded}, ${dev1.projectCount} projects, ${dev1.avgDeliveryRatePercent}% delivery, ${dev1.avgPricePerSqm} EGP/sqm.
Developer B: ${dev2.name}, founded ${dev2.founded}, ${dev2.projectCount} projects, ${dev2.avgDeliveryRatePercent}% delivery, ${dev2.avgPricePerSqm} EGP/sqm.`;
      path = `/${input.locale}/compare/${comparisonSlug(dev1.slug, dev2.slug)}`;
      break;
    }
    default: {
      path = `/${input.locale}/${input.pageType}/${input.entityId ?? 'guide'}`;
      entity = input.pageType.replace(/_/g, ' ');
    }
  }

  const locale = input.locale === 'ar' ? 'Arabic' : 'English';

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: `You are an expert SEO content writer for Egyptian real estate. Write in ${locale}. Be factual, data-driven, and optimized for search engines. Include natural keyword usage.`,
    messages: [{
      role: 'user',
      content: `${prompt}\n\nContext:\n${context}\n\nGenerate the page content now. Return JSON with keys: title, metaDescription, h1, content`,
    }],
  });

  const text = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  let parsed: { title: string; metaDescription: string; h1: string; content: string };
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] ?? '{}');
  } catch {
    parsed = {
      title: `${entity} | Osool CoInvestor`,
      metaDescription: `Comprehensive guide to ${entity} in Egyptian real estate.`,
      h1: entity,
      content: text,
    };
  }

  const schemaMarkup = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: parsed.title,
    description: parsed.metaDescription,
    author: { '@type': 'Organization', name: 'Osool CoInvestor' },
    publisher: { '@type': 'Organization', name: 'Osool CoInvestor' },
    datePublished: new Date().toISOString(),
  };

  // Store in DB
  await db.insert(seoPages).values({
    path,
    locale: input.locale,
    title: parsed.title,
    metaDescription: parsed.metaDescription,
    h1: parsed.h1,
    content: parsed.content,
    pageType: input.pageType,
    keywordId: input.keywordId,
    schemaMarkup,
    published: true,
    lastRegenerated: new Date(),
  }).onConflictDoNothing();

  return { path, ...parsed, schemaMarkup };
}
