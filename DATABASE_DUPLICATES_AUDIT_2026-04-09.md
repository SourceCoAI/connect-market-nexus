# Database Duplicates Audit — 2026-04-09

**Scope:** Duplicate and redundant database objects in the Supabase/Postgres
schema reconstructed from `supabase/migrations/` (882 migration files as of
2026-04-09, latest `20260624000000_portal_cleanup_unused_response_types.sql`).

**Method:** Timestamp-ordered scan of all migrations tracking `CREATE TABLE`,
`DROP TABLE`, `CREATE OR REPLACE FUNCTION`, `CREATE TRIGGER`, `DROP TRIGGER`,
and `CREATE INDEX` statements, cross-referenced with prior audits
(`CTO_DEAD_CODE_DUPLICATES_AUDIT_2026-03-11.md`,
`CTO_DEAD_CODE_DUPLICATES_AUDIT_2026-03-12.md`,
`DATA_ARCHITECTURE_AUDIT_2026-03-04.md`,
`docs/SCHEMA_REFACTOR_STRATEGY.md`).

**TL;DR:** Roughly **176 live tables, 237 functions, 181 triggers**. The
March audits flagged ~20 duplicate/overlapping clusters; **most are still
unresolved** and have accumulated more duplicates (admin view state,
enrichment queues, audit log tables, chat conversation triggers, updated_at
helpers). There are **no runtime-breaking dupes** (all repeated
`CREATE TABLE` statements use `IF NOT EXISTS`), but the schema-governance
debt is growing and several items now have 3–5 overlapping implementations.

---

## 1. Duplicate / Overlapping Tables (STILL OPEN)

### 1.1 Admin "last viewed" state — **5 parallel tables** (regressed)

Four legacy per-view tables + one unified replacement, none of the legacy
tables dropped:

| Table | Migration | Status |
|---|---|---|
| `admin_deal_sourcing_views` | `20251120204800_*.sql:2` | live |
| `admin_connection_requests_views` | `20251120211917_*.sql:2` | live |
| `admin_users_views` | `20251120211917_*.sql:22` | live |
| `admin_owner_leads_views` | `20251203224529_*.sql:2` | live |
| **`admin_view_state`** (unified) | `20260516000000_add_sourceco_to_dashboard_stats.sql:173` | live |

`DATA_ARCHITECTURE_AUDIT_2026-03-04.md:177` recommended consolidating into a
single `admin_view_state(view_type, admin_id, last_viewed_at)` table. The
unified table was created on 2026-05-16 but **the four legacy tables were
never dropped and are still written to**. This is now worse than before the
audit — there are 5 sources of truth for the same concept.

**Action:** Migrate remaining writers to `admin_view_state`, add a unique
constraint on `(admin_id, view_type)`, and drop the 4 legacy tables.

### 1.2 Contact store — **3 overlapping tables** (was 5; two already dropped)

| Table | Defined in | Purpose | Status |
|---|---|---|---|
| `contacts` | `20260228000000_unified_contacts_system.sql` | Canonical unified store (2nd definition, first was `20260222031933`) | live |
| `enriched_contacts` | `20260310000000_contact_intelligence.sql:5` | Enrichment cache (17 cols) | live |
| `remarketing_buyer_contacts` | `20260122172855_*.sql:57` | Remarketing-specific (20 cols) — flagged 2026-03-11 | live (dead-mirror) |
| ~~`pe_firm_contacts`~~ | ~~`20260127030827_*.sql:8`~~ | PE firm contacts | **DROPPED** `20260302100000_drop_dead_columns_and_orphaned_tables.sql:74` |
| ~~`platform_contacts`~~ | ~~`20260127030827_*.sql:35`~~ | Generic platform contacts | **DROPPED** `20260302100000_drop_dead_columns_and_orphaned_tables.sql:77` |

**Correction (2026-04-10):** An earlier pass of this audit listed
`pe_firm_contacts` and `platform_contacts` as live. They were in fact
dropped in `20260302100000_drop_dead_columns_and_orphaned_tables.sql`
(lines 74 and 77). The `src/` references to them in
`src/lib/migrations.ts:806-807` are a historical migration-tracker log,
not live queries. The `src/integrations/supabase/types.ts` references
are stale auto-generated types that will clean up on the next
`supabase gen types`.

`contacts` has been created twice (`20260222031933` and `20260228000000`),
and a mirror trigger (`trg_mirror_rbc_to_contacts`,
`20260306300000_remarketing_contacts_mirror_trigger.sql:19-80`) keeps
`remarketing_buyer_contacts` in sync — a classic two-way-sync hazard.
`CTO_DEAD_CODE_DUPLICATES_AUDIT_2026-03-11.md:214` flagged this; the
`remarketing_buyer_contacts` side of the consolidation has not landed.

