# Osool CoInvestor Platform

Production-grade autonomous Marketing & SEO orchestration platform for Egyptian real estate co-investment.

## Architecture

```
osool-platform/
├── apps/
│   ├── orchestrator/   # Fastify + tRPC API, AI agents, BullMQ workers
│   ├── web/            # Next.js 14 SEO frontend (en/ar i18n)
│   └── admin/          # React + Vite admin dashboard
├── packages/
│   ├── shared/         # Types, constants, utility functions
│   └── db/             # Drizzle ORM schema, migrations, seed
└── .github/workflows/  # CI pipeline
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo + npm workspaces |
| Language | TypeScript 5.7, ESM |
| Backend | Fastify 4, tRPC 11, BullMQ 5, ioredis |
| Frontend | Next.js 14 (App Router, ISR), next-intl (en/ar) |
| Admin | React 18, Vite 5, recharts |
| Database | PostgreSQL 16 (Drizzle ORM), Redis 7 |
| AI | Anthropic Claude (claude-sonnet-4-20250514) |
| Auth | Clerk |
| Email | Resend |
| Analytics | PostHog |
| CI/CD | GitHub Actions |

## Prerequisites

- Node.js >= 20
- PostgreSQL 16
- Redis 7
- npm 10+

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url> && cd osool-platform
npm install

# 2. Copy env and configure
cp .env.example .env
# Edit .env with your API keys

# 3. Start infrastructure
docker compose up -d postgres redis

# 4. Push schema and seed
npm run db:push
npm run db:seed

# 5. Start all apps in dev mode
npm run dev
```

Services start on:
- **Orchestrator API**: http://localhost:4000
- **Web (Next.js)**: http://localhost:3000
- **Admin Dashboard**: http://localhost:3001

## Development

```bash
# Run all tests
npm test

# Type-check all packages
npm run type-check

# Build all packages/apps
npm run build

# Run specific app
npx turbo dev --filter=@osool/web
npx turbo dev --filter=@osool/orchestrator

# Database operations
npm run db:generate   # Generate migration
npm run db:migrate    # Run migrations
npm run db:seed       # Seed sample data
```

## Project Structure

### packages/shared
Shared TypeScript types, constants, and utilities:
- **Types**: ICP segments, intent signals, keywords, properties, campaigns, funnel events
- **Constants**: 14 Egyptian developers, 15+ locations with ROI data, 4 ICP segments
- **Utils**: Lead scoring (0-100), bilingual slug generation, EGP/USD currency formatting

### packages/db
Drizzle ORM database layer:
- **Schema**: users, properties, developers, keywords, SEO pages, chat sessions/messages, campaigns, funnel events, email sequences, waitlist, intent signals
- **Seed**: Sample developers, properties, keywords, email sequences

### apps/orchestrator
Fastify + tRPC backend with AI agents:
- **Chat Agent**: Claude-powered real estate advisor with conversation memory
- **SEO Agent**: AI-generated pages (developer profiles, area guides, comparisons, ROI analysis, buying guides)
- **Intent Agent**: Visitor intent classification and lead scoring
- **Jobs**: BullMQ workers for SEO generation, lead scoring, email nurture
- **Routes**: chat, properties, seo, funnel (all tRPC)

### apps/web
Next.js 14 SEO-optimized frontend:
- Bilingual (English + Arabic with RTL)
- ISR for developer and area pages
- AI chat widget
- Developer comparison pages
- Waitlist signup with lead qualification

### apps/admin
React admin dashboard:
- Overview metrics with charts
- Funnel analytics
- SEO page management
- Chat session monitoring
- Waitlist management

## Docker Deployment

```bash
# Full stack
docker compose up -d

# Production build
docker compose -f docker-compose.yml up -d --build
```

## Environment Variables

See `.env.example` for the full list. Key variables:

| Variable | Description |
|---------|------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `ANTHROPIC_API_KEY` | Claude API key |
| `CLERK_SECRET_KEY` | Clerk authentication |
| `RESEND_API_KEY` | Email sending |
| `POSTHOG_API_KEY` | Analytics |

## License

Private — All rights reserved.
