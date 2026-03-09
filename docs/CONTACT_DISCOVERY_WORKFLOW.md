# Contact Discovery Workflow

How contacts are automatically discovered when a buyer/company is approved for deals.

---

## Overview

When an admin approves a buyer for one or more deals, the system automatically:

1. Updates scoring records to `approved`
2. Creates outreach tracking records
3. Creates buyer introduction Kanban cards at the first stage (`need_to_show_deal`)
4. **Fire-and-forget**: kicks off automatic contact discovery in the background

Contact discovery is non-blocking — approval completes immediately regardless of whether contacts are found.

---

## Entry Points

### Single Buyer, Multi-Deal Approval

**File**: `src/components/remarketing/ApproveBuyerMultiDealDialog.tsx`

An admin clicks "Approve" on a single buyer and selects which deals to approve them for. The mutation:

1. Updates existing `remarketing_scores` records to `status: 'approved'`
2. Creates new score records for unscored deals (upsert with `status: 'approved'`)
3. Creates `remarketing_outreach` records (`status: 'pending'`) for each score
4. Calls `findIntroductionContacts(buyerId, 'approval')` — fire-and-forget
5. Calls `createBuyerIntroductionFromApproval()` for each buyer-deal pair

### Bulk Approval (Multiple Buyers, Multiple Deals)

**File**: `src/components/remarketing/BulkApproveForDealsDialog.tsx`

Same flow but for multiple buyers at once. Key difference:

- Uses `Promise.allSettled(buyerIds.map(b => findIntroductionContacts(b, 'bulk_approval')))` to discover contacts for all buyers in parallel
- Uses `batchCreateBuyerIntroductions()` for introduction records
- Aggregates results into a single toast notification

---

## Contact Discovery Pipeline

### Step 1: Client-Side Orchestrator

**File**: `src/lib/remarketing/findIntroductionContacts.ts`

Fetches buyer details from the `buyers` table:

| Field | Purpose |
|-------|---------|
| `company_name` | Target company to search contacts for |
| `company_website` / `platform_website` | Used to extract email domain |
| `pe_firm_name` | PE firm name (if PE-backed) — triggers a parallel PE contact search |
| `pe_firm_website` | PE firm domain for LinkedIn resolution |
| `buyer_type` | Determines title filters (PE vs corporate) |

Extracts the email domain from the website URL, then invokes the `find-introduction-contacts` edge function.

**Returns** a `ContactSearchResult`:

```typescript
{
  success: boolean;
  pe_contacts_found: number;
  company_contacts_found: number;
  total_saved: number;
  skipped_duplicates: number;
  message?: string;
  firmName: string;
}
```

### Step 2: Introduction Contacts Edge Function

**File**: `supabase/functions/find-introduction-contacts/index.ts`

This is the server-side orchestrator. It coordinates the full discovery flow:

#### A. Pre-Check — Skip if Contacts Already Exist

Queries existing contacts for the buyer (`contacts` table where `remarketing_buyer_id = buyer_id` and `contact_type = 'buyer'`). If the count meets or exceeds the target, the function returns early with `status: 'skipped'`.

**Contact targets**:

| Buyer Type | PE Contacts | Company Contacts | Total Target |
|------------|-------------|------------------|--------------|
| Has PE firm name | 4 | 3 | 7 |
| No PE firm | 0 | 3 | 3 |

#### B. Parallel Contact Search

Calls the `find-contacts` edge function **twice in parallel** using `Promise.allSettled`:

**PE Firm Search** (only if `pe_firm_name` exists):
- `company_name`: PE firm name
- `company_domain`: PE firm website domain
- `title_filter`: `PE_TITLE_FILTER` (partner, managing director, VP, principal, BD, acquisitions, etc.)
- `target_count`: 6 (over-fetches to account for dedup losses)

**Company Search** (always):
- `company_name`: Target company name
- `company_domain`: Company website domain or email domain
- `title_filter`: `COMPANY_TITLE_FILTER` (CEO, CFO, COO, VP, BD, director, GM, etc.)
- `target_count`: 5 (over-fetches to account for dedup losses)

#### C. Deduplicate and Save

Merges PE + company results and deduplicates using this priority:

```
Dedup key: linkedin_url > email > full_name (all lowercased)
```

For each unique contact, inserts into the `contacts` table:

| Field | Value |
|-------|-------|
| `remarketing_buyer_id` | The approved buyer's ID |
| `firm_id` | Looked up from `remarketing_buyers.marketplace_firm_id` |
| `first_name` / `last_name` | Split from `full_name` |
| `title` | Job title from enrichment |
| `email` | Normalized to lowercase |
| `linkedin_url` | LinkedIn profile URL |
| `phone` | Phone number |
| `contact_type` | `'buyer'` |
| `source` | `'auto_introduction_approval'` |

Duplicate contacts (unique constraint violation `23505`) are counted as `skipped_duplicates` rather than errors.

#### D. Logging

Every discovery attempt is logged in `contact_discovery_log`:

