# Data Architecture Implementation Roadmap

**Created:** 2026-03-04
**Source:** [DATA_ARCHITECTURE_AUDIT_2026-03-04.md](../DATA_ARCHITECTURE_AUDIT_2026-03-04.md)
**Related:** [SCHEMA_REFACTOR_STRATEGY.md](SCHEMA_REFACTOR_STRATEGY.md)

This document provides concrete, step-by-step implementation plans for each phase of the data architecture improvements. Each phase is independently valuable.

---

## Phase 1: Single Source of Truth for Buyer Data (2-3 weeks)

**Goal:** The `buyers` table (formerly `remarketing_buyers`) becomes the canonical source for all buyer organization data. `profiles` only holds personal/auth info.

### Step 1.1: Audit current read paths

Map every frontend query that reads buyer org data from `profiles`:

| Data Point | Current Source | Target Source |
|-----------|---------------|---------------|
| `company_name` | `profiles.company`, `profiles.company_name` | `buyers.company_name` |
| `buyer_type` | `profiles.buyer_type` (camelCase) | `buyers.buyer_type` (snake_case) |
| `target_deal_size_min/max` | `profiles.target_deal_size_min/max` | `buyers.target_revenue_min/max` |
| `ideal_target_description` | `profiles.ideal_target_description` | `buyers.thesis_summary` |
| `geographic_focus` | `profiles.geographic_focus` | `buyers.geographic_focus` |

### Step 1.2: Create a `get_buyer_profile(user_id)` RPC

```sql
CREATE OR REPLACE FUNCTION get_buyer_profile(p_user_id uuid)
RETURNS TABLE (
  -- Personal (from profiles)
  user_id uuid,
  first_name text,
  last_name text,
  email text,
  phone_number text,
  avatar_url text,
  -- Organization (from buyers)
  buyer_id uuid,
  company_name text,
  buyer_type text,
  thesis_summary text,
  target_revenue_min numeric,
  target_revenue_max numeric,
  geographic_focus text[],
  -- Agreement (from firm_agreements via RPC)
  nda_signed boolean,
  fee_agreement_signed boolean
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.first_name,
    p.last_name,
    p.email,
    p.phone_number,
    p.avatar_url,
    b.id AS buyer_id,
    b.company_name,
    b.buyer_type,
    b.thesis_summary,
    b.target_revenue_min,
    b.target_revenue_max,
    b.geographic_focus,
    COALESCE(c.nda_signed, false) AS nda_signed,
    COALESCE(c.fee_agreement_signed, false) AS fee_agreement_signed
  FROM profiles p
  LEFT JOIN buyers b ON b.marketplace_user_id = p.id
  LEFT JOIN contacts c ON c.profile_id = p.id AND c.contact_type = 'buyer'
  WHERE p.id = p_user_id;
END;
$$;
```

### Step 1.3: Normalize buyer_type enums

```sql
-- Normalize profiles.buyer_type camelCase → snake_case
UPDATE profiles SET buyer_type = CASE buyer_type
  WHEN 'privateEquity' THEN 'private_equity'
  WHEN 'familyOffice' THEN 'family_office'
  WHEN 'searchFund' THEN 'search_fund'
  WHEN 'strategicAcquirer' THEN 'strategic_acquirer'
  WHEN 'independentSponsor' THEN 'independent_sponsor'
  WHEN 'holdingCompany' THEN 'holding_company'
  ELSE buyer_type
END
WHERE buyer_type ~ '[A-Z]';  -- Only update camelCase values
```

### Step 1.4: Update frontend hooks

Replace direct `profiles` reads with the new RPC. Priority hooks to update:

- `src/hooks/use-marketplace.ts` — marketplace buyer display
- `src/hooks/admin/use-admin-listings.ts` — admin buyer details
- `src/hooks/admin/deals/useDealsList.ts` — deal buyer info

### Step 1.5: Deprecate duplicate columns

After all reads are migrated, add comments to the deprecated columns and stop writing to them. Do NOT drop columns yet — keep them read-only for 30 days as a safety net.

