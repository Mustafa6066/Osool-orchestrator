/**
 * Intent parser — converts raw chat messages into structured IntentSignal data.
 *
 * Strategy:
 *  1. Fast regex matching for entity extraction (developers, locations, price ranges).
 *  2. Rule-based intent classification from keyword patterns.
 *  3. Falls back to Claude API for ambiguous messages.
 *  4. Results keyed for Redis caching (caller must handle cache layer).
 */

import type { IntentType, IntentEntities, IntentSignal } from '../types/intent.js';
import type { ICPSegment } from '../types/icp.js';

// ── Developer name aliases ────────────────────────────────────────────────────

const DEVELOPER_ALIASES: Record<string, string[]> = {
  emaar: ['emaar', 'emaar misr', 'إعمار', 'emaar egypt'],
  sodic: ['sodic', 'سوديك', 'sodic west', 'sodic east'],
  orascom: ['orascom', 'أوراسكوم', 'orascom development', 'el gouna'],
  palm_hills: ['palm hills', 'بالم هيلز', 'palm hills development', 'phdco'],
  mountain_view: ['mountain view', 'ماونتن فيو', 'mv', 'mountain view icity'],
  tmg: ['tmg', 'talaat moustafa', 'طلعت مصطفى', 'madinaty', 'مدينتي'],
  hassan_allam: ['hassan allam', 'حسن علام', 'ora', 'hassan allam properties'],
  madinet_masr: ['madinet masr', 'مدينة مصر', 'MMD', 'rivan', 'mostakbal'],
  city_edge: ['city edge', 'سيتي إيدج', 'north edge', 'zahya'],
  ora: ['ora', 'ora developers', 'سيرم', 'sekem'],
  la_vista: ['la vista', 'لافيستا', 'la vista bay', 'la vista gardens'],
  hyde_park: ['hyde park', 'هايد بارك', 'hyde park developments'],
  mnhd: ['mnhd', 'misr national housing', 'المصرية الوطنية للإسكان'],
  tatweer_misr: ['tatweer misr', 'تطوير مصر', 'fouka bay', 'bloomfields'],
};

// ── Location aliases ──────────────────────────────────────────────────────────

const LOCATION_ALIASES: Record<string, string[]> = {
  'new-cairo': ['new cairo', 'القاهرة الجديدة', 'new cairo city', 'fifth settlement', 'التجمع الخامس', 'tagamoa'],
  'sheikh-zayed': ['sheikh zayed', 'الشيخ زايد', 'zayed', 'beverly hills'],
  '6th-october': ['6th of october', '6 october', 'sixth of october', '6 أكتوبر', 'october city'],
  'new-capital': ['new capital', 'العاصمة الإدارية', 'new administrative capital', 'capital', 'NAC'],
  'new-capital-r5': ['r5', 'district r5'],
  'new-capital-r7': ['r7', 'district r7'],
  'new-capital-r8': ['r8', 'district r8'],
  'north-coast': ['north coast', 'الساحل الشمالي', 'sahel', 'ncoast', 'SAC', 'حدائق'],
  'new-alamein': ['new alamein', 'العلمين الجديدة', 'alamein'],
  'ras-el-hikma': ['ras el hikma', 'رأس الحكمة', 'hikma', 'ras elhikma'],
  'madinaty': ['madinaty', 'مدينتي'],
  'shorouk': ['shorouk', 'الشروق', 'shorouk city', 'madinah shorouq'],
  'ain-sokhna': ['ain sokhna', 'العين السخنة', 'sokhna'],
  'gouna': ['el gouna', 'الجونة', 'gouna'],
  'mostakbal-city': ['mostakbal', 'المستقبل', 'mostakbal city'],
  'katameya': ['katameya', 'قطامية', 'katamya'],
  'sidi-abdel-rahman': ['sidi abdel rahman', 'سيدي عبد الرحمن', 'sar'],
};

// ── Price patterns ────────────────────────────────────────────────────────────

const EGP_PATTERNS = [
  /(\d[\d,]*)\s*(?:million|مليون)\s*(?:egp|جنيه|pounds?)?/gi,
  /(?:egp|جنيه)\s*(\d[\d,]*)/gi,
  /(\d[\d,]*)\s*(?:egp|جنيه)/gi,
];