| Field | Description |
|-------|-------------|
| `buyer_id` | The buyer being searched |
| `triggered_by` | Admin user ID |
| `trigger_source` | `'approval'` / `'bulk_approval'` / `'manual'` / `'retry'` |
| `status` | `'started'` → `'completed'` / `'partial'` / `'failed'` / `'skipped'` |
| `pe_contacts_found` | Count from PE firm search |
| `company_contacts_found` | Count from company search |
| `total_saved` | Contacts inserted into DB |
| `skipped_duplicates` | Contacts that already existed |
| `duration_ms` | Wall-clock time |
| `error_message` | Error details if failed |

**Status logic**:
- `skipped` — Already had enough contacts
- `completed` — Both searches succeeded
- `partial` — One search failed, the other succeeded
- `failed` — All searches failed

### Step 3: Contact Enrichment (find-contacts)

**File**: `supabase/functions/find-contacts/index.ts`

This is the low-level contact enrichment pipeline. It runs independently for each company/firm search.

#### 3.1 Cache Check

Checks `enriched_contacts` table for recent results (same company, within cache TTL). Returns cached results if available.

#### 3.2 Resolve Company LinkedIn URL

Three-tier resolution:

1. **Has domain?** → Blitz `domainToLinkedIn()`
2. **No domain?** → Serper `discoverCompanyDomain()` → then Blitz `domainToLinkedIn()`
3. **Blitz fails?** → Serper `findCompanyLinkedIn()` (Google search fallback)

#### 3.3 Find Contacts — 3-Tier Cascade

**Primary (Blitz)**:
- `waterfallIcpSearch()` with cascading title filters:
  - **Tier 1**: C-suite / Partners (most senior)
  - **Tier 2**: VPs / Directors
  - **Tier 3**: Associates / BD
- Supplemented with `employeeFinder()` if the waterfall doesn't meet `target_count`

**Fallback (Serper)**:
- Google search with site:linkedin.com queries if Blitz returns no results

#### 3.4 Title Filtering

Matches contacts against the provided `title_filter` array using expanded aliases:

| Filter Key | Matches |
|------------|---------|
| `partner` | partner, managing partner, general partner, senior partner, operating partner, venture partner, founding partner, equity partner |
| `vp` | vp, vice president, svp, evp, vp of operations, vp finance, vp business development, etc. |
| `director` | director, managing director, sr director, associate director, director of operations, etc. |
| `ceo` | ceo, chief executive officer, president, owner, founder, co-founder, managing member, GM |
| `cfo` | cfo, chief financial officer, head of finance, finance director, controller |
| `bd` | business development, corp dev, corporate development, strategic partnerships, M&A |

#### 3.5 CRM Pre-Check

Skips contacts that already exist in the system with a known email address to avoid redundant enrichment.

#### 3.6 Email + Phone Enrichment — 3-Tier

1. **Primary**: Blitz `batchEnrichContacts()` — batch enrichment for all contacts
2. **Fallback 1**: Clay `sendToClayLinkedIn()` / `sendToClayNameDomain()` — for contacts Blitz couldn't enrich
3. **Fallback 2**: Prospeo `batchEnrich()` — last resort for remaining unenriched contacts

#### 3.7 Save and Log

- Saves enriched contacts to `enriched_contacts` table (cache)
- Logs the search attempt
- Returns the contact list to the caller

---

## Title Filters by Buyer Type

### PE Firm Title Filter (`PE_TITLE_FILTER`)

Used when searching for contacts at the PE firm itself:

```
partner, managing partner, operating partner, senior partner,
principal, managing director, vp, vice president, director,
bd, business development, acquisitions, senior associate,
analyst, ceo, president, founder
```

### Company Title Filter (`COMPANY_TITLE_FILTER`)

Used when searching for contacts at the target company:

```
ceo, president, founder, owner, cfo, chief financial officer,
coo, chief operating officer, vp, vice president, bd,
business development, director, general manager,
head of finance, finance director, vp finance, controller,
head of operations, vp operations
```

---

## Buyer Introduction Kanban Pipeline

After approval, a `buyer_introduction` record is created at the first Kanban stage. This tracks the deal pipeline:

```
need_to_show_deal      (initial — created on approval)
        ↓
outreach_initiated     (admin begins outreach)
        ↓
meeting_scheduled      (meeting set up)
        ↓
fit_and_interested     (auto-creates deal_pipeline entry)
        ↓
not_a_fit              (terminal — buyer passed)
```

Key data stored on the introduction:

- `score_snapshot` — historical snapshot of buyer scores at approval time so Kanban cards always render rich data even if the buyer record changes later
- `targeting_reason` — from `buyer.alignment_reasoning`
- `introduction_status` — current Kanban stage
- Status transitions are logged in `introduction_status_log`

---

## Database Tables

### `contacts` (unified contact table)

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `remarketing_buyer_id` | uuid FK → buyers | The buyer this contact belongs to |
| `firm_id` | uuid FK → marketplace firms | Resolved from buyer record |
| `first_name` / `last_name` | text | Split from full_name |
| `email` | text | Unique index on `lower(email)` |
| `phone` | text | |
| `linkedin_url` | text | |
| `title` | text | Job title |
| `contact_type` | text | `'buyer'` / `'seller'` / `'marketplace_user'` |
| `source` | text | `'auto_introduction_approval'` for this workflow |
| `archived` | boolean | Soft delete flag |

