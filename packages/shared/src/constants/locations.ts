import type { LocationROI } from '../types/property.js';

/** Location metadata for all tracked Egyptian real estate markets. */
export interface LocationMeta {
  slug: string;
  name: string;
  nameAr: string;
  region: string;
  description: string;
  descriptionAr: string;
}

export const LOCATIONS: LocationMeta[] = [
  { slug: 'new-cairo', name: 'New Cairo', nameAr: 'القاهرة الجديدة', region: 'cairo', description: 'Premium residential district east of Cairo, home to major compounds.', descriptionAr: 'حي سكني راقي شرق القاهرة، موطن للمجمعات السكنية الكبرى.' },
  { slug: 'sheikh-zayed', name: 'Sheikh Zayed City', nameAr: 'مدينة الشيخ زايد', region: 'giza', description: 'High-end suburban city west of Cairo with green spaces.', descriptionAr: 'مدينة ضاحية راقية غرب القاهرة بمساحات خضراء واسعة.' },
  { slug: '6th-october', name: '6th of October City', nameAr: 'مدينة 6 أكتوبر', region: 'giza', description: 'Large satellite city with diverse price ranges and established infrastructure.', descriptionAr: 'مدينة فرعية كبيرة بنطاقات أسعار متنوعة وبنية تحتية قائمة.' },
  { slug: 'new-capital', name: 'New Administrative Capital', nameAr: 'العاصمة الإدارية الجديدة', region: 'new_capital', description: "Egypt's new capital city 45km east of Cairo. Government hub.", descriptionAr: 'العاصمة الجديدة لمصر 45 كم شرق القاهرة. مركز حكومي.' },
  { slug: 'new-capital-r5', name: 'New Capital R5', nameAr: 'العاصمة الإدارية R5', region: 'new_capital', description: 'Residential district R5 in the New Capital.', descriptionAr: 'الحي السكني R5 بالعاصمة الإدارية.' },
  { slug: 'new-capital-r7', name: 'New Capital R7', nameAr: 'العاصمة الإدارية R7', region: 'new_capital', description: 'Premium residential district R7 with top developers.', descriptionAr: 'الحي السكني الراقي R7 مع أفضل المطورين.' },
  { slug: 'new-capital-r8', name: 'New Capital R8', nameAr: 'العاصمة الإدارية R8', region: 'new_capital', description: 'Growing residential district R8 with competitive pricing.', descriptionAr: 'الحي السكني المتنامي R8 بأسعار تنافسية.' },
  { slug: 'north-coast', name: 'North Coast', nameAr: 'الساحل الشمالي', region: 'north_coast', description: 'Premium Mediterranean coastline resort destinations.', descriptionAr: 'وجهات منتجعات ساحلية متميزة على البحر المتوسط.' },
  { slug: 'new-alamein', name: 'New Alamein', nameAr: 'العلمين الجديدة', region: 'north_coast', description: 'Government-backed coastal city with year-round living.', descriptionAr: 'مدينة ساحلية مدعومة حكومياً للعيش على مدار العام.' },
  { slug: 'ras-el-hikma', name: 'Ras El Hikma', nameAr: 'رأس الحكمة', region: 'north_coast', description: 'Ultra-premium North Coast location backed by $35B UAE investment.', descriptionAr: 'موقع فائق التميز بالساحل الشمالي مدعوم باستثمار إماراتي 35 مليار دولار.' },
  { slug: 'madinaty', name: 'Madinaty', nameAr: 'مدينتي', region: 'cairo', description: "TMG's flagship compound city in New Cairo with full amenities.", descriptionAr: 'مدينة مجمع طلعت مصطفى الرائدة بالقاهرة الجديدة بجميع المرافق.' },
  { slug: 'shorouk', name: 'Shorouk City', nameAr: 'مدينة الشروق', region: 'cairo', description: 'Established satellite city near New Cairo with mid-range options.', descriptionAr: 'مدينة فرعية قائمة بالقرب من القاهرة الجديدة بخيارات متوسطة.' },
  { slug: 'ain-sokhna', name: 'Ain Sokhna', nameAr: 'العين السخنة', region: 'red_sea', description: 'Red Sea resort town, popular for weekend escapes from Cairo.', descriptionAr: 'مدينة منتجعية على البحر الأحمر، شائعة لعطلات نهاية الأسبوع.' },
  { slug: 'gouna', name: 'El Gouna', nameAr: 'الجونة', region: 'red_sea', description: "Orascom's flagship resort town on the Red Sea.", descriptionAr: 'مدينة المنتجع الرائدة لأوراسكوم على البحر الأحمر.' },
  { slug: 'mostakbal-city', name: 'Mostakbal City', nameAr: 'مدينة المستقبل', region: 'cairo', description: 'New smart city development east of New Cairo.', descriptionAr: 'تطوير مدينة ذكية جديدة شرق القاهرة الجديدة.' },
];

