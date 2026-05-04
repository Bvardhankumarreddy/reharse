# Social Agent Phase 3 — Instagram Auto-Publish Setup

## What Phase 3 ships

- Instagram **Feed** auto-publishing with images
- Image upload via existing `StorageService` (S3 via Lambda) — no new infra
- Same BullMQ cron as Phase 2 — Instagram dispatched alongside LinkedIn

## What Phase 3 does NOT include (future)

- ❌ Instagram Stories (Phase 3.5)
- ❌ Reels (different API)
- ❌ Carousels
- ❌ First-comment hashtag posting

## Pre-Requirements (Manual Setup)

### Step 1: Convert Instagram → Business Account

1. Open the Instagram app
2. Settings → Account → **Switch to Professional Account**
3. Choose **Business**
4. Connect to a Facebook Page (required — see Step 2)

### Step 2: Create / Link a Facebook Page

If you don't have a Facebook Page yet:
1. Go to https://www.facebook.com/pages/create
2. Page name: `AetherStackAI`
3. Category: Education / Internet Service / Tech
4. Link your IG Business account from Page Settings → Linked Accounts → Instagram

### Step 3: Create the Meta App

1. Go to https://developers.facebook.com/apps
2. **Create App** → App type: **Business**
3. App name: `AetherStackAI Social Agent`

### Step 4: Add Products

In your new app:
- Add **Instagram Graph API**
- Add **Facebook Login for Business**

### Step 5: Configure OAuth

1. Settings → Basic — copy **App ID** + **App Secret**
2. Facebook Login for Business → Settings → **Valid OAuth Redirect URIs:**
   ```
   https://reharse.inferix.in/api/v1/social-agent/oauth/instagram/callback
   ```

### Step 6: Add Yourself as Tester (Dev Mode)

App Roles → **Add Tester** → invite yourself. Without this, the app only works for the developer account during App Review.

### Step 7: Set env vars on the API

On EC2:

```bash
kubectl edit secret rehearse-secrets -n rehearse
```

Add (under `stringData`):
```yaml
META_APP_ID: "<your app id>"
META_APP_SECRET: "<your app secret>"
META_REDIRECT_URI: "https://reharse.inferix.in/api/v1/social-agent/oauth/instagram/callback"
```

Add the env-var refs in `k8s/base/06-api.yaml` (in the api container `env:` array):
```yaml
- name: META_APP_ID
  valueFrom: { secretKeyRef: { name: rehearse-secrets, key: META_APP_ID } }
- name: META_APP_SECRET
  valueFrom: { secretKeyRef: { name: rehearse-secrets, key: META_APP_SECRET } }
- name: META_REDIRECT_URI
  valueFrom: { secretKeyRef: { name: rehearse-secrets, key: META_REDIRECT_URI } }
```

Apply + restart:
```bash
kubectl apply -f k8s/base/06-api.yaml
kubectl rollout restart deployment/api -n rehearse
```

**Note:** No new image-hosting infra needed. Phase 3 reuses your existing
`STORAGE_LAMBDA_URL` + `STORAGE_LAMBDA_SECRET` to upload to S3 and serve
24-hour presigned URLs to Instagram.

### Step 8: Connect

1. Go to `/admin/social-agent/connections`
2. Click **Connect Instagram Feed** → authorize on Facebook → redirected back with toast
3. The flow does:
   - Exchange code → short-lived token
   - Exchange short-lived → long-lived (60 days)
   - Fetch your FB pages → use first one
   - Look up the linked IG Business Account ID
   - Save the **page access token** (not the user token) encrypted

## How publishing works

1. On the Generate page, when you select **Instagram Feed**, an image
   uploader appears (required). Drop a JPG/PNG (max 8 MB, recommended 1080×1080).
2. The image uploads to S3 via the existing `StorageService` → returns a
   24-hour presigned URL → saved on the post's `imageUrl` column.
3. After approval, the BullMQ cron (every minute) picks up the post.
4. `InstagramService.publish()` runs the 3-step Meta flow:
   - **POST /{ig-id}/media** with `image_url` + `caption` → returns container id
   - **GET /{container-id}?fields=status_code** — polls until `FINISHED` (3-30s typical)
   - **POST /{ig-id}/media_publish** with `creation_id` → returns the IG media id
   - **GET /{media-id}?fields=permalink** → fetches the public IG URL
5. Status updated to `published_auto`, `externalUrl` filled with the IG permalink.

## Troubleshooting

**"No Instagram Business Account linked to your Facebook Page"**
→ Your IG account isn't connected to the FB page. In Instagram app: Settings → Account → switch to Professional → Business → link Facebook Page.

**"No Facebook page connected"**
→ Your Meta user has no admin pages. Create one at facebook.com/pages/create and rerun OAuth.

**"IG container did not finish (status=ERROR)"**
→ Common causes:
- Image URL not publicly accessible (test in incognito)
- Image format unsupported (use JPG/PNG)
- Image > 8 MB or non-square aspect ratio rejected by IG
- Caption contains banned hashtags or > 30 hashtags

**"Instagram token expired — please reconnect"**
→ Long-lived tokens last 60 days. Re-OAuth from the Connections page. Meta does not issue refresh tokens; you must re-authorize manually.

**Image upload returns 400 "Storage not configured"**
→ Set `STORAGE_LAMBDA_URL` + `STORAGE_LAMBDA_SECRET` env vars on the API (these already exist for the resume upload feature; the same Lambda is reused).

**"App in Development Mode" warning during OAuth**
→ Expected — only testers can use the app. Submit for App Review when going to production.

## Endpoints reference (new in Phase 3)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/admin/social-agent/connect/instagram` | Admin | Returns FB OAuth URL for IG |
| GET | `/social-agent/oauth/instagram/callback` | Public | OAuth callback (Meta redirects here) |
| POST | `/admin/social-agent/upload-image` | Admin | Multipart upload → returns presigned URL |

## Phase 3.5 hooks already wired

When you add Instagram Stories:
- New entity for story frames (or add JSONB column)
- Add `instagram_story` to `AUTO_PUBLISH_PLATFORMS` in `instagram.service.ts`
- Add a story-specific code path in `InstagramService.publish()` (uses `media_type=STORIES`)
