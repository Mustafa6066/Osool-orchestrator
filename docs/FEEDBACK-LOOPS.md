# Feedback Loops

Feedback loops are the self-improving core of the Osool Orchestrator. They run automatically every 6 hours (and on-demand from agents) to close the gap between what Osool shows users and what users actually respond to.

---

## What Is a Feedback Loop?

A feedback loop is a job that:
1. Reads recent performance data (intent signals, email open rates, ad CTR, conversion events)
2. Identifies patterns or mismatches
3. Writes actionable findings to the `feedbackLoopEvents` table
4. Returns a list of `actionsTriggered` describing what changed

These findings drive the next generation of content, audience targeting, email timing, and lead scoring.

---

## The 5 Loop Types

### 1. `keyword_seo_sync`

**Trigger**: After SEO content is generated, or on the 6h schedule.

**What it does**:
- Reads top intent types from `intentSignals` in the last 30 days
- Checks which keyword targets exist in `keywords`
- Finds intent categories with no matching SEO content
- Records findings as gap analysis

**Output**: `actionsTriggered` lists which developer/location/intent combinations need new content.

**Effect**: The `NexusAgent` picks up trending keywords → `MarketingAgent` schedules `seo-content-gen` jobs for missing pages.

**Flow**:
```
intentSignals (top types) → keywords (existing) → gap analysis → feedbackLoopEvents
                                                                        ↓
                                                              MarketingAgent reads
                                                              → seo-content-gen job
```

---

### 2. `audience_performance_sync`

**Trigger**: After `audience-sync` job completes, or on the 6h schedule.

**What it does**:
- Reads campaign performance from `campaignMetrics` (CTR, CVR, spend, revenue)
- Computes CPL (cost per lead) for each campaign
- Identifies underperforming audiences (CTR < 1% or CVR < 0.5%)
- Records recommendations as feedback events

**Output**: List of audience IDs flagged for budget reduction; high-performers flagged for scaling.

**Effect**: Admin users can act on these signals. Future automation will adjust bids via the Meta/Google Ads APIs.

**Flow**:
```
campaignMetrics (last 7d) → CPL + CTR analysis → feedbackLoopEvents
                                                         ↓
                                                  Admin dashboard (Feedback Loops page)
```

---

### 3. `email_sequence_optimize`

**Trigger**: On the 6h schedule, after a batch of email sends.

**What it does**:
- Reads `emailSends` records grouped by sequence and step
- Computes open rates, click rates by step (currently based on `sentAt` presence as a proxy — actual open tracking requires a Resend webhook in future)
- Identifies sequences with low engagement (< 20% proxy open rate)
- Flags email step order or content as needing revision

**Output**: Sequence IDs with low engagement + recommended timing adjustments.

**Effect**: Engineers can update sequence delays or content in `emailSequences`. Future: auto-updating templates via Claude.

---

### 4. `lead_scoring_recalibrate`

**Trigger**: After `IntegrationAgent` finishes a batch scoring run (every 2h), or on the 6h schedule.

**What it does**:
- Reads the score distribution across `intentSignals` sessions
- Counts conversions (signed-up users) vs total scored sessions
- Computes current conversion rate per score band (0–30, 31–60, 61–80, 81–100)
- Identifies score thresholds that correlate better with actual signup
- Records calibration suggestions as feedback events

**Output**: Recommended tier boundary adjustments (e.g., "warm threshold should be 55, not 60 based on observed conversions").

**Effect**: Scoring weights or tier definitions can be updated in `score-lead.job.ts`. Future: auto-updating scoring model weights.

---

### 5. `content_gap_analysis`

**Trigger**: On the 6h schedule.

**What it does**:
- Cross-references `developers` table (all known developers) and `properties` locations with `seoContent` table
- Identifies developers or areas with no generated content
- Reads `intentSignals` to find which developers / areas users ask about most
- Prioritizes gaps by intent frequency

**Output**: Ranked list of developer/area combinations needing SEO content.