### `contact_discovery_log`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `buyer_id` | uuid FK → buyers | |
| `triggered_by` | uuid FK → auth.users | Admin who triggered |
| `trigger_source` | text | `'approval'` / `'bulk_approval'` / `'manual'` / `'retry'` |
| `status` | text | `'started'` / `'completed'` / `'partial'` / `'failed'` / `'skipped'` |
| `pe_firm_name` / `company_name` | text | Search parameters |
| `pe_domain` / `company_domain` | text | Resolved domains |
| `pe_contacts_found` / `company_contacts_found` | int | Raw counts from searches |
| `total_saved` / `skipped_duplicates` | int | Insert results |
| `error_message` | text | Error details |
| `duration_ms` | int | Wall-clock time |
| `started_at` / `completed_at` | timestamp | |

### `buyer_introductions`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `remarketing_buyer_id` | uuid FK → buyers | |
| `listing_id` | uuid FK → listings | The deal |
| `contact_id` | uuid FK → contacts | Primary contact (optional) |
| `introduction_status` | text | Kanban stage |
| `score_snapshot` | jsonb | Historical buyer score data |
| `targeting_reason` | text | Why this buyer was targeted |
| `created_by` | uuid FK → auth.users | Admin |

### `remarketing_scores`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `buyer_id` | uuid FK → buyers | |
| `listing_id` | uuid FK → listings | |
| `composite_score` | numeric | AI-computed match score |
| `status` | text | `'pending'` / `'approved'` / `'passed'` |

### `remarketing_outreach`

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid PK | |
| `score_id` | uuid FK → remarketing_scores | Unique constraint |
| `buyer_id` / `listing_id` | uuid | |
| `status` | text | `'pending'` and other states |
| `created_by` | uuid | Admin |

---

## External API Dependencies

| Provider | Usage | Priority |
|----------|-------|----------|
| **Blitz** | Domain-to-LinkedIn resolution, waterfall ICP search, employee finder, batch email/phone enrichment | Primary |
| **Serper** | Google search for company domains and LinkedIn URLs, contact discovery fallback | Fallback 1 |
| **Clay** | Email lookup by LinkedIn URL or name+domain | Fallback 2 |
| **Prospeo** | Batch email enrichment | Fallback 3 |

---

## Key File Reference

| File | Purpose |
|------|---------|
| `src/components/remarketing/ApproveBuyerMultiDealDialog.tsx` | Single buyer approval UI + mutation |
| `src/components/remarketing/BulkApproveForDealsDialog.tsx` | Bulk buyer approval UI + mutation |
| `src/lib/remarketing/findIntroductionContacts.ts` | Client-side orchestrator — fetches buyer, invokes edge function |
| `src/lib/remarketing/createBuyerIntroduction.ts` | Creates Kanban introduction records |
| `supabase/functions/find-introduction-contacts/index.ts` | Server-side orchestrator — parallel search, dedup, save |
| `supabase/functions/find-contacts/index.ts` | Low-level enrichment pipeline (Blitz/Serper/Clay/Prospeo) |
| `supabase/functions/_shared/blitz-client.ts` | Blitz API client |
| `supabase/functions/_shared/serper-client.ts` | Serper API client |
| `supabase/functions/_shared/clay-client.ts` | Clay API client |
| `supabase/functions/_shared/prospeo-client.ts` | Prospeo API client |
| `src/types/buyer-introductions.ts` | TypeScript types for introduction workflow |
| `src/hooks/use-buyer-introductions.ts` | React Query hooks for introduction CRUD |

---

## Sequence Diagram

```
Admin clicks "Approve"
        │
        ▼
┌─────────────────────────────────┐
│ ApproveBuyerMultiDealDialog     │
│ (or BulkApproveForDealsDialog)  │
└──────────┬──────────────────────┘
           │
           ├─► Update remarketing_scores → status: 'approved'
           ├─► Create remarketing_outreach records (pending)
           ├─► createBuyerIntroductionFromApproval()
           │       └─► Insert buyer_introductions (need_to_show_deal)
           │
           └─► findIntroductionContacts(buyerId)  [FIRE-AND-FORGET]
                       │
                       ▼
               Fetch buyer details from DB
                       │
                       ▼
           ┌───────────────────────────────┐
           │ find-introduction-contacts    │
           │ (Edge Function)               │
           └──────────┬────────────────────┘
                      │
                      ├─► Pre-check: enough contacts? → skip
                      │
                      ├─► PARALLEL ─┬─► find-contacts (PE firm)
                      │             │     └─► Blitz → Serper → Clay → Prospeo
                      │             │
                      │             └─► find-contacts (Company)
                      │                   └─► Blitz → Serper → Clay → Prospeo
                      │
                      ├─► Deduplicate (linkedin > email > name)
                      ├─► Insert into contacts table
                      └─► Log to contact_discovery_log
```
