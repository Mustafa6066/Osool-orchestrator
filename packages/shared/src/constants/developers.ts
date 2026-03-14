import type { Developer } from '../types/property.js';

/**
 * Egyptian real estate developers tracked by Osool.
 * Data includes delivery rates, pricing tiers, and regional presence.
 */
export const DEVELOPERS: Developer[] = [
  {
    id: 'emaar',
    name: 'Emaar Misr',
    nameAr: 'إعمار مصر',
    slug: 'emaar-misr',
    founded: 2005,
    projectCount: 8,
    avgDeliveryRatePercent: 92,
    avgPricePerSqm: 85_000,
    regions: ['new_capital', 'cairo', 'north_coast'],
    tier: 'premium',
  },
  {
    id: 'sodic',
    name: 'SODIC',
    nameAr: 'سوديك',
    slug: 'sodic',
    founded: 1996,
    projectCount: 15,
    avgDeliveryRatePercent: 88,
    avgPricePerSqm: 72_000,
    regions: ['sheikh_zayed', '6th_october', 'new_capital', 'north_coast'],
    tier: 'premium',
  },
  {
    id: 'orascom',
    name: 'Orascom Development',
    nameAr: 'أوراسكوم للتنمية',
    slug: 'orascom-development',
    founded: 1989,
    projectCount: 10,
    avgDeliveryRatePercent: 85,
    avgPricePerSqm: 65_000,
    regions: ['gouna', 'north_coast', 'cairo'],
    tier: 'premium',
  },
  {
    id: 'palm_hills',
    name: 'Palm Hills Development',
    nameAr: 'بالم هيلز للتعمير',
    slug: 'palm-hills',
    founded: 2005,
    projectCount: 30,
    avgDeliveryRatePercent: 82,
    avgPricePerSqm: 55_000,
    regions: ['6th_october', 'new_cairo', 'north_coast', 'new_capital'],
    tier: 'premium',
  },
  {
    id: 'mountain_view',
    name: 'Mountain View',
    nameAr: 'ماونتن فيو',
    slug: 'mountain-view',
    founded: 2005,
    projectCount: 20,
    avgDeliveryRatePercent: 90,
    avgPricePerSqm: 78_000,
    regions: ['new_cairo', '6th_october', 'north_coast', 'new_capital'],
    tier: 'premium',
  },
  {
    id: 'tmg',
    name: 'Talaat Moustafa Group',
    nameAr: 'مجموعة طلعت مصطفى',
    slug: 'tmg',
    founded: 1979,
    projectCount: 12,
    avgDeliveryRatePercent: 95,
    avgPricePerSqm: 48_000,
    regions: ['new_cairo', 'new_capital', 'north_coast'],
    tier: 'premium',
  },
  {
    id: 'ora',
    name: 'Ora Developers',
    nameAr: 'أورا للتطوير',
    slug: 'ora-developers',
    founded: 2018,
    projectCount: 4,
    avgDeliveryRatePercent: 78,
    avgPricePerSqm: 95_000,
    regions: ['new_cairo', 'north_coast'],
    tier: 'premium',
  },
  {
    id: 'hyde_park',
    name: 'Hyde Park Developments',
    nameAr: 'هايد بارك للتطوير',
    slug: 'hyde-park',
    founded: 2007,
    projectCount: 5,
    avgDeliveryRatePercent: 80,
    avgPricePerSqm: 52_000,
    regions: ['new_cairo', 'new_capital'],
    tier: 'mid_market',
  },
  {
    id: 'city_edge',
    name: 'City Edge Developments',
    nameAr: 'سيتي إيدج للتطوير',
    slug: 'city-edge',
    founded: 2017,
    projectCount: 8,
    avgDeliveryRatePercent: 70,
    avgPricePerSqm: 40_000,
    regions: ['new_capital', 'new_alamein', '6th_october'],
    tier: 'mid_market',
  },
  {
    id: 'tatweer_misr',
    name: 'Tatweer Misr',
    nameAr: 'تطوير مصر',
    slug: 'tatweer-misr',
    founded: 2014,
    projectCount: 6,
    avgDeliveryRatePercent: 87,
    avgPricePerSqm: 70_000,
    regions: ['new_cairo', 'north_coast', 'ain_sokhna'],
    tier: 'premium',
  },
  {
    id: 'inertia',
    name: 'Inertia Egypt',
    nameAr: 'إنرشيا مصر',
    slug: 'inertia',
    founded: 2007,
    projectCount: 5,
    avgDeliveryRatePercent: 75,
    avgPricePerSqm: 58_000,
    regions: ['6th_october', 'north_coast'],
    tier: 'mid_market',
  },
  {
    id: 'misr_italia',
    name: 'Misr Italia Properties',
    nameAr: 'مصر إيطاليا للعقارات',
    slug: 'misr-italia',
    founded: 2004,
    projectCount: 10,
    avgDeliveryRatePercent: 72,
    avgPricePerSqm: 45_000,
    regions: ['new_capital', 'new_cairo', '6th_october'],
    tier: 'mid_market',
  },
  {
    id: 'lavista',
    name: 'La Vista Developments',
    nameAr: 'لافيستا للتطوير',
    slug: 'lavista',
    founded: 1991,
    projectCount: 14,
    avgDeliveryRatePercent: 83,
    avgPricePerSqm: 62_000,
    regions: ['new_cairo', 'ain_sokhna', 'north_coast', 'ras_el_hikma'],
    tier: 'mid_market',
  },
  {
    id: 'hassan_allam',
    name: 'Hassan Allam Properties',
    nameAr: 'حسن علام العقارية',
    slug: 'hassan-allam',
    founded: 2016,
    projectCount: 5,
    avgDeliveryRatePercent: 91,
    avgPricePerSqm: 80_000,
    regions: ['new_cairo', 'north_coast', 'new_capital'],
    tier: 'premium',
  },
];

/** Lookup developer by ID. */
export function getDeveloperById(id: string): Developer | undefined {
  return DEVELOPERS.find((d) => d.id === id);
}

/** Lookup developer by slug. */
export function getDeveloperBySlug(slug: string): Developer | undefined {
  return DEVELOPERS.find((d) => d.slug === slug);
}

/** Get all developer pair combinations for comparison pages. */
export function getDeveloperPairs(): [Developer, Developer][] {
  const pairs: [Developer, Developer][] = [];
  for (let i = 0; i < DEVELOPERS.length; i++) {
    for (let j = i + 1; j < DEVELOPERS.length; j++) {
      pairs.push([DEVELOPERS[i], DEVELOPERS[j]]);
    }
  }
  return pairs;
}
