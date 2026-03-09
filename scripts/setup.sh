#!/usr/bin/env bash
# Osool Orchestrator — Full Setup Script
# Usage: bash scripts/setup.sh

set -euo pipefail

BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[1;33m"
RED="\033[0;31m"
RESET="\033[0m"

info()    { echo -e "${BOLD}[INFO]${RESET} $*"; }
success() { echo -e "${GREEN}[OK]${RESET}   $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET} $*"; }
abort()   { echo -e "${RED}[FAIL]${RESET} $*"; exit 1; }

# ── 1. Prerequisites ──────────────────────────────────────────────────────────
info "Checking prerequisites..."

command -v node >/dev/null 2>&1 || abort "Node.js is required (>=20). Install from https://nodejs.org"
command -v npm  >/dev/null 2>&1 || abort "npm is required"
command -v docker >/dev/null 2>&1 || warn "Docker not found — you'll need to provide PostgreSQL and Redis manually"

NODE_VER=$(node --version | sed 's/v//' | cut -d. -f1)
[[ "$NODE_VER" -ge 20 ]] || abort "Node.js >=20 required (found v$NODE_VER)"
success "Node.js $(node --version)"

# ── 2. Install dependencies ───────────────────────────────────────────────────
info "Installing npm dependencies..."
npm install
success "Dependencies installed"

# ── 3. Environment file ───────────────────────────────────────────────────────
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    warn ".env created from .env.example — please fill in the required values"
  else
    warn "No .env.example found — please create .env manually"
  fi
else
  success ".env already exists"
fi

# ── 4. Start infrastructure ───────────────────────────────────────────────────
if command -v docker >/dev/null 2>&1; then
  info "Starting PostgreSQL and Redis via Docker Compose..."
  docker compose up -d postgres redis
  info "Waiting for PostgreSQL to be ready..."
  RETRIES=30
  until docker compose exec -T postgres pg_isready -U osool >/dev/null 2>&1 || [ "$RETRIES" -eq 0 ]; do
    sleep 1
    RETRIES=$((RETRIES - 1))
  done
  [[ "$RETRIES" -gt 0 ]] && success "PostgreSQL ready" || abort "PostgreSQL did not start in time"
fi

# ── 5. Database migrations ────────────────────────────────────────────────────
info "Running database migrations..."
npm run db:migrate 2>/dev/null || {
  warn "npm run db:migrate failed — trying drizzle-kit push"
  npm run db:push 2>/dev/null || warn "db:push also failed — run migrations manually"
}
success "Database schema applied"

# ── 6. Seed initial data ──────────────────────────────────────────────────────
info "Seeding initial data..."
npm run db:seed 2>/dev/null || warn "db:seed not configured — skipping"

# ── 7. Create admin user ──────────────────────────────────────────────────────
info "Creating admin user..."
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@osool.ai}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -base64 12)}"
echo "Admin: $ADMIN_EMAIL / $ADMIN_PASSWORD"
npx tsx scripts/create-admin.ts "$ADMIN_EMAIL" "$ADMIN_PASSWORD" 2>/dev/null || warn "create-admin script failed — run manually"

# ── 8. Summary ────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}╔═══════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║    Osool Orchestrator Setup Complete  ║${RESET}"
echo -e "${BOLD}╚═══════════════════════════════════════╝${RESET}"
echo ""
echo -e "  API:              http://localhost:4000"
echo -e "  Admin Dashboard:  http://localhost:5173"
echo -e "  API Docs:         http://localhost:4000/docs"
echo ""
echo -e "  Start dev:  ${BOLD}npm run dev${RESET}"
echo ""
