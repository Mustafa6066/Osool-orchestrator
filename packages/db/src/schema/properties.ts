import { pgTable, uuid, text, timestamp, varchar, integer, numeric, boolean, jsonb, index, customType } from 'drizzle-orm/pg-core';

/**
 * Custom pgvector type — requires the vector extension to be enabled.
 * Coordinate with Railway support to run: CREATE EXTENSION IF NOT EXISTS vector;
 */
const vector = customType<{ data: number[]; driverData: string }>({
  dataType(config) {
    return `vector(${(config as { dimensions?: number } | undefined)?.dimensions ?? 1536})`;
  },
  fromDriver(value: string) {
    return value.slice(1, -1).split(',').map(Number);
  },
  toDriver(value: number[]) {
    return `[${value.join(',')}]`;
  },
});

export const developers = pgTable('developers', {
  id: varchar('id', { length: 100 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  nameAr: varchar('name_ar', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).unique().notNull(),
  founded: integer('founded'),
  projectCount: integer('project_count').default(0),
  avgDeliveryRatePercent: integer('avg_delivery_rate_percent'),
  avgPricePerSqm: integer('avg_price_per_sqm'),
  regions: jsonb('regions').$type<string[]>().default([]),
  tier: varchar('tier', { length: 50 }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const properties = pgTable('properties', {
  id: uuid('id').primaryKey().defaultRandom(),
  developerId: varchar('developer_id', { length: 100 }).references(() => developers.id).notNull(),
  projectName: varchar('project_name', { length: 500 }).notNull(),
  projectNameAr: varchar('project_name_ar', { length: 500 }),
  slug: varchar('slug', { length: 500 }).unique().notNull(),
  propertyType: varchar('property_type', { length: 100 }).notNull(),
  location: varchar('location', { length: 255 }).notNull(),
  locationAr: varchar('location_ar', { length: 255 }),
  region: varchar('region', { length: 100 }),
  priceMin: numeric('price_min', { precision: 15, scale: 2 }),
  priceMax: numeric('price_max', { precision: 15, scale: 2 }),
  areaMin: integer('area_min'),
  areaMax: integer('area_max'),
  bedrooms: integer('bedrooms'),
  bathrooms: integer('bathrooms'),
  deliveryDate: varchar('delivery_date', { length: 50 }),
  installmentYears: integer('installment_years'),
  downPaymentPercent: integer('down_payment_percent'),
  description: text('description'),
  descriptionAr: text('description_ar'),
  amenities: jsonb('amenities').$type<string[]>().default([]),
  images: jsonb('images').$type<string[]>().default([]),
  nawyUrl: text('nawy_url'),
  featured: boolean('featured').default(false),
  active: boolean('active').default(true),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  /**
   * 1536-dimensional pgvector embedding for semantic similarity search.
   * Populated asynchronously by the embed-backfill BullMQ job.
   * Requires CREATE EXTENSION IF NOT EXISTS vector on the Postgres instance.
   */
  embedding: vector('embedding', { dimensions: 1536 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('idx_properties_developer').on(table.developerId),
  index('idx_properties_location').on(table.location),
  index('idx_properties_type').on(table.propertyType),
  index('idx_properties_price').on(table.priceMin, table.priceMax),
]);