**Action:** Complete Phase 1 of `docs/SCHEMA_REFACTOR_STRATEGY.md` for
`remarketing_buyer_contacts`: rewrite the one remaining reader
(`supabase/functions/outlook-sync-emails/index.ts:113`), observe 30 days
with zero fires on the mirror trigger, then drop the trigger and the
table. `enriched_contacts` should be folded into a new
`contact_events` history log (see strategy §2 below).

### 1.3 Lead intake — **4 parallel tables**

| Table | Migration | Rows of overlap |
|---|---|---|
| `inbound_leads` | `20250828132035_*.sql:2` (29 cols) | marketplace buyer leads |
| `valuation_leads` | `20260218200000_create_valuation_leads.sql:6` (54 cols) | valuation calculator leads |
| `incoming_leads` | `20260304174216_*.sql:1` (15 cols) | legacy, only 1 reference (`receive-valuation-lead`) |
| `match_tool_leads` | `20260324140500_*.sql:3` | match-tool intake |

`incoming_leads` was already flagged as "likely dead" in the March audit; it
was not dropped and a new 4th lead table (`match_tool_leads`) was added
3 weeks later. All four have substantially overlapping columns
(name/email/phone/company/source).

**Action:** Drop `incoming_leads` after confirming `receive-valuation-lead`
now writes to `valuation_leads`. Decide whether `match_tool_leads` belongs
inside `inbound_leads` with a `source='match_tool'` discriminator.

### 1.4 Enrichment queue/job — **5 overlapping tables**

| Table | Migration | Purpose |
|---|---|---|
| `enrichment_queue` | `20260203040049_*.sql:17` (also `20260203000000_audit_logging.sql:372` — same name created twice on same day) | generic queue |
| `buyer_enrichment_queue` | `20260204044137_*.sql:2` | buyer-specific queue |
| `enrichment_jobs` | `20260218100000_audit_enrichment_scoring_infrastructure.sql:15` | job runner (20 cols) |
| `enrichment_events` | `20260218100000_*.sql:58` | event log |
| `enrichment_history` | `20260525000000_platform_audit_remediation.sql:88` | post-run audit log |

Plus the telemetry tables `enrichment_rate_limits`, `enrichment_cost_log`,
`enrichment_test_runs`, `enrichment_test_results`. `enrichment_queue` has a
**same-day double-create** (two migrations on 2026-02-03 both ship a
`CREATE TABLE IF NOT EXISTS public.enrichment_queue`). The first of the two
silently wins; the second's column list is ignored.

**Action:** Pick one queue (`enrichment_jobs` is the newest and richest),
discriminate by `entity_type`, and drop `enrichment_queue` +
`buyer_enrichment_queue`. Collapse `enrichment_events` and
`enrichment_history` (they both log events, one post-hoc).

### 1.5 Audit log tables — **5 parallel logs**

| Table | Migration |
|---|---|
| `audit_logs` (plural) | `20250716190234_*.sql:33` — first definition |
| `audit_logs` (plural) | `20260203000000_audit_logging.sql:8` — **second create, same name** |
| `audit_log` (singular) | `20260223100000_database_hardening.sql:396` |
| `permission_audit_log` | `20251021153845_*.sql:19` and re-defined in `20260306174307_*.sql:2` |
| `data_room_audit_log` | `20260223000000_data_room_and_lead_memos.sql:99` |
| `agreement_audit_log` | `20260225000000_firm_agreement_tracking_system.sql:526` |

Both `audit_log` and `audit_logs` are live — a singular/plural naming split
that will trip up every developer. `audit_logs` was created twice. The four
domain-specific audit tables (`permission_`, `data_room_`, `agreement_`)
each re-implement the same event-log pattern.

**Action:** Merge `audit_log` into `audit_logs` (one table). Consider
collapsing the three domain-specific logs into `audit_logs(domain, action,
entity_type, entity_id, payload jsonb)` unless domain-specific indexes are
needed.

### 1.6 Analytics tables — still 6+ overlapping

All created before Feb 2026 and still untouched since the March audit:

- `user_sessions` (`20250721114715_*.sql:5`)
- `page_views` (`20250721114715_*.sql:28`)
- `user_events` (`20250721114715_*.sql:42`)
- `user_journeys` (`20260201200358_*.sql:5`)
- `user_initial_session` (`20251021170417_*.sql:2`)
- `listing_analytics`, `search_analytics`, `daily_metrics`, `registration_funnel`

`user_events` (18 cols) is a strict superset of what `user_journeys` tracks.
Flagged in `DATA_ARCHITECTURE_AUDIT_2026-03-04.md:193`. No action since.

**Action:** Decide whether `user_events` is the single events table. If so,
migrate `user_journeys` and `page_views` into it with discriminators.

### 1.7 Email / outreach tables

