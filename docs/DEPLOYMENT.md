# Deployment Guide

This document covers the deployment process for Connect Market Nexus, including environment setup, build process, Supabase project configuration, and a production checklist.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Build Process](#build-process)
- [Supabase Project Setup](#supabase-project-setup)
- [Edge Function Deployment](#edge-function-deployment)
- [Database Migrations](#database-migrations)
- [Frontend Deployment](#frontend-deployment)
- [Production Checklist](#production-checklist)
- [Monitoring and Maintenance](#monitoring-and-maintenance)
- [Rollback Procedures](#rollback-procedures)

---

## Architecture Overview

The deployment consists of two main parts:

1. **Frontend**: A static SPA built with Vite, deployed to any static hosting provider (Lovable, Vercel, Netlify, Cloudflare Pages, etc.).
2. **Backend**: Supabase-managed infrastructure including PostgreSQL, Auth, Storage, Edge Functions, and Realtime.

```
Static Host (Frontend)  <-->  Supabase Cloud (Backend)
  - HTML/CSS/JS bundle          - PostgreSQL database
  - Assets (images, fonts)      - Auth service
                                - Edge Functions (Deno)
                                - Storage (documents)
                                - Realtime subscriptions
```

---

## Prerequisites

- **Node.js** >= 20.x
- **npm** >= 10.x
- **Supabase CLI** >= 1.100.x
  ```bash
  npm install -g supabase
  ```
- **Supabase account** with a project created at [supabase.com](https://supabase.com)
- Access to the Supabase project dashboard for secret management

---

## Environment Setup

### Frontend Environment Variables

Create a `.env` file for the build process:

```env
VITE_SUPABASE_URL="https://<project-id>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<anon-key>"
VITE_SUPABASE_PROJECT_ID="<project-id>"
```

These are embedded in the built JavaScript bundle and are safe to expose (the anon key is a public key protected by RLS policies).

### Supabase Edge Function Secrets

Configure these in the Supabase dashboard under **Project Settings > Edge Functions > Secrets**, or via CLI:

```bash
supabase secrets set --project-ref <project-id> \
  SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
  GEMINI_API_KEY="<google-gemini-key>" \
  BREVO_API_KEY="<brevo-api-key>" \
  MAPBOX_TOKEN="<mapbox-token>" \
  FIRECRAWL_API_KEY="<firecrawl-key>" \
  APIFY_API_TOKEN="<apify-token>" \
  PANDADOC_API_KEY="<pandadoc-key>" \
  FIREFLIES_API_KEY="<fireflies-key>"
```

| Secret | Required | Used By |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | All edge functions (admin DB operations) |
| `GEMINI_API_KEY` | Yes | AI enrichment, memo generation, scoring, chat |
| `BREVO_API_KEY` | Yes | All email-sending functions |
| `MAPBOX_TOKEN` | No | `get-mapbox-token` (maps feature) |
| `FIRECRAWL_API_KEY` | No | `firecrawl-scrape` (web scraping for enrichment) |
| `APIFY_API_TOKEN` | No | `apify-linkedin-scrape`, `apify-google-reviews` |
| `PANDADOC_API_KEY` | No | `create-pandadoc-document` (e-signatures) |
| `FIREFLIES_API_KEY` | No | `fetch-fireflies-content` (transcriptions) |

---

## Build Process

### Production Build

```bash
npm run build
```

This runs `vite build` which:

1. Compiles TypeScript to JavaScript.
2. Bundles all modules with tree-shaking.
3. Splits vendor chunks (recharts, tiptap, mapbox) for optimal loading.
4. Strips `console.log` calls and `debugger` statements in production mode.
5. Outputs to the `dist/` directory.

### Verifying the Build

```bash
# Preview the production build locally
npm run preview
```

This serves the `dist/` directory on a local port for verification before deployment.

### Development Build

```bash
npm run build:dev
```

Builds with development mode settings (preserves console output, no stripping).

---

## Supabase Project Setup

### 1. Create a Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard).
2. Click **New Project**.
3. Choose your organization, set a project name and database password.
4. Select a region close to your users.
5. Note the **Project URL**, **Anon Key**, and **Service Role Key** from **Settings > API**.

### 2. Configure Authentication

In **Authentication > Configuration**:

- **Site URL**: Set to your production domain (e.g., `https://marketplace.sourcecodeals.com`).
- **Redirect URLs**: Add all allowed redirect URLs:
  ```
  https://marketplace.sourcecodeals.com
  https://marketplace.sourcecodeals.com/auth/callback
  https://marketplace.sourcecodeals.com/verification-success
  https://marketplace.sourcecodeals.com/verify-email-handler
  https://marketplace.sourcecodeals.com/pending-approval
  ```
- **Email**: Enable email confirmations and double-confirm changes.
- **JWT Expiry**: 3600 seconds (1 hour).
- **Refresh Token Rotation**: Enabled with 10-second reuse interval.

### 3. Configure Storage

In **Storage**:

1. Create a storage bucket for data room documents (e.g., `deal-documents`).
2. Set the file size limit to 50 MiB.
3. Configure bucket-level RLS policies (edge functions handle access control).

### 4. Link the Supabase CLI

```bash
supabase login
supabase link --project-ref <project-id>
```

---

## Edge Function Deployment

### Deploy All Functions

```bash
supabase functions deploy --project-ref <project-id>
```

This deploys all functions in `supabase/functions/` (excluding the `_shared/` directory, which is bundled into each function).

### Deploy a Single Function

```bash
supabase functions deploy <function-name> --project-ref <project-id>
```

### JWT Verification

Function-level JWT settings are defined in `supabase/config.toml`. Functions that accept service-to-service calls (e.g., `score-buyer-deal`, `process-enrichment-queue`) have `verify_jwt = false` and rely on internal auth checks via `requireAdmin()` or service role validation.

After deployment, verify JWT settings in the Supabase dashboard under **Edge Functions**.

### Verify Deployment

Test a function with curl:

```bash
curl -X POST \
  https://<project-id>.supabase.co/functions/v1/<function-name> \
  -H "Authorization: Bearer <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

---

## Database Migrations

### Apply All Migrations

```bash
supabase db push --project-ref <project-id>
```

This applies all pending migrations from `supabase/migrations/` to the remote database.

### Verify Migration Status

```bash
supabase migration list --project-ref <project-id>
```

### Create a New Migration

```bash
supabase migration new <descriptive-name>
```

Edit the generated SQL file in `supabase/migrations/`, then push.

### Reset Local Database

For local development, reset and re-apply all migrations:

```bash
supabase db reset
```

**Warning**: This destroys all local data. Never run this against production.

---

## Frontend Deployment

### Static Hosting (Generic)

1. Build the project: `npm run build`
2. Deploy the `dist/` directory to your hosting provider.
3. Configure the hosting provider to serve `index.html` for all routes (SPA fallback).

### Lovable Deployment

The project is configured for Lovable deployment:

1. Open the [Lovable project](https://lovable.dev/projects/8df57f00-890e-4371-9d16-50cee978b26f).
2. Click **Share > Publish**.

### Custom Domain

To connect a custom domain:

1. Navigate to **Project > Settings > Domains** in Lovable.
2. Click **Connect Domain** and follow the DNS configuration steps.

### SPA Routing Configuration

Since this is a single-page application, the hosting provider must be configured to route all paths to `index.html`. Examples:

**Vercel** (`vercel.json`):
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

**Netlify** (`_redirects`):
```
/*    /index.html   200
```

**Nginx**:
```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

---

## Production Checklist

### Before Deployment

- [ ] **Environment variables**: All `VITE_*` variables are set in the build environment.
- [ ] **Edge function secrets**: All required secrets are configured in Supabase dashboard.
- [ ] **Build succeeds**: `npm run build` completes without errors.
- [ ] **Tests pass**: `npm test` passes all tests.
- [ ] **Lint clean**: `npm run lint` reports no errors.
- [ ] **Migrations applied**: All pending migrations are pushed to the remote database.
- [ ] **Edge functions deployed**: All functions are deployed and accessible.

### Authentication

- [ ] **Site URL** matches the production domain in Supabase Auth settings.
- [ ] **Redirect URLs** include all production callback paths.
- [ ] **Email templates** are configured for verification, password reset, and magic link.
- [ ] **JWT expiry** is set to 3600 seconds.
- [ ] **Refresh token rotation** is enabled.

### Security

- [ ] **RLS enabled** on all database tables (verify with `SELECT tablename FROM pg_tables WHERE schemaname = 'public'` cross-referenced against RLS status).
- [ ] **Service role key** is never exposed to the client. Only used in edge functions.
- [ ] **CORS** is properly configured in edge functions (allowlist in `_shared/cors.ts`).
- [ ] **Rate limiting** is active on authentication endpoints.
- [ ] **SSRF protection** is enabled in edge functions that make external HTTP requests.
- [ ] **Input sanitization** is applied to user-provided content (HTML, URLs).

### Performance

- [ ] **Code splitting** is active (verify chunk sizes in build output).
- [ ] **Console stripping** is active in production build.
- [ ] **Vendor chunks** are split correctly (recharts, tiptap, mapbox).
- [ ] **Gzip/Brotli compression** is enabled on the hosting provider.
- [ ] **Cache headers** are configured for static assets (long TTL for hashed assets).

### Monitoring

- [ ] **Error logging** is active (edge function `error-logger`, client-side `error-handler.ts`).
- [ ] **Audit logging** triggers are active on the `profiles` table.
- [ ] **Analytics tracking** is configured (GA4 integration in `ga4.ts`).

---

## Monitoring and Maintenance

### Supabase Dashboard

- **Database**: Monitor query performance, table sizes, and connection counts.
- **Auth**: Monitor active sessions, sign-up rates, and failed login attempts.
- **Edge Functions**: Monitor invocation counts, error rates, and execution duration.
- **Storage**: Monitor bucket sizes and download counts.

### Scheduled Jobs

The platform uses Supabase cron jobs (configured via migrations) for:

- **Materialized view refresh** (`refresh_materialized_views_safe`): Refreshes dashboard aggregate views.
- **Daily metrics aggregation** (`update_daily_metrics`): Computes daily analytics.
- **Enrichment queue processing**: Processes pending enrichment jobs.
- **Cron log cleanup** (`cleanup_old_cron_logs`): Purges old job logs.

### Error Recovery

- **Data recovery**: Use `restore_profile_data_automated()` RPC to restore corrupted profile data from snapshots.
- **Orphaned users**: Use `check_orphaned_auth_users()` and `sync_missing_profiles()` to fix auth/profile mismatches.
- **Soft delete restoration**: Use `restore_soft_deleted(table_name, record_id)` to undo accidental deletions.

---

## Rollback Procedures

### Frontend Rollback

Redeploy the previous version's `dist/` directory from the hosting provider's deployment history.

### Edge Function Rollback

Supabase does not maintain function version history. To rollback:

1. Check out the previous Git commit.
2. Redeploy the function:
   ```bash
   supabase functions deploy <function-name> --project-ref <project-id>
   ```

### Database Rollback

Supabase migrations are forward-only. To rollback a migration:

1. Write a new migration that reverses the changes.
2. Apply it:
   ```bash
   supabase db push --project-ref <project-id>
   ```

For catastrophic failures, restore from a Supabase database backup (available in the dashboard under **Database > Backups**).
