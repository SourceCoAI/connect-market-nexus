# Deal Pipeline Use Cases Audit — 2026-04-09

Focused audit of the **admin Deal Pipeline** — the Kanban/list/table
workspace at `src/pages/admin/AdminPipeline.tsx` — and the two funnels
that feed it: **marketplace connection requests** and **approved buyer
introductions**. Scope is intentionally narrow: the portal push
pipeline and the generic back-end enrichment executor are mentioned
only where they touch deal_pipeline.

## TL;DR

The deal pipeline has **three independent insert paths** that produce
`deal_pipeline` rows with **three different default probabilities**,
**three different stage-lookup strategies**, and **three different
title formats**. Two of them (the admin-approval trigger chain and the
buyer-intro JS path) still hardcode stage names that no longer exist
in the seed. A Phase 4 migration introduced an RPC
(`create_pipeline_deal`) that was meant to unify the marketplace
path, but the only caller of that RPC is the portal flow — the admin
approval path still goes through the legacy trigger chain. The
transition note in that migration explicitly asks for a follow-up
drop; that follow-up has not shipped.

## 1. The Deal Pipeline itself

### Code
- `src/pages/admin/AdminPipeline.tsx` — route
- `src/components/admin/pipeline/PipelineShell.tsx` — page shell
- `src/components/admin/pipeline/PipelineWorkspace.tsx` — view switcher
- `src/components/admin/pipeline/views/PipelineKanbanView.tsx`
- `src/components/admin/pipeline/views/PipelineListView.tsx`
- `src/components/admin/pipeline/views/PipelineTableView.tsx`
- `src/components/admin/pipeline/PipelineDetailPanel.tsx` (+ `tabs/`)
- `src/hooks/admin/use-pipeline-core.ts`
- `src/hooks/admin/use-pipeline-filters.ts`
- `src/hooks/admin/use-pipeline-views.ts`
- `src/config/pipeline-features.ts` — all flags `false`

### Schema
- `deal_stages` — ordered stage rows (id, name, position, color,
  stage_type, default_probability, is_active, is_default,
  is_system_stage)
- `deal_pipeline` — one row per deal, referencing `stage_id`,
  `listing_id`, `connection_request_id`, `buyer_introduction_id`,
  `remarketing_buyer_id`, `buyer_contact_id`, `seller_contact_id`,
  `source`, `nda_status`, `fee_agreement_status`, `probability`,
  `value`, etc.
- `deals` — legacy table; overlapping columns deduped in
  `20260506200000_drop_deal_pipeline_duplicate_columns.sql`

### Stages (current active list)

Tracing migrations in filename order:

1. `20250829140751_…sql` — initial seed.
2. `20251002202941_…sql:6-26` — adds `NDA + Agreement Sent` and
   `Negotiation`, reorders to 12 stages 0–11.
3. `20251112174742_…sql:1-3` — **hard-deletes** `Approved` and
   `Negotiation`.
4. `20251112180457_…sql:1-3` — renames `Initial Review` → `Follow-up`.
5. `20260223033733_…sql:3-39` — renames `New Inquiry` → `Approved`,
   reshuffles positions 0–9, inserts `Owner intro requested` at
   position 2, deactivates `Follow-up` and `NDA + Agreement Sent`.
6. `20260527000000_reactivate_pipeline_stages.sql` — despite the file
   name, **deletes** `Follow-up` and `NDA + Agreement Sent` by UUID.
   Header comment contradicts the file name.

**Resulting active stages:**

| Pos | Name | `stage_type` |
|----:|------|--------------|
| 0 | Approved | — |
| 1 | Info Sent | — |
| 2 | Owner intro requested | — |
| 3 | Buyer/Seller Call | — |
| 4 | Due Diligence | — |
| 5 | LOI Submitted | — |
| 6 | Closed Won | `closed_won` |
| 7 | Closed Lost | `closed_lost` |

The seeder at `20251002202941_…sql` still *looks* like the canonical
list on a fresh read. That's a documentation trap — see Finding §1.

### Feature flags
`src/config/pipeline-features.ts`:

```
customViews: false
stageLibrary: false
stageCustomization: false
stageReordering: false
```

UI is built but disabled. Message: *"Admin disabled these features.
To enable, contact Adam."*

## 2. Funnel A — Marketplace connection request → deal_pipeline

### User-visible flow
1. Prospect submits a connection request (marketplace form, Webflow
   embed, or manual entry) → row inserted into `connection_requests`
   with `status = 'pending'`.
2. Admin reviews in `src/pages/admin/AdminRequests.tsx`, clicks
   **Approve**.