/** Lookup location by slug. */
export function getLocationBySlug(slug: string): LocationMeta | undefined {
  return LOCATIONS.find((l) => l.slug === slug);
}

/** Default ROI data for seeding and display before real data is available. */
export const DEFAULT_LOCATION_ROI: Record<string, Omit<LocationROI, 'location' | 'locationAr' | 'slug' | 'region'>> = {
  'new-cairo':       { avgPricePerSqm: 55_000, priceChange1y: 22, priceChange3y: 65, priceChange5y: 140, rentalYieldPercent: 7.2, liquidityScore: 85, demandIndex: 92 },
  'sheikh-zayed':    { avgPricePerSqm: 48_000, priceChange1y: 18, priceChange3y: 55, priceChange5y: 120, rentalYieldPercent: 6.8, liquidityScore: 78, demandIndex: 85 },
  '6th-october':     { avgPricePerSqm: 32_000, priceChange1y: 15, priceChange3y: 48, priceChange5y: 110, rentalYieldPercent: 8.0, liquidityScore: 72, demandIndex: 75 },
  'new-capital':     { avgPricePerSqm: 38_000, priceChange1y: 35, priceChange3y: 90, priceChange5y: 200, rentalYieldPercent: 5.5, liquidityScore: 55, demandIndex: 88 },
  'new-capital-r5':  { avgPricePerSqm: 34_000, priceChange1y: 30, priceChange3y: 80, priceChange5y: 180, rentalYieldPercent: 5.0, liquidityScore: 50, demandIndex: 82 },
  'new-capital-r7':  { avgPricePerSqm: 42_000, priceChange1y: 38, priceChange3y: 95, priceChange5y: 220, rentalYieldPercent: 5.8, liquidityScore: 58, demandIndex: 90 },
  'new-capital-r8':  { avgPricePerSqm: 36_000, priceChange1y: 32, priceChange3y: 85, priceChange5y: 190, rentalYieldPercent: 5.2, liquidityScore: 52, demandIndex: 84 },
  'north-coast':     { avgPricePerSqm: 65_000, priceChange1y: 25, priceChange3y: 70, priceChange5y: 160, rentalYieldPercent: 4.5, liquidityScore: 45, demandIndex: 78 },
  'new-alamein':     { avgPricePerSqm: 50_000, priceChange1y: 40, priceChange3y: 100, priceChange5y: 250, rentalYieldPercent: 4.0, liquidityScore: 40, demandIndex: 80 },
  'ras-el-hikma':    { avgPricePerSqm: 80_000, priceChange1y: 50, priceChange3y: 120, priceChange5y: 300, rentalYieldPercent: 3.5, liquidityScore: 35, demandIndex: 95 },
  'madinaty':        { avgPricePerSqm: 42_000, priceChange1y: 20, priceChange3y: 60, priceChange5y: 130, rentalYieldPercent: 7.5, liquidityScore: 88, demandIndex: 80 },
  'shorouk':         { avgPricePerSqm: 25_000, priceChange1y: 12, priceChange3y: 40, priceChange5y: 90,  rentalYieldPercent: 9.0, liquidityScore: 65, demandIndex: 60 },
};
