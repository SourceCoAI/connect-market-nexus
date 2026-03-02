
Goal: make NDA/Fee signing state propagate immediately and reliably across buyer Messages, buyer Profile Documents, admin Message Center/context, and admin dashboard (with most-recent signatures), while also cleaning up the buyer Messages UI to a more premium/minimal look.

What I found (deep investigation)
1) Primary root cause (confirmed with live DB data)
- The signing pipeline resolves firm inconsistently in multiple places:
  - `get-buyer-nda-embed` and `get-buyer-fee-embed` pick firm via `firm_members ... limit(1)` (no deterministic ordering).
  - `confirm-agreement-signed` also picks firm via `firm_members ... limit(1)`.
  - Buyer message status (`useFirmAgreementStatus`) prioritizes `connection_requests.firm_id` first.
- For `adambhaile00@gmail.com`, there are multiple `firm_members` rows:
  - Newer membership: firm `d18c83c3-...` (no submission, not started)
  - Active request firm: `fc768c08-...` (NDA submission `6041912`, status pending)
- That mismatch means signing/confirmation can target a different firm than the one the UI is reading.

2) Secondary reliability gaps
- `AgreementSigningModal` always toasts “Signed!” on DocuSeal completion event, even if `confirm-agreement-signed` fails/returns not confirmed.
- It only invalidates once (comment says staggered invalidation, but code does not implement delayed retries).
- No invalidation for `['buyer-signed-documents', userId]` (Profile Documents query).
- No buyer-side realtime subscription for firm agreement changes in key buyer views.
- Admin Message Center list (`useInboxThreads`) does not listen to `firm_agreements` changes, so agreement badges/context may lag.
- Realtime publication check currently shows `firm_agreements` and `connection_messages` published; `connection_requests` not published, which weakens any realtime logic depending on `connection_requests` UPDATE events.

3) Evidence about current signing event
- In `docuseal_webhook_log`, for submission `6041912`, only `submission_created` exists (no completion event recorded).
- So immediate frontend confirmation path must be robust even when webhook is delayed/missed.

Implementation plan (ALL requested scope)

Phase 1 — Unify firm resolution (most important, fixes wrong-record updates)
Files:
- `supabase/functions/get-buyer-nda-embed/index.ts`
- `supabase/functions/get-buyer-fee-embed/index.ts`
- `supabase/functions/confirm-agreement-signed/index.ts`

Changes:
1. Implement a shared deterministic firm resolver in each function:
   Priority order:
   a) Most recent active `connection_requests` row with non-null `firm_id` for current user (`approved|pending|on_hold`, order by `created_at desc`)
   b) Fallback to latest `firm_members` by `added_at desc`
2. Remove all ambiguous `limit(1)` membership lookups without ordering.
3. Return `resolvedFirmId` in function responses for observability/debugging.

Why:
- Ensures all signing, status checks, and updates target the same firm record the buyer is actually interacting with.

Phase 2 — Harden “immediate confirmation” after signing
Files:
- `supabase/functions/confirm-agreement-signed/index.ts`
- `src/components/docuseal/AgreementSigningModal.tsx`
- `src/components/docuseal/FeeAgreementGate.tsx`
- `src/components/docuseal/NdaGateModal.tsx` (consistency)

Changes:
1. In `confirm-agreement-signed`, add short verification retry window:
   - Poll DocuSeal status a few times (e.g., 0s, 1.5s, 3s, 5s) before returning not confirmed.
   - Return structured response:
     - `confirmed: true|false`
     - `status: completed|pending|...`
     - `resolvedFirmId`
     - `reason`
2. In frontend handlers, evaluate response instead of assuming success:
   - If confirmed/alreadySigned: show success toast.
   - If not confirmed yet: show “Processing signature…” toast, keep modal state consistent, and trigger staggered refetch cycle.
3. Implement actual staggered invalidation (0s, 2s, 5s) and include missing keys:
   - `buyer-firm-agreement-status`
   - `my-agreement-status`
   - `buyer-nda-status`
   - `agreement-pending-notifications`
   - `user-notifications`
   - `buyer-message-threads`
   - `connection-messages`
   - `buyer-signed-documents` (currently missing)
   - Admin-facing keys: `inbox-threads`, `admin-document-tracking`, `firm-agreements`

Why:
- Users won’t get false “signed” feedback.
- UI converges quickly even if webhook is late.

Phase 3 — Realtime + fallback synchronization across screens
Files:
- `src/pages/BuyerMessages/useMessagesData.ts`
- `src/pages/Profile/ProfileDocuments.tsx`
- `src/pages/admin/MessageCenter.tsx`
- `src/pages/admin/message-center/ThreadContextPanel.tsx`
- New shared hook (proposed): `src/hooks/use-agreement-status-sync.ts`

Changes:
1. Add a reusable agreement-sync hook:
   - Subscribes to `firm_agreements` updates relevant to current user (or selected admin context).
   - Invalidates agreement/message/profile document query keys on event.
   - Includes a light fallback poll while signing flow is “in-flight”.