### Risk: Medium — buyer data is business-critical. Test each migration step against staging before production.

---

## Phase 2: Migration Squash (1 week)

**Goal:** Replace 767 migration files with a single baseline that represents the current production schema.

### Step 2.1: Generate baseline schema dump

```bash
# Against production database
pg_dump --schema-only --no-owner --no-privileges \
  --exclude-schema=auth --exclude-schema=storage \
  --exclude-schema=supabase_functions \
  "$DATABASE_URL" > supabase/migrations/00000000000000_baseline.sql
```

### Step 2.2: Archive historical migrations

```bash
mkdir -p supabase/migrations/_archive
mv supabase/migrations/2025*.sql supabase/migrations/_archive/
mv supabase/migrations/2026*.sql supabase/migrations/_archive/
# Keep only the baseline
```

### Step 2.3: Update migration tracking

```sql
-- Mark the baseline as applied in the migrations table
INSERT INTO supabase_migrations.schema_migrations (version)
VALUES ('00000000000000')
ON CONFLICT DO NOTHING;
```

### Step 2.4: Verify

```bash
# Fresh environment should start clean
supabase db reset  # Uses baseline only
```

### Risk: Low — this is a standard practice. The archive preserves all history.

---

## Phase 3: Email Function Consolidation (1-2 weeks)

**Goal:** Replace 32 email/notification edge functions with 2 template-based functions.

### Current inventory (32 functions):

**Send-prefixed (20):** `send-approval-email`, `send-connection-notification`, `send-contact-response`, `send-data-recovery-email`, `send-deal-alert`, `send-deal-referral`, `send-fee-agreement-email`, `send-fee-agreement-reminder`, `send-feedback-email`, `send-feedback-notification`, `send-marketplace-invitation`, `send-memo-email`, `send-nda-email`, `send-nda-reminder`, `send-owner-inquiry-notification`, `send-owner-intro-notification`, `send-password-reset-email`, `send-simple-verification-email`, `send-task-notification-email`, `send-templated-approval-email`, `send-user-notification`, `send-verification-success-email`

**Notify-prefixed (12):** `enhanced-admin-notification`, `notify-admin-document-question`, `notify-admin-new-message`, `notify-buyer-new-message`, `notify-buyer-rejection`, `notify-deal-owner-change`, `notify-deal-reassignment`, `notify-new-deal-owner`, `notify-remarketing-match`, `send-owner-intro-notification`, `send-owner-inquiry-notification`, `user-journey-notifications`

### Target: 2 functions

**`send-transactional-email`** — single template-based email sender:

```typescript
// supabase/functions/send-transactional-email/index.ts
interface EmailRequest {
  template: EmailTemplate;
  to: string | string[];
  variables: Record<string, string>;
  replyTo?: string;
}

type EmailTemplate =
  | 'approval'
  | 'nda_request'
  | 'nda_reminder'
  | 'fee_agreement'
  | 'fee_agreement_reminder'
  | 'verification'
  | 'verification_success'
  | 'password_reset'
  | 'data_recovery'
  | 'deal_alert'
  | 'deal_referral'
  | 'connection_notification'
  | 'contact_response'
  | 'marketplace_invitation'
  | 'memo'
  | 'feedback'
  | 'task_notification'
  | 'owner_intro'
  | 'owner_inquiry';
```

**`send-notification`** — in-app + push notification handler:

```typescript
// supabase/functions/send-notification/index.ts
interface NotificationRequest {
  type: NotificationType;
  recipientId: string;
  entityId?: string;
  entityType?: string;
  metadata?: Record<string, unknown>;
  channels: ('in_app' | 'email' | 'push')[];
}

type NotificationType =
  | 'admin_alert'
  | 'buyer_rejection'
  | 'buyer_message'
  | 'deal_reassignment'
  | 'deal_owner_change'
  | 'remarketing_match'
  | 'document_question'
  | 'journey_update';
```

### Migration strategy:

