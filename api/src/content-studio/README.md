# Content Studio

Multi-agent weekly content factory for AetherStackAI (and future brands).
Generates a full week of educational content — audio scripts, slide decks,
SEO/promo (Phase B), and a Saturday quiz pool — across OpenAI, Anthropic,
and Google. The full plan lives in [`CONTENT_STUDIO_PHASES.md`](../../../CONTENT_STUDIO_PHASES.md).

## Status

**Phase A is complete.** Phases B, C, D are upcoming.

| Phase | Status |
|---|---|
| **A** — Strategy → Script → PPT → Quiz → orchestrator + DLQ | ✅ shipped (Slices 1–6) |
| **B** — SEO / Thumbnail-prompt / Promotion agents + grader loop | future |
| **C** — Parallelisation, cost-tier optimisation, dashboard, audit log | future |
| **D** — Thumbnail image gen, YouTube auto-publish, metrics feedback | future |

## Architecture

```
Brand + memories
      │
      ▼                                                    cs_pipeline_runs
┌─────────────┐   ┌────────────┐   ┌────────────┐   ┌──────────────────────┐
│ Strategy    │ → │ Lessons in │ → │ Per-lesson │ → │ Quiz pool (50 MCQs)  │
│ Agent       │   │ a plan     │   │ Script &   │   │ + cross-provider     │
│ (Claude)    │   │            │   │ PPT agents │   │ validator → 9-Q draw │
└─────────────┘   └────────────┘   └────────────┘   └──────────────────────┘
                                          ▲                 ▲
                                          └────  Orchestrator (Bull queue)
                                                 - resume from any stage
                                                 - records cost delta
                                                 - writes to DLQ on failure
```

Every LLM call goes through one **Model Router** (`services/model-router.service.ts`)
that:

- Picks the model per task from config (env-overridable).
- Times out per task — Strategy 120s, Script 90s, PPT 60s, Quiz 180s,
  validator 30s, SEO/Promo 45s.
- Retries once on the same provider, then **falls back to a different
  provider's model** (Claude ↔ GPT-4o-mini ↔ Gemini).
- Enforces **cross-provider validation** for the Quiz Agent: the
  validator never runs on the same provider that wrote the question
  (`excludeProvider` argument).
- Prices the call from the `MODEL_PRICING` table and records every
  attempt to `cs_agent_runs` (audit + cost ledger).
- Refuses to spend if `plan.totalCostUsd > $10` or this month's total
  `> $100` (env-overridable).

## Tables (prefix `cs_`)

- `cs_brands` — the brand (AetherStackAI seeded)
- `cs_channels` — YouTube channel(s) under a brand
- `cs_weekly_content_plans` — one row per week
- `cs_lessons` — 2 per plan
- `cs_brand_memories` — voice/style/hook/structure/do/don't, fed into every prompt
- `cs_content_assets` — versioned outputs (script JSON, ppt slides JSON, …)
- `cs_agent_runs` — every LLM call (cost ledger)
- `cs_question_pools` — 50 MCQs per plan, each `validationPassed` flag
- `cs_delivered_quizzes` — the drawn Saturday 9-question quiz
- `cs_pipeline_runs` — orchestrator state per run (with `stagesCompleted`,
  `resumableFrom`, `costDelta`)
- `cs_dead_letter_jobs` — failed pipeline stages parked for manual triage

## Migrations

Apply in order (idempotent — safe to re-run):

```bash
for f in migration-001-foundation.sql \
         migration-002-quiz-explanation.sql \
         migration-003-pipeline-runs.sql; do
  kubectl exec -i -n rehearse postgres-0 -- \
    psql -U rehearse -d rehearse < api/src/content-studio/$f
done
```

## Env vars

| Var | Default | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | — | Required for OpenAI provider (gpt-4o-mini default for the quiz validator + fallback). |
| `ANTHROPIC_API_KEY` | — | Required for the Anthropic provider (default for Strategy / Script / PPT / Quiz). |
| `GEMINI_API_KEY` | — | Optional 3rd provider — adapter stays dormant if unset. |
| `CS_STRATEGY_MODEL` | `claude-sonnet-4-6` | Per-task model override (also `_SCRIPT_`, `_PPT_`, `_QUIZ_`, `_QUIZ_VALIDATOR_`, `_SEO_`, `_PROMO_`). |
| `CS_*_TIMEOUT_MS` | per spec | Per-task timeout override. |
| `CS_PLAN_BUDGET_USD` | `10` | Hard pause when one plan crosses this. |
| `CS_MONTH_BUDGET_USD` | `100` | Hard pause when this calendar month crosses this. |

## Public API (all behind `AdminGuard`)

```
# Strategy
POST /admin/content-studio/plans/generate { brandId, weekOf? }

# Per-lesson agents
POST /admin/content-studio/lessons/:id/script/generate
GET  /admin/content-studio/lessons/:id/script
POST /admin/content-studio/lessons/:id/ppt/generate
GET  /admin/content-studio/lessons/:id/ppt
GET  /admin/content-studio/lessons/:id/ppt/download   (streams .pptx)

# Quiz
POST /admin/content-studio/plans/:id/quiz/generate    (50 + cross-provider validate)
GET  /admin/content-studio/plans/:id/quiz/pool
POST /admin/content-studio/plans/:id/quiz/draw        (4 easy + 3 med + 2 hard)
GET  /admin/content-studio/plans/:id/quiz
GET  /admin/content-studio/plans/:id/quiz/download?variant=public|private

# Orchestrator (Bull async)
POST /admin/content-studio/plans/:id/run  { fromStage? }
GET  /admin/content-studio/plans/:id/runs
GET  /admin/content-studio/plans/:id/runs/latest
GET  /admin/content-studio/runs/:id

# DLQ (triage failed runs)
GET  /admin/content-studio/dlq?status=pending|retried|abandoned
POST /admin/content-studio/dlq/:id/retry
POST /admin/content-studio/dlq/:id/abandon
```

## Tests

```bash
cd api
npx jest src/content-studio
```

Slice 6 ships an orchestrator test (`pipeline-orchestrator.service.spec.ts`)
covering happy path, mid-stage failure, resume-from-stage, and the
concurrent-enqueue guard.

## Adding a brand

1. `INSERT INTO cs_brands (name, slug, description, "voiceStyle", "colorPrimary", "colorSecondary") VALUES (…)`
2. `INSERT INTO cs_channels ("brandId", name, cadence) VALUES (…)`
3. Seed 5–10 `cs_brand_memories` rows for that brand (voice / hook / structure / do / don't).
4. From the admin UI: pick the new brand → ✨ Generate Week → ▶️ Run pipeline.
