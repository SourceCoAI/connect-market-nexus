# API and RPC Reference

This document covers the Supabase RPCs (database functions), edge functions, and key query patterns used in Connect Market Nexus.

---

## Table of Contents

- [Supabase RPC Functions](#supabase-rpc-functions)
- [Edge Functions](#edge-functions)
- [Key Query Patterns](#key-query-patterns)
- [Realtime Subscriptions](#realtime-subscriptions)
- [Error Handling Patterns](#error-handling-patterns)

---

## Supabase RPC Functions

RPCs are PostgreSQL functions exposed through the Supabase PostgREST API. They are called from the frontend using `supabase.rpc('function_name', { params })`.

### Authentication and Authorization

#### `is_admin(user_id UUID) -> BOOLEAN`

Canonical admin role check. Used in RLS policies across all tables.

```typescript
const { data } = await supabase.rpc('is_admin', { user_id: userId });
```

#### `get_all_user_roles() -> TABLE`

Returns all user role assignments. Admin only.

```typescript
const { data } = await supabase.rpc('get_all_user_roles');
// Returns: { user_id, email, role, assigned_at, assigned_by }[]
```

#### `change_user_role(target_user_id UUID, new_role app_role, change_reason TEXT)`

Changes a user's role with audit logging.

```typescript
const { data } = await supabase.rpc('change_user_role', {
  target_user_id: userId,
  new_role: 'moderator',
  change_reason: 'Promoted to moderator'
});
```

#### `promote_user_to_admin(target_user_id UUID)`

Sets `is_admin = true` on the target profile.

#### `demote_admin_user(target_user_id UUID)`

Sets `is_admin = false` on the target profile.

---

### Deal Management

#### `get_deals_with_details() -> TABLE`

Returns all deals joined with listing, buyer (profile or remarketing_buyer), stage, and owner data. Admin only.

```typescript
const { data } = await supabase.rpc('get_deals_with_details');
```

Returns columns including: `deal_id`, `listing_id`, `listing_title`, `buyer_name`, `buyer_email`, `stage_name`, `stage_color`, `owner_name`, `status`, `priority`, `source`, `created_at`.

#### `move_deal_stage_with_ownership(deal_id UUID, new_stage_id UUID)`

Moves a deal to a new pipeline stage and logs the transition.

```typescript
const { data } = await supabase.rpc('move_deal_stage_with_ownership', {
  deal_id: dealId,
  new_stage_id: stageId,
});
```

#### `soft_delete_deal(deal_id UUID, deletion_reason TEXT)`

Soft-deletes a deal by setting `deleted_at` and logging the reason.

```typescript
const { data } = await supabase.rpc('soft_delete_deal', {
  deal_id: dealId,
  deletion_reason: 'Duplicate entry'
});
```

#### `restore_deal(deal_id UUID)`

Restores a soft-deleted deal.

#### `delete_listing_cascade(p_listing_id UUID)`

Hard-deletes a listing and all related records (connection requests, deals, scores, analytics, etc.).

#### `get_stage_deal_count(stage_uuid UUID) -> INTEGER`

Returns the number of active deals in a given pipeline stage.

#### `generate_deal_identifier() -> TEXT`

Generates the next sequential deal identifier (e.g., `D-0042`).

---

### Password Reset

#### `create_password_reset_token(user_email TEXT) -> TEXT`

Creates a secure, time-limited (1 hour) reset token. Returns `'token_sent'` regardless of whether the email exists (to prevent enumeration).

```typescript
const { data } = await supabase.rpc('create_password_reset_token', {
  user_email: 'user@example.com'
});
```

#### `validate_reset_token(token_value TEXT) -> UUID`

Validates a reset token and returns the associated `user_id`. Marks the token as used. Returns `NULL` if invalid or expired.

---

### Scoring and Matching

#### `match_deal_alerts_with_listing(listing_data JSONB) -> TABLE`

Matches a new listing against all active buyer deal alerts. Returns matching alert IDs and buyer IDs.

```typescript
const { data } = await supabase.rpc('match_deal_alerts_with_listing', {
  listing_data: { category: 'SaaS', revenue: 5000000, location: 'Texas' }
});
```

#### `calculate_engagement_score(p_listings_viewed INT, p_listings_saved INT, p_connections_requested INT, p_total_session_time INT) -> NUMERIC`

Calculates a weighted engagement score based on user activity metrics.

#### `calculate_buyer_priority_score(buyer_type_param TEXT) -> NUMERIC`

Assigns a priority score based on buyer type (PE firms score higher than individuals, etc.).

#### `upsert_deal_scoring_queue(...)` / `upsert_alignment_scoring_queue(...)`

Queues deals or buyer-deal pairs for background scoring processing.

---

### Data Room

#### `check_data_room_access(deal_id UUID, user_id UUID, category TEXT) -> BOOLEAN`

Verifies whether a buyer has access to a specific document category for a deal.

```typescript
const { data } = await supabase.rpc('check_data_room_access', {
  deal_id: dealId,
  user_id: userId,
  category: 'full_memo'  // 'anonymous_teaser' | 'full_memo' | 'data_room'
});
```

#### `log_data_room_event(...)`

Inserts an entry into the `data_room_audit_log` table.

Parameters: `deal_id`, `document_id`, `user_id`, `action`, `metadata`, `ip_address`.

#### `get_deal_access_matrix(p_deal_id UUID) -> TABLE`

Returns all buyer access levels for a specific deal. Admin only.

```typescript
const { data } = await supabase.rpc('get_deal_access_matrix', {
  p_deal_id: dealId
});
// Returns: { buyer_name, buyer_type, can_view_teaser, can_view_full_memo, can_view_data_room, fee_agreement_signed, ... }[]
```

#### `get_deal_distribution_log(p_deal_id UUID) -> TABLE`

Returns the complete distribution history for a deal (who received what, when, via which channel).

#### `get_buyer_deal_history(p_buyer_id UUID) -> TABLE`

Returns all deals a buyer has been involved with, including access levels and status.

#### `increment_link_open_count(p_link_id UUID)`

Increments the open counter on a tracked document link.

---

### Agreement Management

#### `update_fee_agreement_status(target_user_id UUID, is_signed BOOLEAN, admin_notes TEXT)`

Updates the fee agreement signed status on a user's profile.

#### `update_nda_status(target_user_id UUID, is_signed BOOLEAN, admin_notes TEXT)`

Updates the NDA signed status on a user's profile.

#### `update_fee_agreement_firm_status(...)` / `update_nda_firm_status(...)`

Updates agreement status at the firm level, affecting all firm members.

#### `get_or_create_firm(company_name TEXT, domain TEXT, ...) -> UUID`

Finds an existing firm by domain/name or creates a new one. Returns the firm ID.

#### `check_agreement_coverage(...)`

Checks whether all required agreements are in place for a buyer-deal combination.

#### `sync_agreement_status_from_booleans()`

Synchronizes legacy boolean agreement flags to the firm agreement tracking system.

#### `get_my_agreement_status() -> TABLE`

Returns the current user's agreement status. Used by buyers to check their own status.

---

### Analytics

#### `get_marketplace_analytics(days_back INTEGER DEFAULT 30) -> JSONB`

Returns aggregate marketplace metrics: active listings, total users, new signups, connection requests, approval rates, etc.

```typescript
const { data } = await supabase.rpc('get_marketplace_analytics', {
  days_back: 30
});
```

#### `get_feedback_analytics(days_back INTEGER DEFAULT 30) -> TABLE`

Returns feedback message statistics grouped by category and priority.

#### `update_daily_metrics(target_date DATE DEFAULT CURRENT_DATE)`

Computes and stores daily aggregate metrics. Called by cron job.

#### `get_engagement_analytics(time_range TEXT DEFAULT '30d') -> JSONB`

Returns user engagement statistics (session counts, page views, active users).

#### `get_connection_request_analytics(time_range TEXT DEFAULT '30d') -> JSONB`

Returns connection request statistics (submitted, approved, rejected, by source).

#### `get_remarketing_dashboard_stats(p_from_date TIMESTAMPTZ) -> TABLE`

Returns remarketing pipeline statistics.

---

### User Management

#### `delete_user_completely(target_user_id UUID)`

Cascade-deletes a user and all related data across all tables. Admin only. Irreversible.

```typescript
const { data } = await supabase.rpc('delete_user_completely', {
  target_user_id: userId
});
```

#### `restore_profile_data_automated()`

Restores corrupted profile data from `profile_data_snapshots`.

#### `check_orphaned_auth_users() -> TABLE`

Finds `auth.users` records without corresponding `profiles` rows.

#### `restore_soft_deleted(p_table_name TEXT, p_record_id UUID) -> BOOLEAN`

Restores a soft-deleted record by clearing the `deleted_at` timestamp.

#### `reset_all_admin_notifications()`

Marks all admin notifications as unread (used for testing/reset).

---

### Utility Functions

#### `normalize_company_name(company_name TEXT) -> TEXT`

Standardizes company names for deduplication (lowercase, strip suffixes like "LLC", "Inc").

#### `extract_domain(input_text TEXT) -> TEXT`

Extracts the domain from a URL or email address.

#### `normalize_domain(url TEXT) -> TEXT`

Normalizes a URL to its root domain for comparison.

#### `normalize_state_name(state_name TEXT) -> TEXT`

Normalizes US state names/abbreviations to a canonical form.

#### `update_updated_at_column()` (trigger function)

Generic trigger function that sets `updated_at = now()` on row updates.

---

## Edge Functions

Edge functions are Deno-based TypeScript functions deployed to Supabase. They handle server-side operations that require external API calls, elevated database permissions, or complex business logic.

All functions are in `supabase/functions/`. Shared modules are in `supabase/functions/_shared/`.

### Data Room Functions

| Function | Method | Auth | Description |
|---|---|---|---|
| `data-room-upload` | POST | Admin | Upload a document to a deal's data room |
| `data-room-download` | POST | Auth | Generate a signed download URL for a document |
| `data-room-access` | POST | Admin | Grant, revoke, or modify buyer access to a deal's data room |
| `record-data-room-view` | POST | Auth | Record a document view in the audit log |
| `grant-data-room-access` | POST | Admin | Simplified access grant |
| `generate-tracked-link` | POST | Admin | Create a tracked link for document sharing |
| `record-link-open` | POST | None | Record a tracked link open event |
| `log-pdf-download` | POST | Auth | Log PDF download events |

### AI and Memo Functions

| Function | Method | Auth | Description |
|---|---|---|---|
| `generate-lead-memo` | POST | Admin | AI-generate an anonymous teaser or full deal memo |
| `send-memo-email` | POST | Admin | Email a memo to buyers with distribution logging |
| `draft-outreach-email` | POST | Admin | AI-draft buyer outreach emails |
| `generate-ma-guide` | POST | None | Generate M&A industry guide |
| `generate-ma-guide-background` | POST | None | Background queue processor for guide generation |
| `generate-research-questions` | POST | Admin | AI-generate research questions for deals |
| `generate-buyer-intro` | POST | Admin | AI-generate buyer introduction text |
| `generate-guide-pdf` | POST | Admin | Generate PDF version of M&A guide |

### Enrichment Functions

| Function | Method | Auth | Description |
|---|---|---|---|
| `enrich-deal` | POST | None* | Multi-source deal data enrichment (website + AI) |
| `enrich-buyer` | POST | None* | Multi-source buyer enrichment |
| `enrich-external-only` | POST | None* | External-only enrichment (no AI) |
| `enrich-geo-data` | POST | None* | Geographic data enrichment |
| `enrich-session-metadata` | POST | None* | Session metadata enrichment |
| `process-enrichment-queue` | POST | None* | Batch process enrichment queue items |
| `process-buyer-enrichment-queue` | POST | None* | Batch process buyer enrichment queue |
| `firecrawl-scrape` | POST | Admin | Web scraping via Firecrawl API |
| `apify-linkedin-scrape` | POST | None* | LinkedIn profile scraping via Apify |
| `apify-google-reviews` | POST | None* | Google reviews scraping via Apify |
| `find-buyer-contacts` | POST | Admin | Contact discovery for buyer companies |
| `calculate-deal-quality` | POST | None* | Calculate deal quality metrics |

*None = `verify_jwt = false` in config; function uses internal auth checks or is called service-to-service.

### Scoring Functions

| Function | Method | Auth | Description |
|---|---|---|---|
| `score-buyer-deal` | POST | None* | Multi-dimensional buyer-deal fit scoring |
| `score-industry-alignment` | POST | None* | Industry-specific alignment scoring |
| `process-scoring-queue` | POST | None* | Batch process scoring queue |
| `recalculate-deal-weights` | POST | Admin | Recalculate scoring weights |
| `parse-fit-criteria` | POST | Admin | AI-parse investment criteria text |
| `analyze-scoring-patterns` | POST | Admin | Analyze scoring distribution patterns |

### Email Functions

| Function | Method | Auth | Description |
|---|---|---|---|
| `send-approval-email` | POST | Admin | User approval notification |
| `send-connection-notification` | POST | Admin | Connection request notification |
| `send-deal-alert` | POST | None* | New deal alerts to matching buyers |
| `send-fee-agreement-email` | POST | Admin | Fee agreement request |
| `send-nda-email` | POST | Admin | NDA request |
| `send-nda-reminder` | POST | None* | NDA follow-up reminder |
| `send-verification-email` | POST | None* | Email verification |
| `send-password-reset-email` | POST | None* | Password reset |
| `send-memo-email` | POST | Admin | Memo distribution |
| `send-feedback-email` | POST | Admin | Forward user feedback |
| `send-feedback-notification` | POST | Admin | Internal feedback notification |
| `send-deal-referral` | POST | Admin | Deal referral notification |
| `send-contact-response` | POST | Admin | Contact response email |
| `send-data-recovery-email` | POST | Admin | Data recovery notification |
| `send-owner-inquiry-notification` | POST | None* | Owner inquiry notification |
| `send-owner-intro-notification` | POST | Admin | Owner introduction notification |
| `send-task-notification-email` | POST | Admin | Task assignment notification |
| `send-user-notification` | POST | None* | General user notification |
| `send-simple-verification-email` | POST | None* | Simplified verification email |
| `send-verification-success-email` | POST | None* | Verification success email |
| `enhanced-email-delivery` | POST | None* | Enhanced email delivery with tracking |
| `admin-digest` | POST | Admin | Admin daily digest email |
| `admin-notification` | POST | Admin | Admin notification email |
| `enhanced-admin-notification` | POST | Admin | Enhanced admin notification |

### Chat and Query Functions

| Function | Method | Auth | Description |
|---|---|---|---|
| `chat-buyer-query` | POST | Auth | Interactive buyer universe chat (AI-powered) |
| `chat-remarketing` | POST | Admin | Remarketing data chat (AI-powered) |
| `query-buyer-universe` | POST | Admin | Structured buyer universe query |
| `suggest-universe` | POST | Admin | AI-suggest buyer universe criteria |
| `update-fit-criteria-chat` | POST | Admin | Chat-based criteria refinement |

### Transcript and Document Functions

| Function | Method | Auth | Description |
|---|---|---|---|
| `extract-transcript` | POST | Admin | Extract data from call transcript |
| `extract-buyer-transcript` | POST | None* | Extract buyer data from transcript |
| `extract-deal-transcript` | POST | None* | Extract deal data from transcript |
| `extract-deal-document` | POST | None* | Extract data from deal document |
| `extract-buyer-criteria` | POST | None* | Extract buyer investment criteria |
| `extract-buyer-criteria-background` | POST | None* | Background criteria extraction |
| `parse-transcript-file` | POST | Admin | Parse uploaded transcript file |
| `parse-tracker-documents` | POST | Admin | Parse tracker documents |
| `analyze-tracker-notes` | POST | Admin | AI-analyze tracker notes |
| `analyze-deal-notes` | POST | Admin | AI-analyze deal notes |
| `analyze-buyer-notes` | POST | Admin | AI-analyze buyer notes |
| `analyze-seller-interest` | POST | Admin | AI-analyze seller interest signals |
| `fetch-fireflies-content` | POST | Admin | Fetch content from Fireflies.ai |
| `search-fireflies-for-buyer` | POST | Admin | Search Fireflies for buyer mentions |
| `sync-fireflies-transcripts` | POST | Admin | Sync transcripts from Fireflies |

### User and Session Functions

| Function | Method | Auth | Description |
|---|---|---|---|
| `track-session` | POST | None* | Track user session start/end |
| `track-initial-session` | POST | Auth | Track initial session metadata |
| `session-heartbeat` | POST | None* | Session keepalive |
| `session-security` | POST | Admin | Session security checks |
| `track-engagement-signal` | POST | Admin | Track engagement signals |
| `error-logger` | POST | Auth | Client-side error logging |

### Admin and System Functions

| Function | Method | Auth | Description |
|---|---|---|---|
| `approve-marketplace-buyer` | POST | Admin | Approve a marketplace buyer |
| `publish-listing` | POST | None* | Publish a listing (trigger alerts) |
| `create-lead-user` | POST | Admin | Create a lead user account |
| `invite-team-member` | POST | Admin | Invite internal team member |
| `sync-missing-profiles` | POST | None* | Fix orphaned auth users |
| `sync-captarget-sheet` | POST | None* | Sync CapTarget Google Sheet |
| `cleanup-captarget-deals` | POST | Admin | Clean up CapTarget deal data |
| `bulk-import-remarketing` | POST | Admin | Bulk import remarketing data |
| `import-reference-data` | POST | Admin | Import reference data |
| `map-csv-columns` | POST | Admin | AI-map CSV columns to schema |
| `dedupe-buyers` | POST | Admin | Deduplicate buyer records |
| `aggregate-daily-metrics` | POST | None* | Aggregate daily analytics |
| `password-reset` | POST | None* | Process password reset |
| `password-security` | POST | Admin | Password security checks |
| `otp-rate-limiter` | POST | Admin | OTP rate limiting |
| `security-validation` | POST | Admin | Security validation checks |
| `rate-limiter` | POST | Admin | General rate limiting |
| `get-mapbox-token` | POST | Admin | Get Mapbox access token |
| `get-feedback-analytics` | POST | Admin | Get feedback analytics |
| `get-buyer-nda-embed` | POST | None* | Get buyer NDA embed URL |
| `validate-criteria` | POST | Admin | Validate buyer criteria |
| `validate-referral-access` | POST | Admin | Validate referral access |

### PandaDoc Functions

| Function | Method | Auth | Description |
|---|---|---|---|
| `create-pandadoc-document` | POST | Auth | Create a PandaDoc e-signature document |
| `pandadoc-webhook-handler` | POST | None | Handle PandaDoc webhook events |

### Notification Functions

| Function | Method | Auth | Description |
|---|---|---|---|
| `notify-new-deal-owner` | POST | None* | Notify new deal owner |
| `notify-deal-reassignment` | POST | None* | Notify on deal reassignment |
| `notify-deal-owner-change` | POST | None* | Notify on deal owner change |
| `notify-remarketing-match` | POST | None* | Notify on remarketing match |
| `user-journey-notifications` | POST | Admin | User journey milestone notifications |
| `approve-referral-submission` | POST | Admin | Approve a referral submission |
| `submit-referral-deal` | POST | Admin | Submit a referral deal |
| `auto-create-firm-on-approval` | POST | Auth | Auto-create firm when buyer is approved |
| `convert-to-pipeline-deal` | POST | Admin | Convert lead to pipeline deal |
| `calculate-valuation-lead-score` | POST | Admin | Score valuation leads |
| `clarify-industry` | POST | Admin | AI-clarify industry classification |

---

## Key Query Patterns

### Fetching Listings (Marketplace)

```typescript
const { data, error } = await supabase
  .from('listings')
  .select('*')
  .eq('status', 'active')
  .is('deleted_at', null)
  .order('rank_order', { ascending: true, nullsFirst: false })
  .range(offset, offset + perPage - 1);
```

RLS automatically filters out internal deals and soft-deleted records for non-admin users.

### Fetching User Profile

```typescript
const { data } = await supabase
  .from('profiles')
  .select('*')
  .eq('id', userId)
  .single();
```

### Creating a Connection Request

```typescript
const { data, error } = await supabase
  .from('connection_requests')
  .insert({
    listing_id: listingId,
    user_id: userId,
    status: 'pending',
    source: 'marketplace',
    user_message: message,
  })
  .select()
  .single();
```

### Fetching Deals with Details (Admin)

```typescript
const { data } = await supabase.rpc('get_deals_with_details');
```

### Fetching Remarketing Scores for a Listing

```typescript
const { data } = await supabase
  .from('remarketing_scores')
  .select(`
    *,
    remarketing_buyers (
      id, company_name, pe_firm_name, hq_state,
      target_revenue_min, target_revenue_max
    )
  `)
  .eq('listing_id', listingId)
  .order('composite_score', { ascending: false });
```

### Calling an Edge Function

```typescript
const { data, error } = await supabase.functions.invoke('enrich-deal', {
  body: { listing_id: listingId },
});
```

### Invoking with Timeout (Client Helper)

The project includes a timeout wrapper in `src/lib/invoke-with-timeout.ts`:

```typescript
import { invokeWithTimeout } from '@/lib/invoke-with-timeout';

const result = await invokeWithTimeout('generate-lead-memo', {
  deal_id: dealId,
  memo_type: 'anonymous_teaser',
}, 60000); // 60-second timeout
```

### React Query Integration

Queries use the key factories from `src/lib/query-keys.ts`:

```typescript
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { supabase } from '@/integrations/supabase/client';

function useListings() {
  return useQuery({
    queryKey: queryKeys.listings.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('status', 'active');
      if (error) throw error;
      return data;
    },
  });
}
```

---

## Realtime Subscriptions

The application uses Supabase Realtime for live updates:

### Listening for Connection Request Changes

```typescript
const channel = supabase
  .channel('connection-requests')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'connection_requests',
  }, (payload) => {
    // Invalidate React Query cache
    queryClient.invalidateQueries({ queryKey: queryKeys.connectionRequests.all });
  })
  .subscribe();
```

### Listening for Listing Updates (Admin)

```typescript
const channel = supabase
  .channel('listings')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'listings',
  }, (payload) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.listings.all });
  })
  .subscribe();
```

### Listening for Notifications

```typescript
const channel = supabase
  .channel('notifications')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'user_notifications',
    filter: `user_id=eq.${userId}`,
  }, (payload) => {
    // Show toast notification
  })
  .subscribe();
```

---

## Error Handling Patterns

### Edge Function Error Response Format

All edge functions return errors in a consistent JSON format:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE"
}
```

Common HTTP status codes:
- `400` -- Bad request (missing or invalid parameters)
- `401` -- Unauthorized (no valid JWT)
- `403` -- Forbidden (authenticated but insufficient permissions)
- `404` -- Resource not found
- `429` -- Rate limited
- `500` -- Internal server error

### Client-Side Error Handling

```typescript
import { errorHandler } from '@/lib/error-handler';

try {
  const { data, error } = await supabase.functions.invoke('some-function', {
    body: params,
  });

  if (error) {
    errorHandler(error, {
      component: 'MyComponent',
      operation: 'some-function',
    });
    return;
  }

  // Handle success
} catch (err) {
  errorHandler(err, {
    component: 'MyComponent',
    operation: 'some-function',
  }, 'critical');
}
```

### Edge Function Auth Guard Pattern

```typescript
import { requireAdmin } from '../_shared/auth.ts';
import { getCorsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const auth = await requireAdmin(req, supabaseAdmin);
  if (!auth.isAdmin) {
    return new Response(
      JSON.stringify({ error: auth.error }),
      { status: auth.authenticated ? 403 : 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Function logic here
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```