1. Create the two new functions with all templates
2. Update callers one-by-one to use the new functions
3. Keep old functions as thin wrappers during transition
4. Remove old functions after 2-week verification period

### Risk: Low per function — do incrementally. Shared modules `brevo-sender.ts` and `email-logger.ts` stay as-is.

---

## Phase 4: Replace Trigger Chains with RPCs (2 weeks)

**Goal:** Eliminate multi-trigger chains that create invisible side effects.

### 4.1: Pipeline deal creation

Replace the 4-trigger chain on `connection_requests` INSERT:

```sql
CREATE OR REPLACE FUNCTION create_pipeline_deal(p_connection_request_id uuid)
RETURNS uuid  -- returns the new deal ID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_cr record;
  v_deal_id uuid;
  v_buyer_contact_id uuid;
  v_seller_contact_id uuid;
BEGIN
  -- 1. Fetch the connection request
  SELECT * INTO v_cr FROM connection_requests WHERE id = p_connection_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Connection request % not found', p_connection_request_id;
  END IF;

  -- 2. Ensure source is set (replaces ensure_source_from_lead trigger)
  IF v_cr.source IS NULL THEN
    UPDATE connection_requests SET source = 'marketplace' WHERE id = v_cr.id;
    v_cr.source := 'marketplace';
  END IF;

  -- 3. Compute buyer priority score (replaces update_buyer_priority_score trigger)
  -- Score computation logic here
  UPDATE connection_requests
  SET buyer_priority_score = compute_buyer_priority(v_cr.user_id)
  WHERE id = v_cr.id;

  -- 4. Resolve contact IDs for the deal
  SELECT id INTO v_buyer_contact_id
  FROM contacts
  WHERE profile_id = v_cr.user_id AND contact_type = 'buyer'
  LIMIT 1;

  SELECT id INTO v_seller_contact_id
  FROM contacts
  WHERE listing_id = v_cr.listing_id
    AND contact_type = 'seller'
    AND is_primary_seller_contact = true
  LIMIT 1;

  -- 5. Create the deal (replaces auto_create_deal_from_connection_request trigger)
  INSERT INTO deal_pipeline (
    connection_request_id,
    listing_id,
    buyer_contact_id,
    seller_contact_id,
    source,
    buyer_priority_score,
    stage,
    created_at
  ) VALUES (
    v_cr.id,
    v_cr.listing_id,
    v_buyer_contact_id,
    v_seller_contact_id,
    v_cr.source,
    v_cr.buyer_priority_score,
    'new',
    now()
  ) RETURNING id INTO v_deal_id;

  -- 6. Log the action (observable, debuggable)
  INSERT INTO trigger_logs (trigger_name, table_name, record_id, action, metadata)
  VALUES ('create_pipeline_deal', 'deal_pipeline', v_deal_id, 'INSERT',
    jsonb_build_object('connection_request_id', p_connection_request_id));

  RETURN v_deal_id;
END;
$$;
```

### 4.2: Agreement propagation

Replace the agreement trigger chain with an explicit RPC:

```sql
CREATE OR REPLACE FUNCTION update_agreement_status(
  p_firm_agreement_id uuid,
  p_field text,  -- 'nda_status' or 'fee_agreement_status'
  p_new_status text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- 1. Update firm_agreements (single source of truth)
  IF p_field = 'nda_status' THEN
    UPDATE firm_agreements SET nda_status = p_new_status, updated_at = now()
    WHERE id = p_firm_agreement_id;
  ELSIF p_field = 'fee_agreement_status' THEN
    UPDATE firm_agreements SET fee_agreement_status = p_new_status, updated_at = now()
    WHERE id = p_firm_agreement_id;
  END IF;

  -- 2. Log the change (replaces log_agreement_status_change trigger)
  INSERT INTO fee_agreement_logs (firm_agreement_id, field_changed, new_value, changed_at)
  VALUES (p_firm_agreement_id, p_field, p_new_status, now());

  -- 3. Sync to buyers if needed (replaces sync_fee_agreement_to_remarketing trigger)
  IF p_field = 'fee_agreement_status' AND p_new_status = 'signed' THEN
    UPDATE buyers b
    SET fee_agreement_signed = true, updated_at = now()
    FROM firm_agreements fa
    WHERE fa.id = p_firm_agreement_id
      AND b.marketplace_firm_id = fa.id;
  END IF;
END;
$$;
```

