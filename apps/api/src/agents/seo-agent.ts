import Anthropic from '@anthropic-ai/sdk';
import { env } from '../lib/env.js';
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
  let entity: string = '';

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
    case 'roi_analysis': {
      const loc = LOCATIONS.find((l) => l.slug === input.entityId);
      entity = loc ? loc.name : (input.entityId ?? 'egyptian-real-estate');
      context = loc
        ? `Location: ${loc.name} (${loc.nameAr}). Region: ${loc.region}. ${loc.description}`
        : `Egyptian real estate ROI analysis for area: ${input.entityId ?? 'general'}.`;
      path = `/${input.locale}/roi/${input.entityId ?? 'guide'}`;
      break;
    }
    case 'buying_guide': {
      entity = 'Egyptian Real Estate Buying Guide';
      const region = input.entityId ?? 'general';
      context = `First-time buyer guide for Egyptian real estate${region !== 'general' ? ` focusing on the ${region} area` : ''}. Cover legal process, payment plans, developer selection, common pitfalls, and market timing.`;
      path = `/${input.locale}/guides/${region}`;
      break;
    }
    default: {
      const pageTypeStr = input.pageType as string;
      path = `/${input.locale}/${pageTypeStr}/${input.entityId ?? 'guide'}`;
      entity = pageTypeStr.replace(/_/g, ' ');
    }
  }

  const locale = input.locale === 'ar' ? 'Arabic' : 'English';

  const glossaryNote = input.locale === 'ar'
    ? `Use Egyptian Arabic real estate terminology naturally:
- لقطة (La2ta) = bargain/catch deal
- ماباع (Maba7) = sold out by developer
- نص تشطيب (Noss-Tashteeb) = semi-finished/core & shell
- متشطب (Metshatteb) = fully finished
- استلام فوري (Estilam Fawri) = immediate delivery
- تقسيط (Ta2seet) = installment plan
- مقدم (Mo2addam) = down payment
- عداد (3addad) = utility meters (delivery readiness indicator)
- كمباوند (Compound) = gated community
- عائد إيجاري (3a2ed Eigari) = rental yield
Write in Egyptian dialect, NOT Modern Standard Arabic.`
    : `When relevant, introduce Egyptian real estate terms parenthetically to educate international investors:
- "catch deal (لقطة – la2ta)" for bargains
- "semi-finished (نص تشطيب – noss-tashteeb)" for core & shell
- "gated community (كمباوند – compound)" for developments
This builds cultural rapport with readers exploring the Egyptian market.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: `You are an expert SEO content writer for Egyptian real estate. Write in ${locale}. Be factual, data-driven, and optimized for search engines. Include natural keyword usage.\n\n${glossaryNote}`,
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

  // NOTE: DB persistence is the responsibility of the job handler (generate-seo-content.job.ts).
  // Do NOT write to the DB here to avoid double writes across two tables.

  return { path, ...parsed, schemaMarkup };
}