**Effect**: `MarketingAgent` picks up the highest-priority gaps and enqueues `seo-content-gen` jobs.

---

## Execution Flow

```
Every 6h (BullMQ repeatable job)
           ↓
  feedback-loop queue
           ↓
  FeedbackLoopWorker picks up job
           ↓
  run-feedback-loop.job.ts handler
     switch(loopType):
       case 'keyword_seo_sync'           → runs gap analysis logic
       case 'audience_performance_sync'  → reads campaignMetrics
       case 'email_sequence_optimize'    → reads emailSends
       case 'lead_scoring_recalibrate'   → reads intentSignals + users
       case 'content_gap_analysis'       → reads developers + seoContent
           ↓
  recordFeedbackLoopEvent(loopType, findings, actionsTriggered)
           ↓
  feedbackLoopEvents table (PostgreSQL)
           ↓
  Admin dashboard polls GET /admin/feedback-loops every 60s
```

---

## Agent-Triggered Loops

Beyond the schedule, agents trigger loops after their operations complete:

| Agent | Loop Triggered | When |
|-------|---------------|------|
| `MarketingAgent` | `audience_performance_sync` | After audience-sync batch |
| `MarketingAgent` | `keyword_seo_sync` | After SEO content batch |
| `IntegrationAgent` | `lead_scoring_recalibrate` | After batch scoring run |
| `WorkflowPageContentGen` | `keyword_seo_sync` | After single content gen |

This creates a tight feedback cycle: agents act → loops evaluate → agents refine.

---

## Admin Dashboard — Feedback Loops Page

The **Feedback Loops** page (`/feedback-loops`) polls `GET /admin/feedback-loops` every 60 seconds. Each event card shows:

| Field | Description |
|-------|-------------|
| Loop type | Color-coded badge (5 distinct colors) |
| Findings | JSON summary of what was discovered |
| Actions triggered | Array of string actions taken |
| Executed at | Timestamp |

**Badge colors**:
- `keyword_seo_sync` → indigo
- `audience_performance_sync` → amber
- `email_sequence_optimize` → emerald
- `lead_scoring_recalibrate` → blue
- `content_gap_analysis` → purple

---

## Adding a New Feedback Loop Type

1. **Add the loop type** to the `LoopType` union in `packages/types/src/index.ts`:
   ```ts
   export type LoopType =
     | 'keyword_seo_sync'
     | 'audience_performance_sync'
     | 'email_sequence_optimize'
     | 'lead_scoring_recalibrate'
     | 'content_gap_analysis'
     | 'your_new_loop_type'; // ← add here
   ```

2. **Implement the handler** in `apps/api/src/jobs/run-feedback-loop.job.ts`:
   ```ts
   case 'your_new_loop_type': {
     const findings = await runYourNewLoop(db);
     const actionsTriggered = findings.actions;
     await recordFeedbackLoopEvent(db, 'your_new_loop_type', findings, actionsTriggered);
     break;
   }
   ```

3. **Add a badge color** in `apps/admin/src/pages/FeedbackLoops.tsx`:
   ```ts
   const BADGE_COLORS: Record<string, string> = {
     // ...existing entries...
     your_new_loop_type: 'bg-rose-900 text-rose-200',
   };
   ```

4. **Enqueue it** from a workflow or agent:
   ```ts
   await feedbackLoopQueue.add('your_new_loop_type', { loopType: 'your_new_loop_type' }, {
     jobId: `your_new_loop_type:${new Date().toISOString().slice(0, 13)}`,
   });
   ```

That's all that's needed. The worker picks up the job automatically on the next cycle.

---

## Database Record

Each feedback loop execution writes one row to `feedbackLoopEvents`:

```sql
INSERT INTO feedback_loop_events (loop_type, findings, actions_triggered, executed_at)
VALUES ('keyword_seo_sync', '{"gaps":["New Cairo",...]}', '["queued 3 SEO jobs"]', NOW());
```

History is queryable via:
```bash
GET /admin/feedback-loops?limit=50&offset=0
```
