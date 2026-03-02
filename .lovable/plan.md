
Root-cause analysis (based on code + DB + logs)

1) Messages disappear on refresh
- `GeneralChatView` keeps local `sentMessages` when no active request exists.
- For buyer `b0d649d7...`, there are zero `connection_requests`, so messages never persist in `connection_messages`.
- On refresh, local state resets, so history disappears.

2) NDA/Fee questions don’t appear in message history
- `useSendDocumentQuestion` only inserts into `connection_messages` if an active request exists.
- If none exists, it only calls `notify-admin-document-question` (creates `admin_notifications`), so no chat history is created.

3) Signing modal fails / inconsistent states
- Signing and status UI are driven by mixed fields (`nda_status` vs `nda_docuseal_status`, same for fee), and current mapping ignores several real states (`pending`, `started`, `completed` variants).
- `useThreadBuyerFirm.resolveStatus` only recognizes `sent/viewed/declined`; many firms show `nda_status='sent'` while `nda_docuseal_status='not_sent'`, causing bad labels.
- Buyer has multiple `firm_members` rows; selection is currently “first row by default”, which is nondeterministic and can create unstable behavior.

4) Admin “can’t see requests/messages” for document questions
- Document questions are being written to `admin_notifications`, but not always to a thread in `connection_messages`.
- Admin dashboard page (`/admin/marketplace/requests`) is request-centric; if user has no request, it won’t show in thread/request views.

Comprehensive solution (end-to-end)

Phase 1 — Make messaging durable first (highest priority)
A. Introduce guaranteed “conversation target” resolution
- Add an edge function `resolve-buyer-message-thread` (or equivalent) that:
  1. Finds latest active request (`approved/on_hold/pending`);
  2. If none, finds latest non-rejected request;
  3. If none, creates a guaranteed “General Inquiry” request (backed by a dedicated internal listing).
- Return `connection_request_id` every time.

B. Remove local-only fallback in `GeneralChatView`
- Always send and read from `connection_messages`.
- Replace local `sentMessages` rendering path with DB-backed thread path.
- Keep optimistic UI, but persist immediately to DB.

C. Route document questions into conversation history always
- Update `useSendDocumentQuestion` to call resolver first, then insert tagged message into `connection_messages`.
- Keep admin notification, but include `connection_request_id`, `firm_id`, `document_type` in metadata for deep-linking.

D. Add reliability fallback to realtime
- Keep realtime subscription, add polling fallback (2s backoff to 30s) for message lists and agreement status queries.
- Ensure post-mutation invalidations are exact and thread-scoped.

Phase 2 — Agreement state integrity + signing resilience
A. Canonical state mapper (shared util used by buyer + admin)
- Compute display state from both booleans + both status fields:
  - signed, declined, expired, viewed, sent, started/pending, not_sent, no_firm.
- Use this same mapper in:
  - `AgreementSection`
  - `ThreadContextPanel`
  - request/table badges

B. Stabilize firm resolution for buyers with multiple memberships
- Add deterministic rule in `useFirmAgreementStatus` and signing edge functions:
  - prefer primary-contact/most recently added/most recently active request-linked firm.
- If ambiguity remains, return structured error code and show actionable UI (“Select firm” or “Contact support”).

C. Harden signing modal error handling
- Parse structured function responses (`error_code`, `hasFirm`, `needs_submission`, `already_signed`).
- Show specific remediation instead of generic “Failed to load signing form”.

Phase 3 — Admin visibility overhaul (tracking everything in one place)
A. Add “Document Queue” section in admin requests/messages surfaces
- Show: pending signature, viewed-not-signed, declined, expired, question raised.
- Source from `firm_agreements` + `connection_messages` + `admin_notifications`.

B. Deep-link from notifications to exact thread
- `admin_notifications.action_url` should include request ID when available.
- Add missing metadata and click handler routing.

C. Ensure request cards and message center show agreement context consistently
- Reuse shared state mapper and normalize badges.

State matrix to support (must pass)
1. No firm
2. Firm exists, no request
3. Firm + request, not sent
4. Sent/pending/started
5. Viewed
6. Signed
7. Declined
8. Expired
9. Multiple firm memberships
10. Rejected-only historical requests
11. No messages yet
12. System message only
13. Buyer question (NDA)
14. Buyer question (Fee)
15. General inquiry (non-document)

Dependencies and implementation sequence
1) DB + backend primitives
- General Inquiry thread strategy (dedicated internal listing + resolver function).
- Metadata extensions on `admin_notifications` for request linkage.
2) Edge functions
- `resolve-buyer-message-thread` (new)
- `notify-admin-document-question` (enrich metadata)
- `get-buyer-nda-embed` / `get-buyer-fee-embed` deterministic firm selection + structured errors
3) Frontend messaging
- `GeneralChatView`, `useMessagesActions`, `useMessagesData`
4) Frontend agreement UI
- `AgreementSection`, `ThreadContextPanel`, status utility
5) Admin surfaces
- Requests + Message Center + notification deep-links
6) Backfill + reconciliation scripts
- Rebuild `last_message_*` from `connection_messages`
- Reconcile orphaned document-question notifications into threads where possible

Files expected to change
- Buyer:  
  `src/pages/BuyerMessages/GeneralChatView.tsx`  
  `src/pages/BuyerMessages/useMessagesActions.ts`  
  `src/pages/BuyerMessages/useMessagesData.ts`  
  `src/pages/BuyerMessages/AgreementSection.tsx`
- Admin:  
  `src/pages/admin/message-center/ThreadContextPanel.tsx`  
  `src/pages/admin/MessageCenter.tsx`  
  `src/pages/admin/AdminRequests.tsx` (document queue visibility)  
  `src/hooks/admin/use-admin-notifications.ts`
- Edge functions:  
  `supabase/functions/notify-admin-document-question/index.ts`  
  `supabase/functions/get-buyer-nda-embed/index.ts`  
  `supabase/functions/get-buyer-fee-embed/index.ts`  
  `supabase/functions/get-document-download/index.ts` (keep current body parsing)  
  `supabase/functions/confirm-agreement-signed/index.ts`  
  `supabase/functions/docuseal-webhook-handler/index.ts`  
  `supabase/functions/resolve-buyer-message-thread/index.ts` (new)

Validation plan (required before close)
- E2E for each state in matrix above (buyer + admin).
- Verify persisted history survives full refresh.
- Verify NDA/Fee questions appear in thread and in admin queue.
- Verify signed/declined/expired status consistency across buyer banner, admin thread panel, requests table, notifications.
- Verify deep-link navigation from admin notifications to exact conversation.