- `email_connections`, `email_messages`, `email_access_log` —
  `20260617000000_client_portal_tables.sql` (portal-scoped email)
- `email_delivery_logs` — `20250717110712_*.sql:2` (legacy)
- `email_events` — `20260403112928_*.sql:53`
- `outbound_emails` — `20260403112928_*.sql:19`
- `outreach_records` — `20260122175318_*.sql:2`

Seven overlapping email tables. `email_delivery_logs` (2025-07) and
`email_events` (2026-04) both record send/delivery/bounce outcomes.
`outbound_emails` and `outreach_records` both track outgoing messages.

**Action:** Decide whether the 2026-04 `outbound_emails` / `email_events`
pair supersedes the 2025-07 `email_delivery_logs` and the 2026-01
`outreach_records`; drop the predecessors.

---

## 2. Repeated `CREATE TABLE` statements (same table defined ≥2×)

Confirmed by timestamp scan. All use `IF NOT EXISTS`, so only the first
executes — later definitions are dead code that misleads anyone reading the
schema history.

| Table | # of CREATEs | Migrations |
|---|---|---|
| `chat_conversations` | 9 | spread across `20260204`–`20260208` |
| `chat_analytics`, `chat_feedback` | 9 each | same |
| `chat_recommendations`, `chat_smart_suggestions` | 9 each (all ultimately dropped) | same |
| `contacts` | 2 | `20260222031933`, `20260228000000` |
| `enrichment_queue` | 2 | `20260203000000`, `20260203040049` (same day) |
| `audit_logs` | 2 | `20250716190234`, `20260203000000` |
| `permission_audit_log` | 2 | `20251021153845`, `20260306174307` |
| `listing_notes` | 2 | `20260223160650` (then dropped), `20260522000000` (restored) |
| `buyer_transcripts` | 3 | `20260122`, `20260204`, `20260208` |
| `connection_messages` | 3 | `20260222100000`, `20260222200935`, `20260222202149` (last DROPPED) |
| `cron_job_logs` | 3 | `20260203000000` (2×), `20260203062136` |
| `admin_notifications` | 2 | `20250721103744`, `20250721104047` |
| `registration_funnel` | 2 | `20250721114715`, `20250729111125` |
| `buyer_criteria_extractions` | 2 | `20260204190000`, `20260204190031` |
| `criteria_extraction_sources` | 2 | `20260204000000`, `20260204183447` |
| `ma_guide_generations` | 2 | `20260204172041`, `20260204180000` |
| `deal_contacts` | 2 | `20250903123033`, `20250903123123` (dropped later) |
| `deal_data_room_access`, `deal_documents`, `document_release_log`, `document_tracked_links` | 2 | `20260222031837` & `20260227000000` (same 4-table block re-created) |
| `marketplace_approval_queue` | 2 | `20260222031837`, `20260227000000` |
| `global_activity_queue` | 2 | `20260210000000`, `20260210215937` |
| `clay_enrichment_requests` | 2 | `20260303042239`, `20260505000000` |
| `listing_personal_notes` | 2 | `20250807104534`, `20250807151851` |

**Action:** These are not runtime bugs but they distort schema archaeology.
When the migration-squash phase (`docs/SCHEMA_REFACTOR_STRATEGY.md:305`)
lands, each of these collapses to one authoritative CREATE.

---

## 3. Duplicate Functions (CREATE OR REPLACE churn)

High-churn functions should be isolated into one migration and left alone
unless their behavior changes:

| Function | # of CREATE OR REPLACE | First → last |
|---|---|---|
| `public.get_deals_with_details` | **27** | `20250829140751` → `20260506200000` |
| `public.handle_new_user` | **19** | `20250717120629` → `20260202193640` |
| `public.create_deal_from_connection_request` | 8 | multiple |
| `public.update_updated_at_column` | **6** | `20250716182234`, `20250818134309`, `20251027161449`, `20260116185205`, `20260223100000_database_hardening.sql`, `20260311000000_contact_lists.sql` |
| `public.is_admin` | 3 | `20250717120629`, `20251029141754`, `20260224200000_fix_moderator_is_admin_and_audit_policy.sql` |

`get_deals_with_details` being rewritten 27 times is the single loudest
signal that the view layer is unstable. Recommendation in
`docs/SCHEMA_REFACTOR_STRATEGY.md` is to materialize deal read-side as a
VIEW + a small projection function.

`update_updated_at_column` is a generic 5-line utility and should never
have been redefined 6 times. It is identical in every definition.

**Action:**
1. Freeze `update_updated_at_column` in a single `_baseline` migration; add a
   lint rule that blocks future `CREATE OR REPLACE` of it.
2. Replace `get_deals_with_details(...)` with a stable VIEW plus a narrow
   parameterized function, and stop redefining it on every dashboard tweak.
