

# Build & Deploy the `ingest-webflow-deal-lead` Edge Function

## What needs to happen

The Webflow webhook is configured and firing. Now we need the edge function that receives those payloads, matches the deal, screens the lead, and inserts a connection request.

## Step 1: Add webhook secret

Add a `WEBFLOW_WEBHOOK_SECRET` secret so the edge function can authenticate incoming requests. Since Webflow webhooks don't support custom headers, we'll accept the secret as a query parameter: `?secret=YOUR_SECRET`. You'll update the Webflow webhook URL to include this parameter.

## Step 2: Create `supabase/functions/ingest-webflow-deal-lead/index.ts`

The function will:

1. **Authenticate** — check `?secret=` query param against `WEBFLOW_WEBHOOK_SECRET`
2. **Parse Webflow V2 payload** — extract form fields (`name`, `email`, `phone`, `company`, `message`) and the page path/slug from `payload.data` and `payload.siteId`/page context
3. **Match deal** — extract slug from the page URL, query `listings` where `webflow_slug = slug`. If no match, still insert the request but without a `listing_id` (or use a fallback "unmatched" approach, logging the slug for manual mapping later)
4. **Screen lead email** — query `profiles` by email. If found, set `user_id`; otherwise leave null and populate `lead_name`, `lead_email`, `lead_phone`, `lead_company`
5. **Deduplicate** — check if a connection request already exists for same email + same listing. If so, update the existing record's `source_metadata` with the new submission timestamp rather than creating a duplicate
6. **Insert into `connection_requests`** — with `source = 'webflow'`, `status = 'pending'`, full `source_metadata` containing the raw Webflow payload
7. **Trigger notification** — call `send-connection-notification` internally for admin alert
8. **Return 200** — Webflow expects a 200 response to confirm receipt

Key design decisions:
- CORS is not needed (server-to-server webhook, no browser involved)
- Uses service role client for all DB operations
- Graceful fallback if listing slug isn't mapped yet (logs warning, still captures lead)
- `verify_jwt = false` in config.toml since this is a webhook endpoint

## Step 3: Update `supabase/config.toml`

Add the function entry with `verify_jwt = false`.

## Step 4: Deploy and test

Deploy the function, then test with a curl call simulating a Webflow form submission payload.

## Step 5: Map your first listing

You'll need to set the `webflow_slug` on the listing that corresponds to your Webflow deal memo page. For example, for "infrastructure-services-contractor", we'll run:
```sql
UPDATE listings SET webflow_slug = 'infrastructure-services-contractor' WHERE title ILIKE '%asphalt%paving%';
```
You'll tell me which listings map to which Webflow slugs.

## After deployment — what you do

Update your Webflow webhook URL to include the secret parameter:
```
https://vhzipqarkmmfuqadefep.supabase.co/functions/v1/ingest-webflow-deal-lead?secret=YOUR_SECRET
```

## Files

| File | Change |
|------|--------|
| `supabase/functions/ingest-webflow-deal-lead/index.ts` | New edge function |
| `supabase/config.toml` | Add function entry with `verify_jwt = false` |
| Secret: `WEBFLOW_WEBHOOK_SECRET` | New secret for webhook authentication |