3. Page calls `useConnectionRequestsMutation`
   (`src/hooks/admin/requests/use-connection-requests-mutation.ts:28`)
   which calls the RPC
   `update_connection_request_status(request_id, 'approved')`.
4. That RPC (defined in
   `supabase/migrations/20250821111336_…sql:8-54`) updates
   `connection_requests.status = 'approved'` plus attribution fields.
   **It does not insert into `deal_pipeline` itself.**
5. The UPDATE fires the trigger `trg_create_deal_on_request_approval`
   (created in `20250829162014_…sql:105-109`), which runs
   `create_deal_on_request_approval()` — latest definition at
   `supabase/migrations/20260506200000_drop_deal_pipeline_duplicate_columns.sql:267-349`.
6. That function:
   - returns early if a `deal_pipeline` row already exists for this
     `connection_request_id` (idempotent)
   - returns early if the listing has no valid company website (via
     `is_valid_company_website`) — silent skip, no admin feedback
   - looks up the `Qualified` stage — **this stage does not exist**
     and never has in any seed; the fallback ("first active stage by
     position") is therefore taken 100% of the time, landing the row
     on `Approved` (position 0)
   - inserts into `deal_pipeline` with `probability = 50`,
     `priority = 'medium'`, title = the listing title only (no buyer
     name), description = `NEW.user_message` or
     `'Deal created from approved connection request'`
   - writes a `deal_activities` row of type `note_added`

### Trigger-chain history (context for the mess)
The connection_request → deal_pipeline path has been rewritten at
least seven times:

| Migration | Change |
|-----------|--------|
| `20250829140751_…sql:238-` | Initial `auto_create_deal_from_connection_request` trigger |
| `20250829162014_…sql:105-109` | Adds `trg_create_deal_on_request_approval` trigger |
| `20251001175908_…sql` | Rewrites `create_deal_from_connection_request()`, recreates `auto_create_deal_from_connection_request` trigger |
| `20251003151520_…sql:8` | `DROP FUNCTION auto_create_deal_from_connection_request()` |
| `20251006174137_…sql:3-15` | Drops the `auto_create_deal_from_connection_request` trigger ("duplicate/broken") |
| `20260223092058_…sql:9` | `DROP FUNCTION auto_create_deal_from_connection_request()` again |
| `20260306400000_…sql:20` | Recreates `create_deal_from_connection_request()` |
| `20260506000000_…sql:828-931` | Recreates `auto_create_deal_from_connection_request()` function (but no trigger!) |
| `20260506200000_…sql:267-349` | Updates `create_deal_on_request_approval()` to drop `contact_*` columns |
| `20260516300000_…sql:33-251` | **Phase 4**: introduces `create_pipeline_deal(p_connection_request_id)` RPC as the consolidated replacement; explicitly leaves old triggers alive "as a safety net" |

### Current effective state
- **Active trigger**: `trg_create_deal_on_request_approval` on
  `connection_requests` → calls `create_deal_on_request_approval()`
- **Zombie function**: `auto_create_deal_from_connection_request()`
  was recreated in `20260506000000` but has no trigger bound to it.
  It is dead code that nonetheless hardcodes the non-existent
  `'New Inquiry'` stage name — any future caller that rebinds it
  would silently insert rows with a NULL `stage_id`.
- **Phase 4 RPC**: `create_pipeline_deal()` exists and is correct
  (looks up `Approved` or `New Inquiry`, probability 5), but its only
  caller is `src/hooks/portal/use-portal-deals.ts:610`. The admin
  approval flow never calls it.

The transition comment at
`20260516300000_…sql:426-456` spells out the follow-up that's needed:
verify no duplicates, then drop `trg_ensure_source_from_lead`, the
deal-creation trigger, and the agreement triggers. **That follow-up
migration has not shipped.** Phase 4 is half-done.

### Findings for Funnel A

1. **Hardcoded `'Qualified'` stage lookup** in
   `create_deal_on_request_approval` →
   `20260506200000_…sql:297-300`. This stage has never existed. The
   fallback is triggered every time. Either fix the lookup (use
   `Approved` or `stage_type`-based selection) or remove the dead
   lookup block entirely.
2. **Probability inconsistency**: the trigger sets `probability = 50`
   at `20260506200000_…sql:328`; the Phase 4 RPC sets it to `5` at
   `20260516300000_…sql:231`. Whichever is correct, both paths should
   agree.
3. **Silent skip on invalid website**:
   `20260506200000_…sql:293-295` — admin clicks Approve, no deal
   appears, no toast. The approval still succeeds on the
   `connection_requests` row. This is almost certainly a support
   footgun.
4. **Zombie function** `auto_create_deal_from_connection_request()`
   can safely be dropped; it has no trigger and its stage lookup
   targets a non-existent stage name.
5. **Phase 4 is incomplete**: the RPC exists and is correct but no
   admin code path calls it. Either migrate
   `use-connection-requests-mutation.ts` to invoke it explicitly
   after approval, or accept that Phase 4 applies only to portal and
   rename the RPC to match.

## 3. Funnel B — Approved buyer introduction → deal_pipeline

### User-visible flow
1. Admin opens the buyer-introduction Kanban on a listing detail
   page (`src/components/admin/deals/buyer-introductions/kanban/`).
2. Admin moves a buyer to the "interested" column, or clicks the
   **Approve for pipeline** action. Both paths resolve to
   `useApproveForPipeline.approve()`
   (`src/components/admin/deals/buyer-introductions/hooks/use-approve-for-pipeline.ts:17-52`).
3. That hook is a thin wrapper — it just calls
   `updateStatus({ id, updates: { introduction_status: 'fit_and_interested', … } })`
   on `useBuyerIntroductions`.
4. Inside
   `src/hooks/use-buyer-introductions.ts:184-216`, the mutation
   detects the `'fit_and_interested'` transition and calls
   `createDealFromIntroduction(buyer)`.
5. `createDealFromIntroduction`
   (`src/hooks/use-buyer-introductions.ts:223-353`):
   - selects the first active `deal_stages` row by position (the
     current `Approved` stage) — lines 226–239
   - looks up the listing title for the deal title
   - resolves-or-creates a `contacts` row for the buyer (because the
     `contacts` table uses partial unique indexes and
     `.upsert({ onConflict: 'email' })` silently no-ops — see the
     comment at lines 256–258)
   - inserts into `deal_pipeline` with `source = 'remarketing'`,
     `probability = 25`, `priority = 'medium'`,
     `buyer_introduction_id = buyer.id`, title
     `${buyer_firm_name} — ${listing_title}` (lines 304–322)
   - writes a `deal_activities` row of type `deal_created`
   - updates the originating `buyer_introductions` row to
     `introduction_status = 'deal_created'` (lines 341–346)

### Reverse sync
Separately, the trigger `trg_sync_pipeline_to_introduction` on
`deal_pipeline` UPDATE (created in
`20260616000000_pipeline_introduction_fixes.sql:50-54`) sets the
linked `buyer_introduction.introduction_status` to `deal_created`
when the deal moves to a `closed_won`/`closed_lost` stage — but only
if the intro was at `fit_and_interested`. In practice, because the
JS path in step 5 above already advances the intro to `deal_created`
*at creation time*, the trigger's condition
(`introduction_status = 'fit_and_interested'`) is rarely met on
close, and the trigger is effectively a no-op for intros that were
created via the normal flow.

### Findings for Funnel B

6. **Client-side deal creation for a funnel that crosses RLS
   boundaries**: `createDealFromIntroduction` runs as three sequential
   client-initiated queries (contact lookup/insert, deal_pipeline
   insert, buyer_introductions update). If any step after step 1
   fails, the UI shows a generic error and the record set is left
   partially updated. This is the kind of multi-statement operation
   that the Phase 4 migration was meant to move into a SECURITY
   DEFINER RPC. A `create_pipeline_deal_from_introduction(intro_id)`
   RPC would bring Funnel B in line with the Phase 4 pattern.
7. **Third probability default**: Funnel B sets `probability = 25`
   (`use-buyer-introductions.ts:318`). Combined with Funnel A's 50
   and Phase 4's 5, rows in `deal_pipeline` carry probabilities that
   reflect how they were created, not where they are in the
   pipeline. Any report that aggregates by probability is
   effectively reporting on insert path.
8. **Stage lookup is coupled to row order, not intent**: Funnel B
   uses "first active stage by position", which silently followed the
   rename from `New Inquiry` → `Approved` in
   `20260223033733_…sql`. Works today, but any reshuffle will drop
   buyer-intro-sourced deals into whatever ends up at position 0.
   Using `stage_type = 'active'` + `is_default = true`, or a named
   system stage, would be robust.
9. **Intro status advances to `deal_created` immediately at create
   time**, which makes the backup trigger `trg_sync_pipeline_to_introduction`
   dead in the common case. Either remove the trigger, or move the
   status advance out of the client and let the trigger do its job
   on close. Two mechanisms covering the same event guarantees drift.
10. **Hardcoded stage_type none**: `createDealFromIntroduction` does
    not check `is_active = true` before the position-ordered select
    — it calls
    `.eq('is_active', true)` correctly at line 229, OK. No
    correction needed, noted only as a check.

## 4. Cross-funnel findings (apply to the pipeline as a whole)

11. **Three insert paths, zero convergence.** The admin-approval
    trigger, the Phase 4 RPC, and the buyer-intro JS all build a
    `deal_pipeline` row from different field sets. The only field
    that every path fills in is `stage_id`; everything else (title
    format, probability, priority, NDA/fee defaults, source string,
    contact linking) differs by path. Converging on a single SECURITY
    DEFINER RPC that takes a discriminated-union input would remove
    the drift and the maintenance surface.
12. **No dedicated audit log for stage transitions.** Buyer
    introductions have `introduction_status_log`; portal has
    `portal_activity_log`; deal_pipeline has only `deal_activities`
    (scoped to activity notes, not stage transitions as a
    first-class event). This also blocks the auto-task work flagged
    in `TASK_WORKFLOW_COMPREHENSIVE_AUDIT_2026-04-07.md`.
13. **Stage names are hardcoded in downstream SQL.** `'New Inquiry'`,
    `'Qualified'`, and `'Approved'` all appear as literal names in
    trigger functions. Because the stage list has churned four times
    since September, any name-based lookup is one migration away
    from silent breakage. `stage_type` (`active` / `closed_won` /
    `closed_lost`) is the only stable coarse-grained selector.
14. **Feature flags gate a built UI.** Everything in
    `src/config/pipeline-features.ts` is `false`; the UI for custom
    views, stage library, stage add/remove, and stage reordering is
    built but dead. Either wire it up or delete it — dead UI is
    expensive to keep compiling and type-checking.
15. **`pipeline-features.ts` has no server-side enforcement.** If
    these flags ever flip to true, the only gate is client code. The
    back-end has no equivalent CHECK on stage mutations; a
    sufficiently motivated admin with DB access can reorder stages
    out of view of whatever UI safeguards exist.

## 5. What to read next

- **`TASK_WORKFLOW_COMPREHENSIVE_AUDIT_2026-04-07.md`** — covers the
  *downstream* side of the pipeline: what should happen automatically
  when a deal enters a stage (auto-advancement, auto-tasks). Findings
  §12 and §13 above intentionally overlap with that audit.
- **`AUDIT_BUYER_SCORING_PIPELINE.md`** — covers buyer recommendation
  scoring, which precedes Funnel B. No overlap with the stage/
  transition logic documented here.
- **`PLATFORM_WORKFLOW_AUDIT_2026-03-22.md`** — cross-feature workflow
  patterns. Does not drill into the deal pipeline.

## Key files and line numbers

**UI / hooks**
- `src/pages/admin/AdminPipeline.tsx`
- `src/pages/admin/AdminRequests.tsx` — approval entry point
- `src/hooks/admin/requests/use-connection-requests-mutation.ts:28` — RPC call
- `src/hooks/use-buyer-introductions.ts:184-216` — intro→deal trigger
- `src/hooks/use-buyer-introductions.ts:223-353` — `createDealFromIntroduction`
- `src/components/admin/deals/buyer-introductions/hooks/use-approve-for-pipeline.ts:17-52`
- `src/hooks/portal/use-portal-deals.ts:536-616` — the only caller of `create_pipeline_deal`

**Migrations**
- `supabase/migrations/20250821111336_…sql:8-54` — `update_connection_request_status` RPC
- `supabase/migrations/20250829162014_…sql:105-109` — `trg_create_deal_on_request_approval` creation
- `supabase/migrations/20260506000000_fix_buyer_introductions_rls.sql:828-931` — zombie function recreation
- `supabase/migrations/20260506200000_drop_deal_pipeline_duplicate_columns.sql:267-349` — current `create_deal_on_request_approval`
- `supabase/migrations/20260516300000_replace_trigger_chains_with_rpcs.sql:33-251` — Phase 4 RPC `create_pipeline_deal`
- `supabase/migrations/20260516300000_replace_trigger_chains_with_rpcs.sql:426-456` — transition follow-up TODO
- `supabase/migrations/20260527000000_reactivate_pipeline_stages.sql` — misnamed stage deletion
- `supabase/migrations/20260616000000_pipeline_introduction_fixes.sql:5-54` — `buyer_introduction_id` FK + close-sync trigger

**Config**
- `src/config/pipeline-features.ts`

**Types**
- `src/types/status-enums.ts` — `IntroductionStatus`
- `src/types/buyer-introductions.ts` — `BuyerIntroduction`
