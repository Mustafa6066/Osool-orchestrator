# Hidden Coupling Map — Cross-System Co-Change Pairs

Files that MUST be changed together. If you change one, check the other.
Inspired by Repowise's git intelligence co-change pair tracking.

## Cross-System Couplings (Orchestrator ↔ Platform)

### Lead Scoring
| Orchestrator | Platform |
|---|---|
| `apps/api/src/jobs/handlers/score-lead.job.ts` | `backend/app/ai_engine/lead_scoring.py` |
| `packages/shared/src/utils/scoring.ts` | `backend/app/services/analytics_service.py` |

**Rule:** Orchestrator is the score authority. Platform reads from Orchestrator via bridge API.

### Chat / AI Brain
| Orchestrator | Platform |
|---|---|
| `apps/api/src/agents/brain/consensus-router.ts` | `backend/app/ai_engine/wolf_orchestrator.py` |
| `packages/shared/src/types/agent-plugin.ts` | `backend/app/ai_engine/reasoning_engine.py` |

**Rule:** Consensus Router types define the contract. Wolf Orchestrator must produce compatible ReasoningStep structures.

### Scraper Pipeline
| Orchestrator | Platform |
|---|---|
| `apps/api/src/events/agent-events.ts` (`scraper-complete`) | `scraper/nawy_spider.py` |
| `apps/api/src/jobs/handlers/scraper-refresh.job.ts` | `scraper/nawy_spider.py` |
| `apps/api/src/jobs/handlers/scraper-event.job.ts` | `backend/app/ingestion/deterministic_normalizer.py` |

**Rule:** Spider emits results to Redis `scraper:pending` queue. Orchestrator's scraper-event handler processes downstream effects.

## Intra-Orchestrator Couplings

### Agent System
| File A | File B |
|---|---|
| `packages/shared/src/types/agent-plugin.ts` | `apps/api/src/agents/brain/consensus-router.ts` |
| `apps/api/src/agents/base.agent.ts` | `apps/api/src/scheduler.ts` |
| `apps/api/src/events/agent-events.ts` | `apps/api/src/scheduler.ts` |

### Queue System
| File A | File B |
|---|---|
| `apps/api/src/jobs/queue.ts` (job data types) | `apps/api/src/jobs/workers.ts` (worker registration) |
| `apps/api/src/jobs/queue.ts` (new queue) | `apps/api/src/jobs/queue.ts` (`closeAllQueues()`) |
| `apps/api/src/jobs/workers.ts` (new worker) | `apps/api/src/jobs/handlers/*.job.ts` (handler) |

### Schema System
| File A | File B |
|---|---|
| `packages/db/src/schema/*.ts` (new table) | `packages/db/src/schema/index.ts` (barrel export) |
| `packages/db/src/schema/*.ts` (schema change) | Run `pnpm db:generate` to create migration |

## Intra-Platform Couplings

### AI Engine
| File A | File B |
|---|---|
| `backend/app/ai_engine/coinvestor_master_prompt.py` | `backend/app/ai_engine/wolf_orchestrator.py` |
| `backend/app/ai_engine/perception_layer.py` | `backend/app/ai_engine/psychology_layer.py` |
| `backend/app/models.py` (schema change) | Run `alembic revision --autogenerate` |
