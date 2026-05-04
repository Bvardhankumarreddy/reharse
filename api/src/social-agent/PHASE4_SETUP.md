# Social Agent Phase 4 — Analytics + Insights + YouTube OAuth

## What ships

- **Engagement sync** — hourly BullMQ cron pulls likes/comments/shares from
  LinkedIn + Instagram for posts published in the last 30 days
- **Analytics dashboard** at `/admin/social-agent/analytics`:
  - 4 stat cards (posts / engagement / impressions / avg rate)
  - 30-day engagement trend (line chart)
  - Per-platform performance (bar chart + table)
  - Per-content-type performance table
  - Top 10 posts ranked by engagement
- **AI Insights** — daily BullMQ cron asks Claude to analyse 30 days of data
  and produce 3-5 actionable insights with confidence scores. Manual trigger
  from the dashboard via "🔄 Generate Now" button.
- **YouTube OAuth** — connect your channel for subscriber count tracking

## What does NOT work yet

❌ **YouTube Community Posts auto-publish** — the public YouTube Data API v3
   does NOT expose an endpoint to create community posts. You can only read
   them after manual posting. This isn't a Phase 4 scope cut — it's a Google
   API limitation. Workflow until Google opens it up:
   1. Approve YouTube post in Queue
   2. Click 📋 Copy
   3. Open YouTube Studio → Community → paste
   4. Click "Mark Published" in our admin → records `externalUrl`

❌ **YouTube engagement sync** — same reason; no community-post insights API

❌ **Auto-applying insights to future posts** — Phase 5

## Required env vars (new in Phase 4)

```yaml
# YouTube (only needed if you want to connect for subscriber tracking)
YOUTUBE_CLIENT_ID: "..."
YOUTUBE_CLIENT_SECRET: "..."
YOUTUBE_REDIRECT_URI: "https://reharse.inferix.in/api/v1/social-agent/oauth/youtube/callback"
```

No new env vars for engagement sync or insights — both reuse Meta + LinkedIn
tokens (engagement sync) and the AI engine (insights).

## Setup steps

### 1. Run the migration

```bash
ssh -i <key> ubuntu@<EC2_HOST> \
  "kubectl exec -i postgres-0 -n rehearse -- psql -U rehearse -d rehearse" \
  < api/src/social-agent/migration-003-phase4.sql
```

Creates `post_engagement` (with `UNIQUE (socialPostId, syncedDate)`) and
`social_insights` tables.

### 2. Enable YouTube OAuth (optional)

1. Google Cloud Console → create project → enable **YouTube Data API v3**
2. OAuth credentials (Web application). Authorized redirect:
   ```
   https://reharse.inferix.in/api/v1/social-agent/oauth/youtube/callback
   ```
3. OAuth consent screen → publish OR add yourself as a test user
4. Add the 3 env vars above to your K8s secret + bind in `06-api.yaml`
5. Restart API: `kubectl rollout restart deployment/api -n rehearse`
6. Visit `/admin/social-agent/connections` → click **Connect YouTube Community**

## Cron schedule

| Queue | Cron | Purpose |
|-------|------|---------|
| `social-publish` | `* * * * *` (every minute) | Publish approved LinkedIn + Instagram posts (Phase 2/3) |
| `social-engagement-sync` | `15 * * * *` (hourly @ :15) | Pull stats for last-30-day published posts |
| `social-insights` | `30 6 * * *` (daily @ 06:30 UTC) | Re-generate AI insights from 30-day summary |

All three jobs use the existing BullMQ queue infra — no Vercel Cron needed.

## How analytics works

```
Hourly:
  EngagementSyncProcessor.tick()
    → Find posts published in last 30 days
    → For each: call platform.fetchStats(post)  [LinkedIn API or IG Insights API]
    → Insert daily snapshot to post_engagement (UNIQUE constraint dedups)

Daily @ 06:30 UTC:
  InsightsProcessor.tick()
    → AnalyticsService.buildClaudeSummary() — compact 30-day numbers
    → POST /social-insights/generate on AI engine
    → Claude (opus, temp 0.3) returns 3-5 insights
    → Mark old insights isActionable=false, save new ones

On dashboard load:
  AnalyticsService.summary()
    → Fetch latest snapshot per post
    → Aggregate: totals, per-platform, per-content-type, trend, top 10
    → Return latest 5 actionable insights
```

## Troubleshooting

**"No published posts yet" on analytics page**
→ Mark some posts as published_manual or wait for auto-publish to fire

**Top posts show 0 engagement**
→ Engagement sync hasn't run yet (next :15 of the hour) OR LinkedIn returns
no data for personal posts (impressions are not exposed for personal accts)

**No insights generated**
→ Check API logs for `[InsightsProcessor]` — common causes:
- Fewer than 3 published posts (cron skips intentionally)
- AI engine /social-insights/generate returned malformed JSON

**YouTube OAuth fails with "redirect_uri_mismatch"**
→ The URI in Google Console must match `YOUTUBE_REDIRECT_URI` env var EXACTLY
(including https, no trailing slash)

**YouTube subscriber count fetched but 0**
→ Channel statistics can be marked private. Channel Settings → Channel default
visibility → make subscriber count public.

## API endpoints (new in Phase 4)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/admin/social-agent/analytics` | Admin | Returns full dashboard summary |
| POST | `/admin/social-agent/insights/generate` | Admin | Manually trigger Claude analysis |
| GET | `/admin/social-agent/connect/youtube` | Admin | Returns YouTube OAuth URL |
| GET | `/admin/social-agent/youtube/subscribers` | Admin | Returns current subscriber count + eligibility flag |
| GET | `/social-agent/oauth/youtube/callback` | Public | Google OAuth callback |

## When YouTube opens the Community Posts API

The infrastructure is ready:
- `YouTubeService.publish()` is the only method that needs an implementation
- `AUTO_PUBLISH_PLATFORMS` in `instagram.service.ts` — add `'youtube_community'`
- `SocialPublishProcessor.publishOne()` — add a youtube branch in the dispatcher
- Done — auto-publish + analytics already wired
