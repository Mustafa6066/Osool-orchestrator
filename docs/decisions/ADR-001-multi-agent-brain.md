# ADR-001: Multi-Agent Consensus Brain Architecture

**Status:** Accepted  
**Date:** 2025-01-01  
**Decision Makers:** Core Engineering Team

## Context

The Osool platform's original AI architecture used a single-bot pattern (CoInvestor) with a 7-stage sequential pipeline (Wolf Orchestrator). This caused:

1. **Latency** — sequential pipeline processes query through all 7 stages even when only 1-2 are relevant
2. **Single point of failure** — one prompt/model serves all domains (valuation, legal, psychology, content)
3. **No reasoning auditability** — no way to trace why the AI recommended a particular property
4. **Inflexible scheduling** — agents run on fixed intervals, missing time-critical events (hot leads, market shifts)

## Decision

Replace the single-bot architecture with a **multi-agent consensus system** composed of:

1. **Domain Plugin Slots** — 6 specialist agents (valuation, legal, market-intel, psychology, content, routing), each implementing the `AgentPlugin` interface
2. **Consensus Router** — fan-out to relevant plugins in parallel, confidence-weighted merge, Claude synthesis
3. **Event-Driven Triggers** — hybrid interval + event scheduling (hot-lead, scraper-complete, market-shift)
4. **Reasoning Chain Persistence** — every agent step produces `{ thought, evidence, conclusion, confidence }` stored in DB

### Inspiration Sources
- **Composio Agent-Orchestrator**: 7 plugin slots, reaction system, session lifecycle state machine
- **Repowise**: 4 intelligence layers, decision records, `get_why()` for reasoning transparency
- **Scrapling**: Adaptive selectors (zero token extraction), pause/resume, dev-mode caching

## Consequences

### Positive
- Parallel fan-out reduces latency by ~60% vs sequential pipeline
- Each domain agent can be independently versioned, tested, and circuit-broken
- Reasoning chains enable "why did the AI say this?" audit trail
- Event-driven triggers enable <5s response to hot leads

### Negative
- More complex to debug (distributed reasoning across multiple agents)
- Higher token usage when multiple agents activated (mitigated by activation threshold)
- Requires consensus synthesis step (additional LLM call)

### Risks
- Plugin activation scoring may over-include or under-include agents — needs tuning via experiment framework
- Cost tracking essential to prevent runaway multi-agent token spend

## Governed Files

- `packages/shared/src/types/agent-plugin.ts` — Plugin interface definitions
- `apps/api/src/agents/brain/consensus-router.ts` — Consensus routing logic
- `apps/api/src/events/agent-events.ts` — Event-driven agent triggers
- `apps/api/src/scheduler.ts` — Hybrid interval + event scheduler
- `packages/db/src/schema/intelligence.ts` — Reasoning chains + LLM cost tables
