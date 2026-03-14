# Architecture Overview

## System Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     User Browser                                │
│  osool-ten.vercel.app (Next.js — UNTOUCHED)                    │
│  └── fires webhooks → POST /webhook/*                          │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP POST (fire-and-forget)
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              Osool Orchestrator API (Fastify 4)                 │
│  Railway / Docker containers                                    │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ /webhook/*  │  │  /admin/*    │  │  /data/*           │    │
│  │  5 routes   │  │  15 routes   │  │  6 public routes   │    │
│  │  JWT-free   │  │  JWT-gated   │  │  cached GET        │    │
│  └──────┬──────┘  └──────────────┘  └────────────────────┘    │
│         │                                                       │
│         ▼ enqueues jobs                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 BullMQ Job Queues (Redis)                │   │
│  │  intent-processing  │  lead-scoring  │  email-send      │   │
│  │  audience-sync      │  seo-content   │  email-trigger   │   │
│  │  feedback-loop      │  market-pulse                      │   │
│  └───────────┬─────────────────────────────────────────────┘   │
│              │                                                  │
│              ▼ processed by                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                BullMQ Workers (same process)            │   │
│  │  8 workers × job handlers                               │   │
│  │  Scheduled: market-pulse (hourly), feedback (6h)        │   │
│  └───────────┬─────────────────────────────────────────────┘   │
│              │                                                  │
│              ▼ calls                                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Autonomous Agents                     │   │
│  │  NexusAgent     MarketingAgent    IntegrationAgent      │   │
│  │  (market pulse) (ads + SEO)       (scoring + email)     │   │
│  └───────────┬─────────────────────────────────────────────┘   │
│              │                                                  │
│    ┌─────────┴──────────┬──────────────┬──────────────────┐   │
│    ▼                    ▼              ▼                  ▼   │
│  PostgreSQL          Redis          Resend           Anthropic │
│  (Drizzle ORM)       (cache+queue)  (email)          (Claude) │
│    │                                                          │
│    ▼                                                          │
│  Meta Ads API    Google Ads API    PostHog                    │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              Admin Dashboard (React + Vite)                     │
│  http://localhost:5173 / admin.osool.ai                        │
│  Reads from /admin/* API endpoints with JWT Bearer token       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer Responsibilities

### 1. REST API (Fastify)

- **Webhook routes** — ingest events from frontend, enqueue jobs immediately, return 200 fast
- **Admin routes** — serve dashboard data to internal admin UI; JWT-gated 
- **Data routes** — serve cached read-only data (developers, SEO content, trending)
- **Health route** — liveness probe for Railway/Docker

### 2. BullMQ Queues + Workers

8 queues back 8 workers. Workers run in the same process as the API (single dyno).

| Queue | Worker | Handler | Trigger |
|-------|---------|---------|---------|
| `intent-processing` | intent | `process-intent.job.ts` | Webhook: chat message |
| `lead-scoring` | scoring | `score-lead.job.ts` | After intent, session end |
| `audience-sync` | audience | `sync-audience.job.ts` | After scoring, schedule |
| `seo-content-gen` | seo | `generate-seo-content.job.ts` | Marketing agent |
| `email-send` | emailSend | `send-email.job.ts` | Email trigger check |
| `email-trigger` | emailTrigger | `check-email-triggers.job.ts` | After scoring |
| `feedback-loop` | feedbackLoop | `run-feedback-loop.job.ts` | Every 6h, agents |
| `market-pulse` | marketPulse | `market-pulse.job.ts` | Every hour |

### 3. Autonomous Agents

Agents are stateful orchestrators backed by Redis for status/log storage.

| Agent | Responsibility |
|-------|----------------|
| `NexusAgent` | Enqueues hourly market-pulse; trending aggregation |
| `MarketingAgent` | Syncs all audiences, schedules SEO content, triggers performance feedback |
| `IntegrationAgent` | Scores all recent sessions, evaluates email triggers for each |

All agents extend `BaseAgent` which provides `execute()`, `logToRedis()`, `setStatus()`, `getStatus()`.

### 4. Workflows

Workflow files are thin orchestrators — they only enqueue jobs. They don't contain business logic.

| Workflow | Business Process |
|---------|-----------------|
| `intent-processing.workflow.ts` | Chat message → intent → score → email trigger |
| `lead-scoring.workflow.ts` | Score → optionally sync audiences + eval email triggers |
| `page-content-generation.workflow.ts` | Generate SEO page → run keyword feedback loop |
| `email-sequence.workflow.ts` | Trigger evaluation → email send |
| `audience-sync.workflow.ts` | Multi-platform audience sync |
| `feedback-loop.workflow.ts` | All 5 feedback loop types, staggered |

### 5. Services

Domain services provide typed DB query helpers. They do not call external APIs or enqueue jobs.

| Service | Tables |
|---------|--------|
| `intent.service.ts` | intentSignals, chatSessions |
| `lead.service.ts` | intentSignals, funnelEvents, waitlist |
| `campaign.service.ts` | campaigns, campaignMetrics, retargetingAudiences |
| `email.service.ts` | emailSequences, emailSends |
| `seo-content.service.ts` | seoContent, keywords, seoPages |
| `funnel.service.ts` | funnelEvents, chatSessions |
| `feedback-loop.service.ts` | feedbackLoopEvents |
| `analytics.service.ts` | All tables (aggregation only) |

---

## Database Schema (Key Tables)

```
users                  → admin accounts + identified visitors
developers             → Egyptian RE developer registry
properties             → property listings
keywords               → SEO keyword targets
seoPages               → generated page metadata
seoContent             → AI-generated content versions
chatSessions           → chat session state
chatMessages           → chat message history
campaigns              → Meta/Google ad campaigns
campaignMetrics        → daily performance metrics
retargetingAudiences   → audience definitions per platform
intentSignals          → parsed intent per session
funnelEvents           → raw funnel event log
emailSequences         → drip sequence definitions
emailSends             → sent email records
waitlist               → email waitlist
feedbackLoopEvents     → feedback loop execution log
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 + TypeScript 5 |
| API | Fastify 4 |
| ORM | Drizzle + drizzle-kit |
| Database | PostgreSQL 16 |
| Queue | BullMQ 5 |
| Cache | Redis 7 ioredis |
| AI | Anthropic claude-sonnet-4-20250514 |
| Email | Resend SDK |
| Analytics | PostHog |
| Auth | JWT + bcryptjs |
| Admin UI | React 18 + Vite + Tailwind CSS |
| Monorepo | Turborepo + npm workspaces |
| Deploy | Railway (API) + Vercel (Admin UI) |
