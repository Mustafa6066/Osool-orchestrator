# ADR-003: Zero-Token Adaptive Scraper (Scrapling-Inspired)

**Status:** Accepted  
**Date:** 2025-01-01  
**Decision Makers:** Core Engineering Team

## Context

The existing Nawy scraper (`nawy_scraper_v3.py`) uses Playwright for browser automation but still relies on hardcoded CSS selectors that break on website redesigns. While it successfully eliminated OpenAI token usage for extraction, it lacks:

1. Adaptive selectors that survive redesigns
2. Pause/resume for long crawls
3. Dev-mode caching for development
4. Smart refresh triggered by chat queries

## Decision

Create a new `nawy_spider.py` in `Osool-Platform/scraper/` inspired by Scrapling's Spider architecture:

1. **Adaptive CSS Selectors** — use `auto_save=True` pattern to store and reuse selectors
2. **Dev-Mode Caching** — cache HTTP responses on first run, replay on subsequent runs
3. **Checkpoint/Resume** — persist crawl progress to `.crawldir/checkpoint.json`
4. **Event-Triggered Refresh** — orchestrator sends scraper-refresh jobs via BullMQ when chat mentions unknown properties
5. **httpx-first** — use lightweight HTTP for Next.js data API, fall back to Scrapling StealthyFetcher only for protected pages

## Consequences

### Positive
- Zero LLM tokens for all property extraction
- Adaptive selectors survive Nawy website redesigns
- Dev-mode eliminates redundant HTTP calls during development
- Checkpoint resume enables long crawls without data loss

### Negative
- Scrapling is an additional Python dependency
- HTTP-first approach may miss dynamically rendered content (mitigated by StealthyFetcher fallback)

## Governed Files

- `Osool-Platform/scraper/nawy_spider.py` — Adaptive spider implementation
- `Osool-orchestrator/apps/api/src/jobs/queue.ts` — `scraper-refresh` queue
- `Osool-orchestrator/apps/api/src/jobs/handlers/scraper-refresh.job.ts` — Refresh job handler
- `Osool-orchestrator/apps/api/src/events/agent-events.ts` — `scraper-complete` event
