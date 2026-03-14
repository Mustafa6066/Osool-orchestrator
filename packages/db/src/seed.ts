import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DEVELOPERS } from '@osool/shared';
import { developers, properties, keywords, emailSequences } from './schema/index.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

async function seed() {
  const client = postgres(DATABASE_URL!);
  const db = drizzle(client);

  console.log('Seeding developers...');
  for (const dev of DEVELOPERS) {
    await db.insert(developers).values({
      id: dev.id,
      name: dev.name,
      nameAr: dev.nameAr,
      slug: dev.slug,
      founded: dev.founded,
      projectCount: dev.projectCount,
      avgDeliveryRatePercent: dev.avgDeliveryRatePercent,
      avgPricePerSqm: dev.avgPricePerSqm,
      regions: dev.regions,
      tier: dev.tier,
    }).onConflictDoNothing();
  }
  console.log(`  ✓ ${DEVELOPERS.length} developers seeded`);

  console.log('Seeding sample properties...');
  const sampleProperties = [
    { developerId: 'emaar', projectName: 'Mivida', projectNameAr: 'ميفيدا', slug: 'emaar-mivida-new-cairo', propertyType: 'villa', location: 'New Cairo', locationAr: 'القاهرة الجديدة', region: 'cairo', priceMin: '8000000', priceMax: '25000000', areaMin: 200, areaMax: 500, bedrooms: 4, deliveryDate: '2025-Q2', installmentYears: 8, downPaymentPercent: 10 },
    { developerId: 'emaar', projectName: 'Marassi', projectNameAr: 'مراسي', slug: 'emaar-marassi-north-coast', propertyType: 'chalet', location: 'North Coast', locationAr: 'الساحل الشمالي', region: 'north_coast', priceMin: '5000000', priceMax: '15000000', areaMin: 100, areaMax: 300, bedrooms: 3, deliveryDate: '2025-Q4', installmentYears: 7, downPaymentPercent: 10 },
    { developerId: 'sodic', projectName: 'The Estates', projectNameAr: 'ذا إستيتس', slug: 'sodic-the-estates-sheikh-zayed', propertyType: 'villa', location: 'Sheikh Zayed', locationAr: 'الشيخ زايد', region: 'giza', priceMin: '12000000', priceMax: '35000000', areaMin: 250, areaMax: 600, bedrooms: 5, deliveryDate: '2026-Q1', installmentYears: 8, downPaymentPercent: 10 },
    { developerId: 'mountain_view', projectName: 'iCity', projectNameAr: 'آي سيتي', slug: 'mountain-view-icity-new-cairo', propertyType: 'apartment', location: 'New Cairo', locationAr: 'القاهرة الجديدة', region: 'cairo', priceMin: '3500000', priceMax: '8000000', areaMin: 100, areaMax: 220, bedrooms: 3, deliveryDate: '2025-Q3', installmentYears: 7, downPaymentPercent: 10 },
    { developerId: 'tmg', projectName: 'Noor City', projectNameAr: 'نور سيتي', slug: 'tmg-noor-city-new-capital', propertyType: 'apartment', location: 'New Administrative Capital', locationAr: 'العاصمة الإدارية', region: 'new_capital', priceMin: '1800000', priceMax: '4500000', areaMin: 80, areaMax: 180, bedrooms: 2, deliveryDate: '2027-Q1', installmentYears: 10, downPaymentPercent: 5 },
    { developerId: 'ora', projectName: 'ZED East', projectNameAr: 'زد إيست', slug: 'ora-zed-east-new-cairo', propertyType: 'apartment', location: 'New Cairo', locationAr: 'القاهرة الجديدة', region: 'cairo', priceMin: '4000000', priceMax: '12000000', areaMin: 100, areaMax: 280, bedrooms: 3, deliveryDate: '2026-Q2', installmentYears: 8, downPaymentPercent: 10 },
    { developerId: 'palm_hills', projectName: 'Badya', projectNameAr: 'بادية', slug: 'palm-hills-badya-6th-october', propertyType: 'townhouse', location: '6th of October', locationAr: '6 أكتوبر', region: 'giza', priceMin: '5500000', priceMax: '14000000', areaMin: 180, areaMax: 350, bedrooms: 4, deliveryDate: '2026-Q3', installmentYears: 9, downPaymentPercent: 10 },
    { developerId: 'tatweer_misr', projectName: 'Il Monte Galala', projectNameAr: 'المونت جلالة', slug: 'tatweer-misr-il-monte-galala', propertyType: 'chalet', location: 'Ain Sokhna', locationAr: 'العين السخنة', region: 'red_sea', priceMin: '3000000', priceMax: '9000000', areaMin: 90, areaMax: 200, bedrooms: 2, deliveryDate: '2025-Q4', installmentYears: 8, downPaymentPercent: 10 },
    { developerId: 'city_edge', projectName: 'New Alamein Towers', projectNameAr: 'أبراج العلمين الجديدة', slug: 'city-edge-new-alamein-towers', propertyType: 'apartment', location: 'New Alamein', locationAr: 'العلمين الجديدة', region: 'north_coast', priceMin: '2500000', priceMax: '7000000', areaMin: 70, areaMax: 160, bedrooms: 2, deliveryDate: '2026-Q1', installmentYears: 7, downPaymentPercent: 15 },
    { developerId: 'hassan_allam', projectName: 'Swan Lake Residences', projectNameAr: 'سوان ليك ريزيدنسز', slug: 'hassan-allam-swan-lake-new-cairo', propertyType: 'villa', location: 'New Cairo', locationAr: 'القاهرة الجديدة', region: 'cairo', priceMin: '15000000', priceMax: '40000000', areaMin: 300, areaMax: 700, bedrooms: 5, deliveryDate: '2025-Q1', installmentYears: 6, downPaymentPercent: 15 },
  ];

  for (const prop of sampleProperties) {
    await db.insert(properties).values(prop).onConflictDoNothing();
  }
  console.log(`  ✓ ${sampleProperties.length} properties seeded`);

  console.log('Seeding keywords...');
  const sampleKeywords = [
    { keyword: 'new capital compounds', keywordAr: 'كمبوندات العاصمة الإدارية', slug: 'new-capital-compounds', cluster: 'new_capital', searchVolume: 12000, difficulty: 45, intent: 'informational' },
    { keyword: 'emaar vs sodic', keywordAr: 'إعمار مقابل سوديك', slug: 'emaar-vs-sodic', cluster: 'developer_comparison', searchVolume: 5500, difficulty: 35, intent: 'comparison' },
    { keyword: 'best ROI areas egypt 2025', keywordAr: 'أفضل مناطق عائد استثمار مصر 2025', slug: 'best-roi-areas-egypt-2025', cluster: 'roi_analysis', searchVolume: 8000, difficulty: 50, intent: 'investment' },
    { keyword: 'north coast properties for sale', keywordAr: 'عقارات الساحل الشمالي للبيع', slug: 'north-coast-properties-for-sale', cluster: 'north_coast', searchVolume: 15000, difficulty: 55, intent: 'transactional' },
    { keyword: 'mountain view icity prices', keywordAr: 'أسعار ماونتن فيو آي سيتي', slug: 'mountain-view-icity-prices', cluster: 'pricing', searchVolume: 9000, difficulty: 40, intent: 'transactional' },
    { keyword: 'ras el hikma investment', keywordAr: 'استثمار رأس الحكمة', slug: 'ras-el-hikma-investment', cluster: 'ras_el_hikma', searchVolume: 20000, difficulty: 60, intent: 'investment' },
    { keyword: 'first time buyer egypt guide', keywordAr: 'دليل المشتري لأول مرة مصر', slug: 'first-time-buyer-egypt-guide', cluster: 'guides', searchVolume: 6000, difficulty: 30, intent: 'informational' },
    { keyword: 'new cairo apartment prices 2025', keywordAr: 'أسعار شقق القاهرة الجديدة 2025', slug: 'new-cairo-apartment-prices-2025', cluster: 'pricing', searchVolume: 11000, difficulty: 48, intent: 'transactional' },
  ];

  for (const kw of sampleKeywords) {
    await db.insert(keywords).values(kw).onConflictDoNothing();
  }
  console.log(`  ✓ ${sampleKeywords.length} keywords seeded`);

  console.log('Seeding email sequences...');
  await db.insert(emailSequences).values([
    {
      name: 'Expat Investor Nurture',
      icpSegment: 'expat_investor',
      triggerScore: 60,
      steps: [
        { delayHours: 0, subject: 'Your Egyptian Real Estate Investment Guide', templateId: 'expat-welcome', channel: 'email' as const },
        { delayHours: 48, subject: 'Top 5 ROI Areas in Egypt 2025', templateId: 'expat-roi-guide', channel: 'email' as const },
        { delayHours: 120, subject: 'Exclusive: New Capital Developments Update', templateId: 'expat-new-capital', channel: 'email' as const },
        { delayHours: 240, subject: 'Your Personalized Investment Report', templateId: 'expat-personalized', channel: 'email' as const },
      ],
      active: true,
    },
    {
      name: 'First-Time Buyer Journey',
      icpSegment: 'first_time_buyer',
      triggerScore: 50,
      steps: [
        { delayHours: 0, subject: 'Welcome! Your First Home Buying Guide', templateId: 'ftb-welcome', channel: 'email' as const },
        { delayHours: 24, subject: 'Understanding Payment Plans in Egypt', templateId: 'ftb-payment-plans', channel: 'email' as const },
        { delayHours: 72, subject: 'Best Areas for New Buyers in 2025', templateId: 'ftb-best-areas', channel: 'email' as const },
        { delayHours: 168, subject: 'Ready to Schedule a Viewing?', templateId: 'ftb-viewing-cta', channel: 'email' as const },
      ],
      active: true,
    },
  ]).onConflictDoNothing();
  console.log('  ✓ 2 email sequences seeded');

  await client.end();
  console.log('\n✅ Seed complete!');
}

seed().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
