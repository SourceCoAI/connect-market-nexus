
Goal: make agreement status fully consistent across buyer/admin surfaces, correctly associate users to firms, and restore historical fee/NDA tracking without losing auditability.

What I found (root causes)
1) User-to-firm association is inconsistent today.
- For adambhaile00@gmail.com, there are 2 firm memberships:
  - d18c83c3... (dfdf) → NDA/Fee not signed
  - fc768c08... (teltonika.lt) → NDA signed
- Their latest active connection request points to teltonika firm, but latest firm_members row is dfdf.
- Result: different screens pick different firms and show conflicting status.

2) Firm resolution logic is fragmented and contradictory.
- Some places use “latest connection_request then fallback membership” (good).
- Some places use `.from('firm_members').eq('user_id', userId).limit(1)` with no ordering (non-deterministic).
- Some places use domain-based RPC (`get_my_agreement_status`) which ignores membership context for generic domains.
- One query orders firm_members by `created_at` even though firm_members has `added_at` (schema mismatch).

3) Data quality issues amplify mismatch.
- 17 firm_agreements rows have `email_domain` containing full emails (`%@%`) instead of pure domains.
- Multiple users have latest request firm != latest membership firm.
- Admin Document Tracking search only checks one selected contact per firm, not all member emails/names, so signed firm rows are easy to miss when searching by a specific user email.

4) Core signed-state integrity is mostly OK, but association is not.
- No current rows where docuseal completed + signed=false.
- Main failure mode is wrong firm resolution + duplicate/stale memberships, not webhook status writing.

Implementation plan (sequenced)

Phase 1 — Canonical firm resolution contract (single source of truth)
A) Add DB function `resolve_user_firm_id(p_user_id uuid)`:
- Priority 1: most recent active connection_requests.firm_id (approved/pending/on_hold)
- Priority 2: most recent firm_members.firm_id by `added_at desc`
- Return null if none.
B) Add companion function `get_user_firm_agreement_status(p_user_id uuid)` returning firm_id + NDA/Fee fields from firm_agreements.
C) Update all user-firm lookups to use this contract:
- Frontend hooks:
  - `src/hooks/admin/use-docuseal.ts` (`useBuyerNdaStatus`)
  - `src/hooks/admin/use-user-firm.ts`
  - `src/pages/admin/message-center/ThreadContextPanel.tsx` (fix `created_at`→`added_at` fallback)
  - `src/pages/MyRequests.tsx` (stop mixing two different status sources for NDA/Fee)
- Edge functions:
  - `supabase/functions/get-agreement-document/index.ts`
  - (keep current deterministic behavior in `get-buyer-nda-embed`, `get-buyer-fee-embed`, `confirm-agreement-signed`, but switch them to shared resolver util to prevent drift)

Dependency: Phase 1 must land before remediation/backfill scripts are used in UI rollout.

Phase 2 — Data remediation + historical restoration (idempotent migration)
A) Normalize malformed firm domains:
- For `firm_agreements.email_domain like '%@%'`, split to domain where valid.
- If domain is generic, set `email_domain = null` and preserve prior value in metadata for audit.
B) Reconcile duplicate user memberships:
- For each user with >1 firm, compute canonical firm via Phase 1 resolver.
- Move/retain user membership on canonical firm.
- For non-canonical memberships:
  - If no active requests and no signed docs and likely placeholder, detach user membership.
  - Keep firm rows if referenced elsewhere; do not hard-delete signed-history firms.
C) Recompute `firm_agreements.member_count` from firm_members.
D) Historical fee/NDA restoration:
- Rebuild missing signed timestamps/urls/status from submission ids + webhook logs where needed.
- Re-sync profile legacy booleans from firm truth (compatibility only), using firm membership rollup.
E) Produce remediation report table/log:
- changed firm_ids, moved users, normalized domains, restored signed rows, skipped ambiguous rows.

Dependency: run in dry-run preview first, then execute once approved.

Phase 3 — Prevent recurrence (hardening)
A) Update trigger function `sync_connection_request_firm()`:
- Never use unordered `LIMIT 1` from firm_members.
- Prefer explicit NEW.firm_id if already set.
- If deriving, use canonical resolver rules.
- Avoid silent reassignment on updates unless source fields changed.
B) Add DB constraints/guards:
- CHECK to prevent `email_domain` containing `@`.
- Optional trigger to normalize `email_domain` on write.
C) Add periodic integrity job:
- Detect users with multi-firm ambiguity, malformed domains, request/member canonical mismatch.
- Emit admin alert + dashboard metric.

Phase 4 — Admin UX clarity (so ops can trust what they see)
A) DocumentTracking search should include all member emails/names, not only primary/first contact.
B) Add “Associated Users” expandable section per firm row.
C) Add “Canonical firm for user” inspector in admin context panel and user badge tooltip.
D) Add “Potential duplicate firm” warning chip when same user appears in multiple firms.

Technical file scope
- DB migrations/functions:
  - new resolver functions + remediation SQL + constraints + trigger updates
- Frontend:
  - `src/hooks/admin/use-docuseal.ts`
  - `src/hooks/admin/use-user-firm.ts`
  - `src/pages/admin/message-center/ThreadContextPanel.tsx`
  - `src/pages/MyRequests.tsx`
  - `src/pages/admin/DocumentTrackingPage.tsx`
- Edge:
  - `supabase/functions/get-agreement-document/index.ts`
  - shared resolver import/use in signing-related functions

Validation checklist (must pass before closing)
1) For affected user (adambhaile00@gmail.com), admin and buyer both resolve same firm_id.
2) NDA/Fee badges match across:
- Profile Documents
- My Deals
- Buyer Messages action bar
- Admin Message Center context panel
- Admin Document Tracking
3) Backfill invariants:
- zero malformed email_domain rows with `@`
- zero users where latest request firm conflicts with canonical resolver output
- no docuseal completed rows left unsigned
4) End-to-end test:
- sign Fee Agreement from buyer UI, confirm green signed state appears in all surfaces without manual refresh.

Risk controls
- Execute remediation in two steps: dry-run report → reviewed apply migration.
- Keep all destructive actions reversible (log old/new mappings).
- Do not delete firms with signed history; only re-link memberships unless explicitly safe.

Expected outcome
- One canonical firm context per user interaction.
- Agreement statuses synchronized everywhere in near real time.
- Historical fee/NDA tracking restored and trustworthy for all firms/users.
- Admin search and debugging become transparent, reducing false “not signed” reads.