2. Buyer screens:
   - `useFirmAgreementStatus`: subscribe + invalidate on firm updates.
   - `ProfileDocuments`: either lower stale time and/or subscribe via hook; ensure immediate query refresh after signing.
3. Admin screens:
   - `MessageCenter` add `firm_agreements` realtime invalidation for `['inbox-threads']`.
   - `ThreadContextPanel` either:
     - subscribe to the selected user’s firm agreement, or
     - rely on parent invalidation + reduced stale time for context queries.
4. Database realtime publication:
   - Ensure `connection_requests` is in `supabase_realtime` publication if that table is used for realtime UI updates.

Why:
- Keeps all dependent views coherent without manual refresh.

Phase 4 — Admin dashboard: immediate, most-recent signatures feed
Files:
- New hook: `src/hooks/admin/use-recent-agreement-signatures.ts`
- New component: `src/components/admin/dashboard/RecentAgreementSignaturesCard.tsx`
- Integration target:
  - `src/components/admin/StripeOverviewTab.tsx` (Marketplace dashboard area)

Changes:
1. Build a unified “recent signatures” dataset:
   - Pull from `firm_agreements`:
     - NDA events via `nda_signed_at`
     - Fee events via `fee_agreement_signed_at`
   - Normalize to one list of signature events with:
     - signed_at, agreement_type, firm_name, signer info (if available), firm_id
   - Sort descending by `signed_at`.
2. Display top recent signed events in dashboard card.
3. Add realtime invalidation from `firm_agreements` so new signatures appear immediately.
4. Add quick link(s) to Message Center thread and/or Document Tracking row.

Why:
- Satisfies “immediately visible in dashboard” and “sorted by most recent”.

Phase 5 — Buyer Messages UI redesign (minimal, intuitive, premium, clean)
Files:
- `src/pages/BuyerMessages/index.tsx`
- `src/pages/BuyerMessages/AgreementSection.tsx`
- `src/pages/BuyerMessages/ConversationList.tsx`
- `src/pages/BuyerMessages/MessageThread.tsx`
- `src/pages/BuyerMessages/MessageInput.tsx`
- `src/pages/BuyerMessages/GeneralChatView.tsx`

Design direction (SourceCo-aligned):
1. Simplify top area:
   - Compact “Action Required” agreement block with two clean rows (NDA/Fee), clearer status chips, fewer competing actions.
2. Thread list:
   - Reduce visual noise (smaller metadata, cleaner unread marker hierarchy, calmer spacing).
3. Thread pane:
   - Cleaner message bubbles, reduced badge clutter, improved typography and line-height.
4. Composer:
   - Minimal attachment + input + send layout, stronger focus state, less border weight.
5. Remove remaining off-brand/legacy colors (blue/green/red accents where not semantically necessary) and align with charcoal/gold/warm-grey palette.
6. Preserve all current functionality and keyboard behavior.

Why:
- Matches user request for a premium, intuitive interface without sacrificing workflow speed.

Technical safeguards and edge cases
1. Multi-firm users:
- Firm resolution must always bind to active request firm first.
2. Webhook delays/misses:
- Immediate confirmation path + staggered invalidation + realtime/fallback polling.
3. Duplicate writes:
- Keep existing dedup logic in webhook/confirm paths; do not emit duplicate notifications/messages.
4. Non-signed completion callback race:
- Don’t show final success until backend confirms signed or DocuSeal status is verified.
5. Security:
- Keep using `user_roles` for role checks; no client-side role assumptions.

Validation plan
1. Buyer E2E
- Sign NDA from Messages.
- Verify within seconds:
  - Messages agreement row -> Signed
  - Profile/Documents tab shows signed NDA with downloadable doc
  - Notification badge/system message consistent
2. Admin E2E
- Open Message Center while buyer signs.
- Verify context panel status updates without refresh.
- Verify dashboard “Recent Signatures” list gets new top event immediately.
3. Fee Agreement parity
- Repeat same flow for fee agreement.
4. Multi-firm regression
- Test with user having >1 `firm_members` row to confirm correct firm is always updated.
5. Failure-path tests
- Simulate delayed webhook and verify fallback sync still converges UI.

Execution order (for implementation after approval)
1) Backend firm-resolution + confirm robustness (Phase 1–2)
2) Frontend signing result handling + staggered invalidation (Phase 2)
3) Realtime/fallback sync hooks across buyer/admin screens (Phase 3)
4) Dashboard recent-signatures component + sorting (Phase 4)
5) Buyer Messages premium UI cleanup (Phase 5)
6) End-to-end verification and regressions.

Expected outcome
- Signing any agreement updates all critical buyer/admin surfaces in near real-time.
- Admin dashboard shows newest signatures first immediately.
- Buyer Messages UI becomes cleaner, more premium, and easier to act in.
