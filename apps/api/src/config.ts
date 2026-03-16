/**
 * Validated environment configuration for the Orchestrator API.
 * Fail-fast on startup if required variables are missing.
 */

import { z } from 'zod';

const schema = z.object({
  // App
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // AI
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),

  // Email
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().email().default('noreply@osool.ai'),

  // Admin Auth (JWT) — required in production, optional in dev
  ADMIN_JWT_SECRET: z.string().min(32, 'ADMIN_JWT_SECRET must be at least 32 characters').optional()
    .refine(
      (val) => !!val || process.env.NODE_ENV !== 'production',
      'ADMIN_JWT_SECRET is required in production',
    ),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD_HASH: z.string().optional(),

  // Osool backend URL (used to proxy admin login)
  OSOOL_API_URL: z.string().url().default('https://osool-production.up.railway.app'),

  // Osool Platform JWT secret (same key as backend's JWT_SECRET_KEY) — enables SSO-lite
  PLATFORM_JWT_SECRET: z.string().min(32).optional(),

  // Webhook + Data API security — required in production, optional in dev
  WEBHOOK_SECRET: z.string().min(16, 'WEBHOOK_SECRET must be at least 16 characters').optional()
    .refine(
      (val) => !!val || process.env.NODE_ENV !== 'production',
      'WEBHOOK_SECRET is required in production',
    ),
  API_KEY: z.string().min(16, 'API_KEY must be at least 16 characters').optional(),

  // CORS origins (comma-separated)
  ALLOWED_ORIGINS: z.string().default('https://osool-ten.vercel.app,https://osooladmin-production.up.railway.app,http://localhost:3000,http://localhost:5173,http://localhost:3001'),

  // Meta Ads (optional)
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_ACCESS_TOKEN: z.string().optional(),
  META_AD_ACCOUNT_ID: z.string().optional(),

  // Google Ads (optional)
  GOOGLE_ADS_CLIENT_ID: z.string().optional(),
  GOOGLE_ADS_CLIENT_SECRET: z.string().optional(),
  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().optional(),
  GOOGLE_ADS_REFRESH_TOKEN: z.string().optional(),
  GOOGLE_ADS_CUSTOMER_ID: z.string().optional(),

  // PostHog (optional)
  POSTHOG_API_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().default('https://app.posthog.com'),

  // WhatsApp (optional)
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),

  // Timezone
  CAIRO_TIMEZONE: z.string().default('Africa/Cairo'),
});

let _config: z.infer<typeof schema>;

export function getConfig() {
  if (!_config) {
    const result = schema.safeParse(process.env);
    if (!result.success) {
      console.error('❌ Invalid environment configuration:');
      for (const err of result.error.errors) {
        console.error(`  ${err.path.join('.')}: ${err.message}`);
      }
      process.exit(1);
    }
    _config = result.data;
  }
  return _config;
}

export type Config = z.infer<typeof schema>;

/** Resolved allowed origins array from comma-separated env string. */
export function getAllowedOrigins(): string[] {
  return getConfig()
    .ALLOWED_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}
