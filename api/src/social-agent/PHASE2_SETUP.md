# Social Agent Phase 2 — LinkedIn Auto-Publish Setup

## Architecture

- **OAuth** lives in NestJS API (not Next.js routes — your stack is Better Auth + AdminGuard)
- **Encryption** uses Node `crypto` AES-256-GCM (`SocialAgentEncryptionService`)
- **Cron** uses BullMQ (already in your stack — runs every minute as `social-publish` queue)
- **K3s deployment**: only one BullMQ worker should process the cron job at a time. Bull's repeatable-job dedup handles this — but if you scale API replicas > 1 and want explicit safety, use a Redlock or set `concurrency: 1` on the processor

## Prerequisites

### 1. Generate the encryption key (run once, locally)

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Save the output — it's your ENCRYPTION_KEY
```

### 2. Create LinkedIn app

1. Go to https://www.linkedin.com/developers/apps/new
2. App name: `AetherStackAI Social Agent`
3. Logo + LinkedIn page: pick yours
4. **Auth tab → OAuth 2.0 settings → Authorized redirect URLs:**
   ```
   https://reharse.inferix.in/api/v1/social-agent/oauth/linkedin/callback
   ```
5. **Products tab — request all three:**
   - "Sign In with LinkedIn using OpenID Connect" (instant approval)
   - "Share on LinkedIn" (instant approval)
   - "Marketing Developer Platform" (manual approval — needed for Page posting; ~1-3 days)
6. **Auth tab → copy:**
   - Client ID
   - Client Secret

### 3. Add env vars to the API K8s secret

On EC2:
```bash
kubectl edit secret rehearse-secrets -n rehearse
```

Add (under `stringData`):
```yaml
stringData:
  # ... existing keys ...
  LINKEDIN_CLIENT_ID: "<your client id>"
  LINKEDIN_CLIENT_SECRET: "<your client secret>"
  LINKEDIN_REDIRECT_URI: "https://reharse.inferix.in/api/v1/social-agent/oauth/linkedin/callback"
  ENCRYPTION_KEY: "<the 64-char hex from step 1>"
```

Then add the env-var refs in `k8s/base/06-api.yaml` (in the `env:` array of the api container):
```yaml
- name: LINKEDIN_CLIENT_ID
  valueFrom: { secretKeyRef: { name: rehearse-secrets, key: LINKEDIN_CLIENT_ID } }
- name: LINKEDIN_CLIENT_SECRET
  valueFrom: { secretKeyRef: { name: rehearse-secrets, key: LINKEDIN_CLIENT_SECRET } }
- name: LINKEDIN_REDIRECT_URI
  valueFrom: { secretKeyRef: { name: rehearse-secrets, key: LINKEDIN_REDIRECT_URI } }
- name: ENCRYPTION_KEY
  valueFrom: { secretKeyRef: { name: rehearse-secrets, key: ENCRYPTION_KEY } }
```

Apply:
```bash
kubectl apply -f k8s/base/06-api.yaml
kubectl rollout restart deployment/api -n rehearse
```

### 4. Run the migration

```bash
ssh -i <key> ubuntu@<EC2_HOST> \
  "kubectl exec -i postgres-0 -n rehearse -- psql -U rehearse -d rehearse" \
  < api/src/social-agent/migration-002-phase2.sql
```

## Connecting your accounts

1. Go to `https://reharse.inferix.in/admin/social-agent/connections`
2. Click **Connect LinkedIn Personal** → authorize on LinkedIn → redirected back with toast
3. Click **Connect LinkedIn Page** → authorize → first administered org is auto-selected

## How auto-publish works

1. You generate a post via `/admin/social-agent/generate`
2. Approve it from `/admin/social-agent/queue`
3. The **`social-publish` BullMQ queue runs every minute** and:
   - Queries `social_posts WHERE status='approved' AND scheduledAt <= now()`
   - For each LinkedIn post: calls `LinkedInService.publish()` which exchanges + refreshes tokens as needed, posts to `/v2/ugcPosts`
   - On success: updates status to `published_auto`, fills `externalUrl`, `externalPostId`
   - On failure: increments `publishAttempts`. After 3 attempts → status=`failed`. Error stored in `failureReason`.

You can also click **🚀 Publish Now** on any approved LinkedIn post to skip the wait.

## Troubleshooting

**"No active connection for linkedin_page"**
→ Visit Connections tab and connect. Check `lastError` on the connection.

**"LinkedIn API 401: ..."**
→ Token expired and refresh failed. Disconnect + reconnect.

**"LinkedIn API 403: ACCESS_DENIED"**
→ The "Marketing Developer Platform" product is still pending or your LinkedIn account doesn't have admin access to the org.

**Posts stuck in `publishing` status**
→ BullMQ worker crashed mid-publish. Manually update the row:
```sql
UPDATE social_posts SET status='approved' WHERE status='publishing';
```

## Endpoints reference

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/admin/social-agent/connect/linkedin?platform=...` | Admin | Returns LinkedIn authorize URL |
| GET | `/social-agent/oauth/linkedin/callback` | Public | OAuth callback (LinkedIn redirects here) |
| GET | `/admin/social-agent/connections` | Admin | List connected accounts |
| DELETE | `/admin/social-agent/connections/:platform` | Admin | Disconnect |
| POST | `/admin/social-agent/posts/:id/publish-now` | Admin | Force-publish one approved post |

## Phase 3 hooks already wired

When you add Instagram/YouTube:
- Add `instagram_*` / `youtube_community` cases to `LinkedInService` → rename to `PublisherService`
- The `SocialPublishProcessor` already handles all platforms — just remove the LinkedIn-only check