const USD_PATTERNS = [
  /(\d[\d,]*)\s*(?:million|M)\s*(?:usd|\$|dollars?)/gi,
  /\$(\d[\d,]*(?:\.\d+)?)\s*(?:million|M)?/gi,
  /(\d[\d,]*)\s*(?:usd|\$|dollars?)/gi,
];

// ── Intent classification patterns ───────────────────────────────────────────

const INTENT_PATTERNS: { type: IntentType; patterns: RegExp[] }[] = [
  {
    type: 'comparison',
    patterns: [
      /compar|مقارنة|vs\.?|versus|difference|contrast|better than|أفضل من|الفرق بين|which (is|one)/i,
      /\b(?:emaar|sodic|palm hills|mountain view|tmg|orascom|ora|tatweer)\b.{0,50}\b(?:emaar|sodic|palm hills|mountain view|tmg|orascom|ora|tatweer)\b/i,
    ],
  },
  {
    type: 'roi_inquiry',
    patterns: [
      /\b(?:roi|return on investment|yield|rental yield|rental income|عائد|استثمار|ربح|profit|appreciation|نمو|capital gains)\b/i,
      /worth investing|investment.*worth|is.*good investment|عائد استثمار/i,
    ],
  },
  {
    type: 'price_check',
    patterns: [
      /\b(?:price|prices|pricing|cost|how much|كم سعر|السعر|بكام|تكلفة|metre|sqm|per meter|per sqm)\b/i,
      /\b(?:egp|جنيه|usd|\$)\s*\d/i,
    ],
  },
  {
    type: 'developer_review',
    patterns: [
      /\b(?:reputation|reliable|trusted|delivery|late|delayed|سمعة|يسلم|تسليم|موثوق|مؤخر|مشاكل|review|rating)\b/i,
      /\b(?:complaints|problems|issues|شكاوي|ضمان|guarantee|after.?sales|خدمة بعد البيع)\b/i,
    ],
  },
  {
    type: 'area_research',
    patterns: [
      /\b(?:area|location|district|region|neighborhood|zone|منطقة|حي|موقع|مكان|where to|أين|أحسن مكان)\b/i,
      /\b(?:infrastructure|amenities|schools|hospitals|مدارس|مستشفيات|خدمات|مرافق|transport|مواصلات)\b/i,
    ],
  },
  {
    type: 'payment_plan',
    patterns: [
      /\b(?:payment plan|installments|down payment|mortgage|تقسيط|مقدم|قسط|أقساط|تمويل|bank loan|قرض)\b/i,
      /\b(?:\d+\s*years?|سنوات|years equal|monthly installment)\b/i,
    ],
  },
];

// ── ICP Segment inference ─────────────────────────────────────────────────────

function inferSegment(entities: IntentEntities, budget?: number): ICPSegment {
  if (budget && budget >= 10_000_000) return 'expat_investor';
  if (budget && budget >= 5_000_000) return 'domestic_hnw';
  if (entities.locations?.some((l) => ['north-coast', 'ras-el-hikma', 'new-alamein'].includes(l))) {
    return 'expat_investor';
  }
  if (entities.developers?.some((d) => ['ora', 'emaar'].includes(d))) {
    return 'expat_investor';
  }
  return 'first_time_buyer';
}

// ── Entity extraction helpers ─────────────────────────────────────────────────

function extractDevelopers(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const [devId, aliases] of Object.entries(DEVELOPER_ALIASES)) {
    if (aliases.some((alias) => lower.includes(alias.toLowerCase()))) {
      found.push(devId);
    }
  }
  return [...new Set(found)];
}

function extractLocations(text: string): string[] {
  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const [slug, aliases] of Object.entries(LOCATION_ALIASES)) {
    if (aliases.some((alias) => lower.includes(alias.toLowerCase()))) {
      found.push(slug);
    }
  }
  return [...new Set(found)];
}