3. Confirm `is_admin`, `has_role`, `get_my_role`, `get_user_role` are
   consistent — there are at least 3 role-check helpers and the March audit
   flagged they had inconsistent behavior for moderators.

---

## 4. Recreated Triggers (drop/re-create churn)

| Trigger | Recreations | Target table |
|---|---|---|
| `set_chat_conversations_updated_at` | 7 | `chat_conversations` (all in `20260207`–`20260208`) |
| `auto_enrich_new_listing` | 5 | `listings` |
| `auto_enrich_updated_listing` | 5 | `listings` |
| `sync_connection_request_firm_trigger` | 4–5 | `connection_requests` |
| `trg_sync_marketplace_buyer_on_approval` | 4 | `profiles` |
| `trg_mirror_rbc_to_contacts` | 4 | `remarketing_buyer_contacts` |

Cause: the 2026-02 chat build and the 2026-02/03 enrichment overhaul landed
as a sequence of hot-patches instead of one clean migration. No risk of
firing twice (each migration does `DROP TRIGGER IF EXISTS` first), but each
rebuild is a chance to forget a column rename.

**Action:** Squash the 2026-02-07/08 chat migrations into one, and the
2026-02-03/17 enrichment trigger migrations into one.

---

## 5. Duplicate Indexes

Mixed use of `CREATE INDEX IF NOT EXISTS` and bare `CREATE INDEX` for the
same index name on the same columns:

- `idx_chat_conversations_user_id` on `chat_conversations(user_id)` —
  6× `IF NOT EXISTS` + 1× bare `CREATE INDEX`
- `idx_chat_conversations_updated_at` on `chat_conversations(updated_at DESC)` —
  6× `IF NOT EXISTS` + 1× bare
- `idx_page_views_session_id`, `idx_user_events_session_id` — 5× each, mixed
  schema-qualification (`public.page_views` vs bare `page_views`)

The bare `CREATE INDEX` forms will fail on a fresh database replay if the
earlier `IF NOT EXISTS` version has already run. This is latent; a one-shot
full replay (e.g. a disaster-recovery rebuild) would break.

**Action:** Rewrite the bare `CREATE INDEX` statements to
`CREATE INDEX IF NOT EXISTS` to make the migration stream idempotent.

---

## 6. Things that are NOT duplicates (but look like it)

- **`user_sessions` vs `user_initial_session`** — different shapes;
  `user_initial_session` stores UTM/landing context of the first-ever
  session, `user_sessions` is a running session log. Keep both.
- **`audit_logs` (permission stream) vs `permission_audit_log`** — both
  currently live, but `permission_audit_log` records role-grant events only
  and the stored-procedure writers already segregate them. Leave until a
  unification decision is made (see §1.5).
- **`deal_stages` vs `deal_pipeline`** — not duplicates; `deal_stages`
  defines the stage taxonomy, `deal_pipeline` is the per-deal pipeline row.

---

## 7. Recommended priority order

1. **§5 bare `CREATE INDEX` fixes** — one small migration, unblocks DR rebuilds.
2. **§1.1 admin view state consolidation** — 4 tables → 1, the table is
   already written. Just flip writers and drop.
3. **§1.5 `audit_log` + `audit_logs` merge** — singular/plural split is a
   foot-gun.
4. **§3 freeze `update_updated_at_column`** — one-line lint rule.
5. **§1.4 enrichment queue/job unification** — bigger lift but unblocks
   Phase 3 of the schema refactor.
6. **§1.2 / §1.3 contact + lead consolidation** — Phase 1 of
   `docs/SCHEMA_REFACTOR_STRATEGY.md`.
7. **§2 migration squash** — after everything else lands, squash to a
   single baseline.

---

## Appendix: Verification commands

```bash
# Repeated CREATE TABLE scanner
rg -n "CREATE TABLE\s+(IF NOT EXISTS\s+)?(public\.)?(\w+)" \
   supabase/migrations | \
   awk -F: '{match($0, /CREATE TABLE.*?(\w+)\s*\(/, m); print m[1]}' | \
   sort | uniq -c | sort -rn | awk '$1 > 1'

# Repeated CREATE OR REPLACE FUNCTION scanner
rg -n "CREATE OR REPLACE FUNCTION\s+(public\.)?(\w+)" supabase/migrations | \
   awk -F: '{match($0, /FUNCTION\s+(public\.)?(\w+)/, m); print m[2]}' | \
   sort | uniq -c | sort -rn | head -30

# Trigger recreation scanner
rg -n "CREATE (OR REPLACE )?TRIGGER\s+(\w+)" supabase/migrations | \
   awk -F: '{match($0, /TRIGGER\s+(\w+)/, m); print m[1]}' | \
   sort | uniq -c | sort -rn | head -20
```

_Generated 2026-04-09 on branch `claude/audit-database-duplicates-ZDHx8`._