### Risk: Medium — requires coordinated changes to triggers + RPC + frontend. Test thoroughly on staging.

---

## Phase 5: Global Rate Limiter and Cost Tracking (1 week)

**Goal:** Prevent API overages and give cost visibility across all enrichment queues.

### 5.1: Create semaphore table

```sql
CREATE TABLE IF NOT EXISTS api_semaphore (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,          -- 'gemini', 'claude', 'firecrawl', etc.
  slot_holder text NOT NULL,       -- edge function name that acquired the slot
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,  -- auto-release after timeout
  released_at timestamptz,
  metadata jsonb DEFAULT '{}'
);

CREATE INDEX idx_api_semaphore_provider_active
ON api_semaphore (provider)
WHERE released_at IS NULL AND expires_at > now();

-- Rate limits per provider
CREATE TABLE IF NOT EXISTS api_rate_limits (
  provider text PRIMARY KEY,
  max_concurrent integer NOT NULL DEFAULT 3,
  max_per_minute integer DEFAULT NULL,
  max_per_hour integer DEFAULT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Seed default limits
INSERT INTO api_rate_limits (provider, max_concurrent) VALUES
  ('gemini', 5),
  ('claude_haiku', 5),
  ('claude_sonnet', 3),
  ('firecrawl', 3),
  ('apify', 2),
  ('prospeo', 3),
  ('serper', 5)
ON CONFLICT (provider) DO NOTHING;
```

### 5.2: Acquire/release functions

```sql
CREATE OR REPLACE FUNCTION acquire_api_slot(
  p_provider text,
  p_caller text,
  p_timeout_seconds integer DEFAULT 300
)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_max integer;
  v_active integer;
  v_slot_id uuid;
BEGIN
  -- Get limit
  SELECT max_concurrent INTO v_max FROM api_rate_limits WHERE provider = p_provider;
  IF NOT FOUND THEN v_max := 3; END IF;

  -- Count active slots (auto-expire old ones)
  DELETE FROM api_semaphore WHERE expires_at < now() AND released_at IS NULL;

  SELECT count(*) INTO v_active
  FROM api_semaphore
  WHERE provider = p_provider AND released_at IS NULL;

  IF v_active >= v_max THEN
    RETURN NULL;  -- No slot available
  END IF;

  -- Acquire
  INSERT INTO api_semaphore (provider, slot_holder, expires_at)
  VALUES (p_provider, p_caller, now() + (p_timeout_seconds || ' seconds')::interval)
  RETURNING id INTO v_slot_id;

  RETURN v_slot_id;
END;
$$;

CREATE OR REPLACE FUNCTION release_api_slot(p_slot_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE api_semaphore SET released_at = now() WHERE id = p_slot_id;
END;
$$;
```

### 5.3: Wire up cost tracking

Update the `_shared/cost-tracker.ts` module to log every AI call to `enrichment_cost_log`:

```typescript
// In each edge function that calls an AI provider:
const slot = await supabase.rpc('acquire_api_slot', {
  p_provider: 'claude_sonnet',
  p_caller: 'enrich-deal'
});
if (!slot.data) {
  // Queue for retry instead of proceeding
  return new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429 });
}

try {
  const result = await callClaude(prompt);
  await logCost('claude_sonnet', result.usage);
} finally {
  await supabase.rpc('release_api_slot', { p_slot_id: slot.data });
}
```

### Risk: Low — additive changes, no existing behavior modified.

---

## Phase 6: Frontend Data Access Layer (3-4 weeks)

**Goal:** Replace raw `.from()` calls with typed domain functions, making schema changes 10x easier.

### Architecture

Build on the existing `src/lib/database.ts` foundation:

```
src/lib/data-access/
├── index.ts              # Re-exports all modules
├── listings.ts           # Listing queries
├── buyers.ts             # Buyer queries
├── deals.ts              # Deal/pipeline queries
├── contacts.ts           # Contact queries
├── agreements.ts         # Agreement queries
├── analytics.ts          # Analytics queries
├── admin.ts              # Admin-specific queries
└── types.ts              # Shared return types
```

### Example: `listings.ts`

```typescript
import { supabase } from '@/integrations/supabase/client';
import { safeQuery, type DatabaseResult } from '@/lib/database';

export interface ListingSummary {
  id: string;
  title: string;
  description: string;
  asking_price: number;
  revenue: number;
  status: string;
  created_at: string;
  category: string;
  location: string;
}

export async function getActiveListings(
  options?: { limit?: number; offset?: number; category?: string }
): Promise<DatabaseResult<ListingSummary[]>> {
  return safeQuery(async () => {
    let query = supabase
      .from('listings')
      .select('id, title, description, asking_price, revenue, status, created_at, category, location')
      .eq('status', 'active')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (options?.category) {
      query = query.eq('category', options.category);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }
    if (options?.offset) {
      query = query.range(options.offset, options.offset + (options.limit ?? 25) - 1);
    }

    return query;
  });
}

export async function getListingById(id: string): Promise<DatabaseResult<ListingSummary>> {
  return safeQuery(async () => {
    return supabase
      .from('listings')
      .select('id, title, description, asking_price, revenue, status, created_at, category, location')
      .eq('id', id)
      .single();
  });
}
```

### Migration strategy:

1. Create the data access modules alongside existing hooks
2. Update hooks one-by-one to use the new functions
3. Each hook migration is a small, reviewable PR
4. Existing `database.ts` generic helpers continue to work

### Risk: Low — additive changes. Hooks can be migrated incrementally.

---

## Phase 7: Consolidate Analytics Tables + Schema Separation (2 weeks)

### 7.1: Drop unused analytics tables

Based on the analytics audit:

```sql
-- engagement_scores: function dropped, only 2 stale references
DROP TABLE IF EXISTS engagement_scores CASCADE;
```

### 7.2: Consolidate admin view tables

Replace 4 identical tables with 1:

```sql
-- See migration: supabase/migrations/YYYYMMDDHHMMSS_consolidate_admin_view_state.sql
CREATE TABLE admin_view_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  view_type text NOT NULL,  -- 'connection_requests', 'deal_sourcing', 'owner_leads', 'users'
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(admin_id, view_type)
);

-- Migrate data from the 4 old tables
INSERT INTO admin_view_state (admin_id, view_type, last_viewed_at, created_at, updated_at)
SELECT admin_id, 'connection_requests', last_viewed_at, created_at, updated_at
FROM admin_connection_requests_views
ON CONFLICT (admin_id, view_type) DO NOTHING;

-- Repeat for other 3 tables...

-- Create backward-compatible views
CREATE VIEW admin_connection_requests_views AS
SELECT id, admin_id, last_viewed_at, created_at, updated_at
FROM admin_view_state WHERE view_type = 'connection_requests';

-- Repeat for other 3 views...
```

### 7.3: Schema separation for analytics

```sql
CREATE SCHEMA IF NOT EXISTS analytics;

-- Move analytics tables to new schema
ALTER TABLE page_views SET SCHEMA analytics;
ALTER TABLE user_events SET SCHEMA analytics;
ALTER TABLE search_analytics SET SCHEMA analytics;
ALTER TABLE daily_metrics SET SCHEMA analytics;

-- Create views in public schema for backward compatibility
CREATE VIEW public.page_views AS SELECT * FROM analytics.page_views;
CREATE VIEW public.user_events AS SELECT * FROM analytics.user_events;
CREATE VIEW public.search_analytics AS SELECT * FROM analytics.search_analytics;
CREATE VIEW public.daily_metrics AS SELECT * FROM analytics.daily_metrics;
```

