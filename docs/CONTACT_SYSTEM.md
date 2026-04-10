# Contact System Architecture

> Single source of truth for all people on the platform.

## Tables

| Table | Purpose | Writes | Reads |
|---|---|---|---|
| `contacts` | Canonical contact identity | `contacts_upsert()` RPC only | Any authenticated user via RLS |
| `contact_events` | Append-only history/audit/enrichment cache | Written by `contacts_upsert()` internally | Admin-only |

### Retired tables

| Table | Dropped in | Reason |
|---|---|---|
| `pe_firm_contacts` | `20260302100000` | Zero code references; fields absorbed into `contacts.role_category` and `contacts.priority_level` |
| `platform_contacts` | `20260302100000` | Same as above |
| `remarketing_buyer_contacts` | `20260625000007` | Dead mirror; all data backfilled into `contacts` since `20260228` |
| `enriched_contacts` | Retained (read-only cache) | Historical enrichment cache. New enrichment writes go through `contacts_upsert()` → `contact_events`. `enriched_contacts` is read-only for backward compat and can be dropped once all cache reads are migrated. |

## Write path

```
Caller (UI / edge function / import job)
  │
  ▼
supabase.rpc('contacts_upsert', {
  p_identity:   { email, linkedin_url, phone, firm_id },
  p_fields:     { first_name, last_name, ... },
  p_source:     'manual' | 'import' | 'clay_linkedin' | ...,
  p_enrichment: { provider, confidence, source_query } | null
})
  │
  ├─► resolve_contact_identity(email, linkedin, phone, firm_id)
  │     Resolution order: email → linkedin_url → (phone + firm_id)
  │     Skips deleted_at IS NOT NULL and merged_into_id IS NOT NULL rows
  │     Returns oldest match (deterministic)
  │
  ├─► INSERT or UPDATE on public.contacts
  │     INSERT: requires first_name + (email or linkedin_url)
  │     UPDATE: COALESCE semantics (only overwrite non-NULL fields)
  │     If p_enrichment present: stamps last_enriched_at, last_enrichment_source, confidence
  │
  └─► INSERT into public.contact_events
        event_type = 'enrichment' | 'create' | 'update'
        old_values / new_values = full JSONB snapshots
        changed_fields = computed diff
        performed_by = auth.uid()
```

### Direct writes are blocked

```sql
REVOKE INSERT, UPDATE ON public.contacts FROM authenticated, anon;
```

Only the `contacts_upsert()` SECURITY DEFINER RPC and the `service_role` can write.
Test cleanup (`schemaTests.ts`) uses `service_role` for `.delete()` calls.

## Identity resolution

`resolve_contact_identity(email, linkedin_url, phone, firm_id)` returns a `contacts.id`:

1. **Email match** (strongest): `lower(email)` exact match, excluding soft-deleted and merged rows.
2. **LinkedIn match**: `lower(linkedin_url)` exact match, same exclusions.
3. **Phone + firm match** (weakest): `(lower(phone), firm_id)` tuple, same exclusions.

If no match is found, `contacts_upsert()` creates a new row.

### Unique indexes enforcing dedup

- `idx_contacts_buyer_email_unique`: `lower(email)` WHERE `contact_type='buyer'` AND `archived=false`
- `idx_contacts_seller_email_listing_unique`: `(lower(email), listing_id)` WHERE `contact_type='seller'` AND `archived=false`
- `idx_contacts_linkedin_url_unique`: `lower(linkedin_url)` WHERE `linkedin_url IS NOT NULL AND linkedin_url <> '' AND deleted_at IS NULL AND merged_into_id IS NULL`

## Contact types

```sql
CHECK (contact_type IN ('buyer', 'seller', 'advisor', 'internal', 'portal_user'))
```

## Enrichment cache

The enrichment cache-hit check is:

```sql
SELECT 1 FROM contacts
WHERE id = <contact_id>
  AND last_enriched_at > now() - interval '7 days';
```

If the row has been enriched within 7 days, skip re-querying the external provider. The full enrichment history lives in `contact_events` with `event_type = 'enrichment'`.

## Adding a new enrichment provider

1. Add the provider name to the edge function (e.g., `supabase/functions/newprovider-webhook/index.ts`).
2. Call `contacts_upsert()` with `p_enrichment: { provider: 'newprovider', confidence: '...', source_query: '...' }`.
3. The RPC handles updating the canonical row AND appending to `contact_events`.
4. No new tables, no new triggers, no new indexes.

## Manual merge (duplicate resolution)

When two contact rows represent the same person:

1. Pick the canonical row (usually the one with more data).
2. Update the loser row: `SET merged_into_id = <winner_id>, deleted_at = now()`.
3. Historical FKs (e.g., `buyer_introductions.contact_id`) continue resolving via a JOIN on `merged_into_id`.
4. A `contact_events` row with `event_type = 'merge'` is appended.

> **Note:** A dedicated `contacts_merge()` RPC is planned but not yet shipped. Until then, merges are manual SQL operations via service_role.

## Governance

### Pre-commit lint

`scripts/lint-contacts-invariants.sh` blocks:
- New `CREATE TABLE` for any `*contacts*` name other than `contacts` and `contact_events`.
- Direct `.from('contacts').insert|update|upsert|delete` outside of `src/lib/data-access/contacts.ts`.
- Redefinition of frozen utility functions (`update_updated_at_column`, `is_admin`).

Bypass: `SKIP_CONTACT_LINT=1 git commit -m "reason..."`.

### Weekly invariant checks

`supabase/functions/contacts-invariant-check/index.ts` runs weekly and verifies:
- No two non-archived buyer contacts share `lower(email)`.
- No two contacts share `lower(linkedin_url)` (excluding NULLs/blanks/deleted/merged).
- Every approved profile has a matching contacts row.
- Every listing with `main_contact_email IS NOT NULL` has a matching seller contact.
- Every `remarketing_buyer` with a primary contact has `contacts.is_primary_at_firm = true`.

Failures post to the Slack webhook configured in `CONTACTS_INVARIANT_SLACK_WEBHOOK_URL`.