function extractPriceRange(text: string): { min: number; max: number; currency: 'EGP' | 'USD' } | undefined {
  const prices: { value: number; currency: 'EGP' | 'USD' }[] = [];

  for (const pattern of EGP_PATTERNS) {
    pattern.lastIndex = 0;
    const global = new RegExp(pattern.source, 'gi');
    let match;
    while ((match = global.exec(text)) !== null) {
      const raw = parseFloat(match[1]?.replace(/,/g, '') ?? '0');
      if (raw > 0) prices.push({ value: raw * 1_000_000, currency: 'EGP' });
    }
  }

  for (const pattern of USD_PATTERNS) {
    pattern.lastIndex = 0;
    const global = new RegExp(pattern.source, 'gi');
    let match;
    while ((match = global.exec(text)) !== null) {
      const raw = parseFloat(match[1]?.replace(/,/g, '') ?? '0');
      const multiplier = text.toLowerCase().includes('million') || text.toLowerCase().includes(' m ') ? 1_000_000 : 1;
      if (raw > 0) prices.push({ value: raw * multiplier, currency: 'USD' });
    }
  }

  if (prices.length === 0) return undefined;

  const egpPrices = prices.filter((p) => p.currency === 'EGP').map((p) => p.value);
  const usdPrices = prices.filter((p) => p.currency === 'USD').map((p) => p.value);

  if (egpPrices.length > 0) {
    return { min: Math.min(...egpPrices), max: Math.max(...egpPrices), currency: 'EGP' };
  }
  if (usdPrices.length > 0) {
    return { min: Math.min(...usdPrices), max: Math.max(...usdPrices), currency: 'USD' };
  }
  return undefined;
}

// ── Intent classification ─────────────────────────────────────────────────────

function classifyIntent(text: string, entities: IntentEntities): { type: IntentType; confidence: number } {
  const scores: Partial<Record<IntentType, number>> = {};

  // Developer comparison: 2 developers mentioned → strong comparison signal
  if ((entities.developers?.length ?? 0) >= 2) {
    scores['comparison'] = (scores['comparison'] ?? 0) + 40;
  }

  for (const { type, patterns } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        scores[type] = (scores[type] ?? 0) + 25;
      }
    }
  }

  const entries = Object.entries(scores) as [IntentType, number][];
  if (entries.length === 0) return { type: 'general', confidence: 0.3 };

  entries.sort((a, b) => b[1] - a[1]);
  const [topType, topScore] = entries[0]!;
  const confidence = Math.min(0.95, topScore / 100);

  return { type: topType, confidence };
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface ParsedIntent {
  intentType: IntentType;
  entities: IntentEntities;
  confidence: number;
  segment: ICPSegment;
  requiresLLM: boolean; // true when confidence is low → caller should call Claude
}

/**
 * Synchronously parse a raw chat message using regex + rule-based classification.
 * Fast and zero-cost. Use when latency matters.
 *
 * When `requiresLLM` is true, consider calling Claude to refine the result.
 */
export function parseIntentFast(
  rawMessage: string,
  _pageContext?: { pageType?: string; url?: string },
): ParsedIntent {
  const entities: IntentEntities = {
    developers: extractDevelopers(rawMessage),
    locations: extractLocations(rawMessage),
    priceRange: extractPriceRange(rawMessage),
    projects: [],
  };

  const { type, confidence } = classifyIntent(rawMessage, entities);
  const segment = inferSegment(entities, entities.priceRange?.currency === 'EGP' ? entities.priceRange?.min : undefined);

  return {
    intentType: type,
    entities,
    confidence,
    segment,
    requiresLLM: confidence < 0.55,
  };
}

/**
 * Cache key for Claude intent parsing (Redis TTL: 24h).
 */
export function intentCacheKey(message: string): string {
  // Simple hash: first 200 chars normalized
  const normalized = message.toLowerCase().trim().slice(0, 200).replace(/\s+/g, ' ');
  // Simple hash without Buffer/btoa for cross-env compat
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0;
  }
  const hex = (hash >>> 0).toString(16).padStart(8, '0');
  return `intent:${hex}:${normalized.slice(0, 56).replace(/[^a-z0-9]/g, '_')}`;
}

/** Dummy id generator - used for non-db contexts where caller provides id explicitly. */
export function buildIntentSignal(
  id: string,
  sessionId: string,
  parsed: ParsedIntent,
  rawQuery: string,
  now = new Date(),
): Omit<IntentSignal, 'userId'> {
  return {
    id,
    sessionId,
    timestamp: now,
    intentType: parsed.intentType,
    entities: parsed.entities,
    rawQuery,
    confidence: Math.round(parsed.confidence * 100),
    segment: parsed.segment,
    source: 'chat',
  };
}
