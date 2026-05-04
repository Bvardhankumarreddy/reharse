# Social Agent Phase 5 — Insights auto-apply, A/B testing, Audience, Competitors, Reports

## What ships

| Feature | Status | Notes |
|---------|--------|-------|
| **Auto-applied insights** | ✅ Full | Top 3 actionable insights (confidence ≥ 0.5) for the current platform are prepended to every Claude generation as "PAST PERFORMANCE LEARNINGS". Applies on `generate` AND `regenerate`. |
| **A/B testing** | ✅ Full | Generate 2-3 variants per platform from the Generate page. Variants linked via `experimentId` in `generationContext`. View comparison in Analytics. |
| **Audience demographics** | 🟡 Instagram-only | Weekly snapshot of follower count, age/gender/country/city breakdown. LinkedIn requires Marketing Developer Platform (paid tier). YouTube needs YouTube Analytics API (separate scope). |
| **Competitor tracking** | 🟡 Manual only | Track competitor handles + manual notes. Auto-scraping is against ToS for all major platforms — no programmatic shortcut exists. |
| **CSV report exports** | ✅ Full | Two reports: posts (one row per post + latest engagement) and timeseries (daily engagement by platform). |

## Why Phase 5 is mostly "no new env vars"

Everything reuses existing infrastructure:
- Insights → existing `social_insights` table (Phase 4)
- A/B variants → existing `social_posts` table + `generationContext.experimentId`
- Audience → reuses Instagram OAuth token from Phase 3
- Competitors → standalone manual entry, no API calls
- Reports → just a CSV serializer over existing engagement data

## Setup

### 1. Run the migration

```bash
ssh -i <key> ubuntu@<EC2_HOST> \
  "kubectl exec -i postgres-0 -n rehearse -- psql -U rehearse -d rehearse" \
  < api/src/social-agent/migration-004-phase5.sql
```

Creates: `audience_snapshots`, `competitor_channels`, `competitor_notes`.

### 2. (Optional) Generate audience snapshot now

After CI deploys, click **🔄 Sync Now** on Analytics → Audience section.
Otherwise it auto-runs Mondays @ 07:00 UTC.

## How auto-applied insights work

```
generate() called for platform=instagram_feed
  → getApplicableLearnings("instagram_feed")
    → SELECT FROM social_insights WHERE isActionable = true
       AND (platform = 'instagram_feed' OR platform = 'all' OR platform IS NULL)
       AND confidence_score >= 0.5
       ORDER BY confidence_score DESC, generatedAt DESC LIMIT 3
  → POST /social-post/generate { ..., past_learnings: [{finding, recommendation}, ...] }
  → AI engine prompt prepends:
      ## PAST PERFORMANCE LEARNINGS (apply these where relevant)
      - <finding> → <recommendation>
```

Stored in `generationContext.appliedLearnings` for audit trail.

**No "applied" toggle needed** — every generation just pulls the latest 3 actionable insights, so as your insights cron updates them, future generations adapt automatically.

## How A/B testing works

```
User checks "🧪 A/B Test" on /admin/social-agent/generate
  → variants: 2, experimentName: "Lesson 4 hook test"
  → generate() loops platform × variants times
  → All variants share the same experimentId in generationContext
  → Each saved as a separate social_post (status=pending_approval)

In analytics: GET /experiments groups all posts where
  generationContext.experimentId IS NOT NULL
  → returns each group with all variants

Manual winner picking:
  → User publishes one variant (or both)
  → After engagement sync (hourly cron), compare metrics
  → Reject the losing variant from /queue
```

No special "winner" status — the regular publish/reject flow IS the picking mechanism. The A/B card in analytics shows variants side-by-side with their published status + external links.

## Cron schedule (all phases)

| Queue | Cron | Purpose |
|-------|------|---------|
| `social-publish` | `* * * * *` (every minute) | Publish approved LinkedIn + Instagram posts |
| `social-engagement-sync` | `15 * * * *` (hourly) | Snapshot engagement |
| `social-insights` | `30 6 * * *` (daily 06:30 UTC) | Re-generate AI insights |
| `social-audience-sync` | `0 7 * * 1` (Mondays 07:00 UTC) | Snapshot audience demographics |

## API endpoints (new in Phase 5)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/admin/social-agent/experiments` | List A/B test groups with variants |
| GET | `/admin/social-agent/audience` | Latest audience snapshot per platform |
| POST | `/admin/social-agent/audience/sync` | Trigger weekly sync now |
| GET/POST/PATCH/DELETE | `/admin/social-agent/competitors` | CRUD for competitor channels |
| POST | `/admin/social-agent/competitors/:id/notes` | Add note to a competitor |
| DELETE | `/admin/social-agent/competitors/notes/:noteId` | Delete a note |
| GET | `/admin/social-agent/reports/posts.csv` | Posts report (with engagement) |
| GET | `/admin/social-agent/reports/timeseries.csv` | Daily engagement timeseries |

## What we did NOT build

- **Auto-scraping competitor posts** — every major platform's ToS prohibits this. Paid services (Brandwatch, Phantombuster) exist but cost $1k+/month. Use manual notes instead.
- **A/B winner auto-detection** — too easy to false-positive on small samples. The UI shows you variants side-by-side; you make the call after seeing real engagement.
- **PDF reports** — CSV opens in Excel/Sheets and is more useful for analysis than a PDF. Generate PDF in Sheets if needed.
- **LinkedIn audience demographics** — requires Marketing Developer Platform tier (paid)
- **YouTube audience demographics** — requires YouTube Analytics API (different from Data API)

## Phase 6 ideas (not built)

- A/B winner auto-marking after N days + sample size threshold
- Insights "applied effectiveness tracking" — measure if posts using a specific insight perform better than baseline
- Newsletter integration (LinkedIn newsletters, Substack)
- Threads / Bluesky / Mastodon publishing
