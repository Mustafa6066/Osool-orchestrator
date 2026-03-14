# Deployment Guide

## Prerequisites

| Requirement | Minimum Version |
|------------|----------------|
| Node.js | 20.x |
| npm | 10.x |
| PostgreSQL | 16.x |
| Redis | 7.x |

---

## Option A: Railway (Recommended)

Railway handles PostgreSQL and Redis as managed add-ons. This is the fastest path to production.

### Step 1 — Connect Repository

1. Log in at [railway.app](https://railway.app)
2. Create a new project → **Deploy from GitHub**
3. Point to this repository root (`osool-orchestrator/`)

### Step 2 — Add Managed Services

In your Railway project dashboard:

- Click **New** → **Database** → **PostgreSQL** — Railway populates `DATABASE_URL` automatically
- Click **New** → **Database** → **Redis** — Railway populates `REDIS_URL` automatically

### Step 3 — Set Environment Variables

Go to your API service → **Variables** and add:

```env
# ─ Core ──────────────────────────────────────────────────────
NODE_ENV=production
PORT=4000
API_SECRET=<generate with: openssl rand -hex 32>
JWT_SECRET=<generate with: openssl rand -hex 32>
JWT_REFRESH_SECRET=<generate with: openssl rand -hex 32>

# ─ Provided by Railway add-ons ───────────────────────────────
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}

# ─ AI ────────────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...

# ─ Email ─────────────────────────────────────────────────────
RESEND_API_KEY=re_...
FROM_EMAIL=no-reply@osool.ai

# ─ Ads ───────────────────────────────────────────────────────
META_ACCESS_TOKEN=...
META_AD_ACCOUNT_ID=act_...
META_PIXEL_ID=...

GOOGLE_ADS_DEVELOPER_TOKEN=...
GOOGLE_ADS_CLIENT_ID=...
GOOGLE_ADS_CLIENT_SECRET=...
GOOGLE_ADS_REFRESH_TOKEN=...
GOOGLE_ADS_CUSTOMER_ID=...

# ─ Analytics ─────────────────────────────────────────────────
POSTHOG_API_KEY=phc_...
POSTHOG_HOST=https://app.posthog.com

# ─ Frontend origin (CORS) ───────────────────────────────────
ALLOWED_ORIGINS=https://osool-ten.vercel.app,https://admin.osool.ai
```

### Step 4 — Configure railway.toml

The `railway.toml` already exists in `apps/api/`. Ensure it points to the right build and start commands:

```toml
[build]
  builder = "nixpacks"
  buildCommand = "npm run build"

[deploy]
  startCommand = "npm run start"
  healthcheckPath = "/health"
  healthcheckTimeout = 30
  restartPolicyType = "on-failure"
  restartPolicyMaxRetries = 3
```

### Step 5 — Run Migrations

After first deploy, open a Railway shell:

```bash
npx drizzle-kit push --config drizzle.config.ts
```

Or via the Railway CLI:

```bash
railway run npx drizzle-kit push --config drizzle.config.ts
```

### Step 6 — Create Admin User

```bash
railway run npx tsx scripts/create-admin.ts admin@osool.ai <strong-password>
```

---

## Option B: Docker Compose (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp RAILWAY_ENV_TEMPLATE.txt .env
# Edit .env and fill in your secrets

# 3. Start PostgreSQL + Redis
docker compose -f docker-compose.yml up -d

# 4. Wait for postgres readiness (about 10s)
sleep 10

# 5. Run migrations
npx drizzle-kit push --config apps/api/drizzle.config.ts

# 6. Seed initial data (optional)
npx tsx apps/api/src/db/seed.ts

# 7. Create admin user
npx tsx scripts/create-admin.ts admin@osool.ai mypassword

# 8. Start API
npm run dev --workspace=apps/api

# 9. Start Admin UI (separate terminal)
npm run dev --workspace=apps/admin
```

Or use the automated setup script:

```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

---

## Option C: Full Docker Production

```bash
# Build production image
docker build -f apps/api/Dockerfile.prod -t osool-api:latest apps/api/

# Run
docker run -d \
  --name osool-api \
  -p 4000:4000 \
  --env-file .env \
  osool-api:latest
```

---

## Environment Variables Reference

All variables read in `apps/api/src/config.ts`:

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | `development` or `production` |
| `PORT` | No | API port (default: 4000) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `JWT_SECRET` | Yes | JWT signing secret (min 32 chars) |
| `JWT_REFRESH_SECRET` | Yes | Refresh token secret (min 32 chars) |
| `API_SECRET` | Yes | Shared webhook auth secret |
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `RESEND_API_KEY` | Yes | Resend email API key |
| `FROM_EMAIL` | No | Sender address (default: no-reply@osool.ai) |
| `META_ACCESS_TOKEN` | No | Meta Marketing API token |
| `META_AD_ACCOUNT_ID` | No | Meta Ad Account (format: `act_123`) |
| `META_PIXEL_ID` | No | Meta Pixel ID |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | No | Google Ads developer token |
| `GOOGLE_ADS_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_ADS_CLIENT_SECRET` | No | Google OAuth client secret |
| `GOOGLE_ADS_REFRESH_TOKEN` | No | Google OAuth refresh token |
| `GOOGLE_ADS_CUSTOMER_ID` | No | Google Ads customer ID |
| `POSTHOG_API_KEY` | No | PostHog project API key |
| `POSTHOG_HOST` | No | PostHog host URL |
| `ALLOWED_ORIGINS` | No | Comma-separated CORS origins |

---

## Deploying the Admin Dashboard

The admin dashboard (`apps/admin/`) is a static Vite build that can be deployed to Vercel or any CDN.

### Vercel

1. Import the `osool-orchestrator` repository on Vercel
2. Set **Root Directory** to `apps/admin`
3. Add environment variable:
   ```env
   VITE_API_URL=https://your-railway-api-url.railway.app
   ```
4. Deploy. Vercel handles the build (`npm run build`) automatically.

### Environment Variables for Admin UI

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Base URL of the Orchestrator API |

---

## Database Migrations

Drizzle Kit manages migrations:

```bash
# Generate migration files from schema changes
npx drizzle-kit generate --config apps/api/drizzle.config.ts

# Apply migrations
npx drizzle-kit push --config apps/api/drizzle.config.ts

# View current schema state
npx drizzle-kit introspect --config apps/api/drizzle.config.ts
```

---

## Health Check

```bash
curl https://your-api.railway.app/health
# → {"status":"ok","db":"ok","redis":"ok","queues":{"intentProcessing":"ready",...}}
```

A non-200 response or `"db":"error"` indicates a connection problem. Railway will restart the container automatically based on the health check config in `railway.toml`.

---

## BullMQ Dashboard (Bull Board)

Bull Board is mounted at `/admin/queues` (protected by the same JWT auth). To view queue state:

1. Log in to the Admin UI at your admin URL
2. Navigate to **Queues** in the sidebar

Or access the raw API: `GET /admin/queues` with `Authorization: Bearer <token>`.

---

## Monitoring

- **Structured logs**: Pino JSON logs sent to stdout — Railway captures and displays these in the deploy logs tab.
- **Queue health**: Polled by the admin dashboard (Agents page) every 30s via `GET /admin/agents`.
- **PostHog**: Funnel events and intents tracked automatically if `POSTHOG_API_KEY` is set.
- **Uptime**: Set up a Railway cron or an external ping service (e.g., UptimeRobot) against `/health`.

---

## Rollback

Railway keeps the last 5 successful deployments. To rollback:

1. Railway dashboard → **Deployments**
2. Find the last good deploy → click **Rollback**

For database changes, create a reverse migration before rollback:

```bash
npx drizzle-kit generate --config apps/api/drizzle.config.ts
# Edit the generated file to reverse the schema change
npx drizzle-kit push --config apps/api/drizzle.config.ts
```