### Risk: Medium for schema separation (requires updating RLS policies). Low for table consolidation.

---

## Phase 8: Break Up Monolith Edge Functions (3-4 weeks)

### Target functions:

| Function | Lines | Split Into |
|----------|-------|-----------|
| `score-buyer-deal` (1,952) | → `_shared/scorers/geography.ts`, `_shared/scorers/size.ts`, `_shared/scorers/service.ts`, `_shared/scorers/compose.ts` |
| `enrich-deal` (1,699) | → `_shared/enrichment/scraper.ts`, `_shared/enrichment/ai-extract.ts`, `_shared/enrichment/linkedin.ts`, `_shared/enrichment/reviews.ts` |
| `enrich-buyer` (1,360) | → `_shared/enrichment/buyer-ai.ts`, `_shared/enrichment/buyer-contacts.ts` |

### Strategy:

1. Extract logic into shared modules (testable independently)
2. Keep the edge function as a thin orchestrator that calls the modules
3. Each module has its own error handling and logging
4. Write unit tests for each module

### Risk: Low per module — the function behavior doesn't change, only the internal organization.

---

## Phase 9: Event-Driven Architecture (4-6 weeks)

### 9.1: Expand global_activity_queue schema

```sql
ALTER TABLE global_activity_queue ADD COLUMN IF NOT EXISTS
  event_type text NOT NULL DEFAULT 'generic';
ALTER TABLE global_activity_queue ADD COLUMN IF NOT EXISTS
  entity_type text;
ALTER TABLE global_activity_queue ADD COLUMN IF NOT EXISTS
  entity_id uuid;
ALTER TABLE global_activity_queue ADD COLUMN IF NOT EXISTS
  actor_id uuid;
ALTER TABLE global_activity_queue ADD COLUMN IF NOT EXISTS
  processed_at timestamptz;

CREATE INDEX idx_gaq_event_type_unprocessed
ON global_activity_queue (event_type)
WHERE processed_at IS NULL;
```

### 9.2: Define event types

```sql
-- Standard event types
-- deal.created, deal.stage_changed, deal.enrichment_completed
-- buyer.approved, buyer.rejected, buyer.enrichment_completed
-- connection.requested, connection.approved, connection.rejected
-- agreement.nda_signed, agreement.fee_signed
-- document.uploaded, document.downloaded, document.viewed
```

### 9.3: Build event subscribers

Each subscriber is a lightweight edge function that polls for specific event types:

```typescript
// supabase/functions/event-subscriber-notifications/index.ts
// Subscribes to: deal.stage_changed, connection.approved
// Action: sends appropriate notification via send-transactional-email
```

### Risk: Medium — requires adoption across the codebase. Build incrementally.

---

## Quick Wins (Can do now)

These are changes that can be made immediately with minimal risk:

| Quick Win | Effort | Files Changed |
|-----------|--------|--------------|
| Regenerate `types.ts` after recent migrations | 10 min | 1 file |
| Drop `engagement_scores` table (unused) | 10 min | 1 migration |
| Consolidate 4 admin view tables → 1 | 2-3 hours | 1 migration + 8 hooks |
| Fix `page_views` schema mismatch bug | 1 hour | 2-3 files |
| Wire `cost-tracker.ts` into `enrich-deal` | 2 hours | 1 file |
| Update `reset_all_admin_notifications()` to include `owner_leads` | 10 min | 1 migration |

---

## Dependency Graph

```
Phase 1 (Buyer SSoT) ──────────┐
                                ├──→ Phase 4 (Trigger RPCs)
Phase 2 (Migration Squash) ────┘        │
                                         ├──→ Phase 9 (Events)
Phase 3 (Email Consolidation) ──────────┘

Phase 5 (Rate Limiter) ── standalone
Phase 6 (Data Access Layer) ── standalone (but benefits from Phase 1)
Phase 7 (Analytics) ── standalone
Phase 8 (Function Split) ── standalone (but benefits from Phase 5)
```

Phases 1-3 and 5-8 can be worked on in parallel by different developers.
