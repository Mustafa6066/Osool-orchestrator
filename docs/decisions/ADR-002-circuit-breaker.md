# ADR-002: Circuit Breaker & Graceful Degradation

**Status:** Accepted  
**Date:** 2025-01-01  
**Decision Makers:** Core Engineering Team

## Context

The platform makes API calls to multiple external services (Anthropic, OpenAI, Supabase, MLOps endpoints). A single service outage would cascade across the system — blocking chat responses, scraper enrichment, and scheduled agent runs.

## Decision

Wrap all external service calls in a **Circuit Breaker** pattern (`packages/shared/src/utils/circuit-breaker.ts`).

States: `CLOSED` (normal) → `OPEN` (fast-reject after N failures) → `HALF_OPEN` (probe with limited traffic) → `CLOSED`.

Key parameters:
- `failureThreshold: 5` — open after 5 consecutive failures
- `resetTimeoutMs: 30_000` — probe after 30 seconds
- `successThreshold: 2` — close after 2 successful probes

Named circuit breakers via singleton registry (`getCircuitBreaker(name, options)`).

## Consequences

### Positive
- Prevents cascading failures across the system
- Fast-reject when external service is down (no timeout waiting)
- Health dashboard shows all circuit states at a glance

### Negative
- Users may see degraded responses during circuit-open periods

## Governed Files

- `packages/shared/src/utils/circuit-breaker.ts` — Circuit breaker implementation
- `apps/api/src/routes/health.routes.ts` — Circuit breaker status in health check
- `apps/api/src/agents/brain/consensus-router.ts` — Circuit-protected synthesis calls
