# Deal Architecture

> Single source of truth for how deals, listings, and contacts relate in the SourceCo platform.

## Table Relationships

```
firm_agreements
  └─ listings (firm_id → firm_agreements.id)
       ├─ deal_pipeline (listing_id → listings.id)   -- one listing, many deals
       ├─ marketplace_listings (view)                 -- public-safe subset of listings
       └─ listings.source_deal_id → listings.id       -- parent → child self-FK
```

## Core Tables

| Table | Purpose |
|---|---|
| `listings` | Single source of truth for all company/deal data (financials, address, services, contacts). Every deal starts here. |
| `deal_pipeline` | Tracks buyer engagement lifecycle (stages, NDA/fee-agreement status, follow-ups). Links a buyer to a listing. Formerly named `deals`. |
| `connection_requests` | Inbound buyer interest. Contains `lead_*` fields for the requesting buyer's contact info. Auto-creates a `deal_pipeline` row on approval. |
| `contacts` | Normalized contact records for manually-created deals where no `connection_request` exists. Linked via `deal_pipeline.buyer_contact_id`. |

## `source_deal_id` Model (Self-Referential FK on `listings`)

`listings.source_deal_id` points to another `listings.id` row, creating a parent → child relationship:

- **Parent listing** (internal deal): The original intake record, typically `is_internal_deal = true`. Contains the canonical company data extracted from transcripts, websites, or manual entry.
- **Child listing** (marketplace listing): Created via "Create Listing From Deal" (`CreateListingFromDeal.tsx`). Inherits data from the parent but is published to the marketplace with `is_internal_deal = false`.

### Key behaviors

1. `publish-listing` edge function flips `is_internal_deal` on the parent — it does NOT copy data to a child.
2. `CreateListingFromDeal.tsx` creates a new `listings` row with `source_deal_id` set to the parent's ID.
3. The `marketplace_listings` view filters to `is_internal_deal = false` and uses `MARKETPLACE_SAFE_COLUMNS` to exclude sensitive fields.

### Rules

- Never expose `source_deal_id` to non-admin users.
- Never write to the parent listing from marketplace code paths.
- A listing with `source_deal_id IS NOT NULL` is always a child copy.

## Column Ownership Rules

### Listings owns ALL company data

The `listings` table is the single source of truth for:

- **Financials**: `revenue`, `ebitda`, `ebitda_margin`, `asking_price`, `financial_notes`, `financial_followup_questions`
- **Company identity**: `internal_company_name`, `title`, `industry`, `services`, `service_mix`
- **Location**: `address`, `street_address`, `address_city`, `address_state`, `address_zip`, `address_country`, `geographic_states`, `number_of_locations`
- **Contacts**: `main_contact_name`, `main_contact_email`, `main_contact_phone`
- **Owner/transaction**: `owner_goals`, `ownership_structure`, `transition_preferences`, `special_requirements`, `timeline_notes`

### `deal_pipeline` owns deal-lifecycle data only

- **Stage**: `stage_id`, `stage_entered_at`
- **Status**: `nda_status`, `fee_agreement_status`, `priority`, `buyer_priority_score`
- **Assignment**: `assigned_to`, `primary_owner_id`
- **Tracking**: `followed_up`, `followed_up_at`, `negative_followed_up`, `negative_followed_up_at`
- **Value**: `value`, `probability`, `expected_close_date`
- **Links**: `listing_id`, `connection_request_id`, `buyer_contact_id`

### Buyer contact data lives on the source record

| Deal origin | Contact data location |
|---|---|
| Marketplace (via connection request) | `connection_requests.lead_name`, `lead_email`, `lead_company`, `lead_role`, `lead_phone` |
| Manually created deal | `contacts` table, linked via `deal_pipeline.buyer_contact_id` |

**`deal_pipeline` never stores contact fields directly.** The duplicate `contact_name`, `contact_email`, `contact_company`, `contact_phone`, `contact_role`, `company_address` columns were removed in this cleanup.

### RPC contact resolution

The `get_deals_with_buyer_profiles` and `get_deals_with_details` RPCs resolve buyer contact info using a COALESCE chain:

```sql
COALESCE(cr.lead_name, NULLIF(TRIM(bc.first_name || ' ' || bc.last_name), ''), ...) AS contact_name
```

Priority order: `connection_requests.lead_*` → `contacts` table → `profiles` table.

## Dropped Columns

### From `deal_pipeline` (Phase 2)

| Column | Reason |
|---|---|
| `contact_name` | Duplicated `connection_requests.lead_name` / `contacts.first_name + last_name` |
| `contact_email` | Duplicated `connection_requests.lead_email` / `contacts.email` |
| `contact_company` | Duplicated `connection_requests.lead_company` / `contacts.company` |
| `contact_phone` | Duplicated `connection_requests.lead_phone` / `contacts.phone` |
| `contact_role` | Duplicated `connection_requests.lead_role` / `contacts.title` |
| `company_address` | Duplicated `listings.address` / `listings.street_address` |
| `contact_title` | Alias for `contact_role` |

### From `listings` (Phase 3)

| Column | Reason |
|---|---|
| `seller_interest_analyzed_at` | Zero references in src/ and supabase/functions/ |
| `seller_interest_notes` | Zero references in src/ and supabase/functions/ |
| `manual_rank_set_at` | Zero references in src/ and supabase/functions/ |
| `lead_source_id` | Zero references in src/ and supabase/functions/ |

### NOT dropped from `listings`

| Column | Reason |
|---|---|
| `financial_followup_questions` | Actively used by AI transcript extraction pipeline (`deal-extraction.ts`, `extract-deal-transcript`, `extract-transcript`) |

## Migration Order

1. `20260601000000` — Rename `deals` → `deal_pipeline` (table, indexes, RLS, functions, triggers)
2. `20260601100000` — Migrate orphaned contact data from `deal_pipeline` to `contacts` table
3. `20260601200000` — Drop duplicate contact columns from `deal_pipeline`
4. `20260601300000` — Rewrite `get_deals_with_buyer_profiles` and `get_deals_with_details` RPCs
5. `20260601400000` — Drop dead columns from `listings`
