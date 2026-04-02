
Audit verdict: no, this is not fully implemented end-to-end. Parts of the new email flow exist, but the system is still split between old agreement assumptions, incomplete sync logic, and a live/code mismatch. The current result is exactly what you described: marketplace CTAs still behave wrong, Document Tracking is not acting like a real request inbox, and several buyer screens still assume NDA-first instead of “either doc”.

What is already in place
- Email-based request components exist: `AgreementSigningModal`, `NdaGateModal`, `FeeAgreementGate`, `SendAgreementDialog`
- Buyer agreement coverage hook exists: `useMyAgreementStatus()`
- Admin document page has some new fields/sorting/highlight logic in code
- `document_requests` table exists
- Admin manual toggle updates `document_requests` to `signed` when status is manually changed
- Server-side connection RPC was updated to allow access with either doc

Critical verified gaps
1. Live data is not flowing
- `document_requests` currently has 0 rows in the database
- Admin sidebar badge counts `document_requests`
- Document Tracking page mostly derives “pending” from `firm_agreements.requested_at`
- Result: sidebar, page stats, and actual request history are not using the same source of truth

2. The request edge function is incomplete
- `request-agreement-email` inserts a `document_requests` row and updates `*_requested_at`
- It does not update canonical agreement statuses to `sent`
- It does not update `nda_sent_at` / `fee_agreement_sent_at`
- It does not populate document URLs on `firm_agreements`
- So many screens never move into a clean “sent / awaiting return” state

3. Marketplace CTA flow is still wrong
- `ListingCardActions` still routes the user to the listing page instead of opening a real request modal from the card
- The generic CTA still does not actually give the user a proper “choose NDA or Fee Agreement” flow
- `NdaGateModal` is still NDA-specific in copy and behavior, even though access rule is now “either doc”
- `FeeAgreementGate` exists but is not wired into the real marketplace path

4. My Deals is still NDA-first
- `DealActionCard` still blocks on `!ndaSigned`
- `DealDocumentsCard` still says “Sign your NDA” to unlock materials
- This directly violates the new rule that either NDA or Fee Agreement should be enough

5. Buyer Messages has a broken download path
- `useDownloadDocument()` still calls deleted edge function `get-document-download`
- So document download/view from Messages is still broken
- `AgreementSection` also treats unsigned docs as “Pending” too broadly, even when not yet requested

6. Document Tracking is still not the dashboard you described
- Current table is still a firm summary table, not a true request queue
- It does not give admins a first-class “recent inbound requests” inbox
- It does not clearly separate:
  - request received
  - email sent
  - signed returned
  - manually marked signed
  - who handled it
- It highlights pending firms, but not as a dedicated operational workflow

7. Admin-send is only partially correct
- Admin override support was added in the edge function
- But if admin sends to an email not tied to a real auth user, tracking is weak because `document_requests.user_id` is required
- That means external/manual recipients are not modeled cleanly

What still needs to be built or rebuilt

Phase 1 — Fix the data model and state sync first
- Make the system use:
  - `firm_agreements` = canonical coverage/status
  - `document_requests` = request history / ops queue
- Update `request-agreement-email` so every send also updates:
  - `nda_status` / `fee_agreement_status` to `sent` when appropriate
  - `nda_sent_at` / `fee_agreement_sent_at`
  - optional sender/recipient metadata
- Add proper recipient tracking to `document_requests`
  - `recipient_email`
  - `recipient_name`
  - `requested_by_user_id`
  - `requested_by_admin_id`
  - if needed, make `user_id` nullable for non-auth recipients
- Ensure manual admin sign-off closes the matching open request row and preserves admin attribution

Phase 2 — Rebuild Admin Document Tracking into two layers
1. Pending Request Queue (new top section)
- One row per open request
- Sorted newest first
- Highlight all unresolved rows
- Show:
  - recipient
  - company/firm
  - doc type
  - requested time
  - email sent time
  - current agreement status
  - who last handled it
  - quick action: mark signed / mark cancelled / resend

2. Firm Agreement Summary (existing lower table, cleaned up)
- Keep one row per firm for overall state
- Show latest request timestamp, latest signer, latest handler
- Expand row to show request history from `document_requests`

Also fix badge logic
- Sidebar red badge must count unresolved `document_requests`, not inferred firm timestamps
- Page “Pending Requests” stat must use the same exact query

Phase 3 — Fix marketplace UX so it actually works
Marketplace cards
- Replace redirect-style “Sign NDA / Sign Agreement” behavior with an actual modal flow
- Introduce a generic `AgreementRequestChooser` modal:
  - Request NDA
  - Request Fee Agreement
- Clicking from a listing card should open this chooser directly

Listing detail gate
- Replace `NdaGateModal` with a neutral agreement gate
- Copy must say “Request an agreement to unlock access”
- Offer both doc options, not NDA-only
- Keep “either doc” gating rule

Connection button
- If neither document is covered, show actionable CTA, not dead-end messaging
- If at least one doc is covered, allow request flow immediately

Phase 4 — Rework buyer-facing document surfaces
Profile Documents
- Turn this into a real document command center:
  - NDA card
  - Fee Agreement card
  - status
  - last requested
  - sent to which email
  - resend
  - if signed copy exists, download/view
- Improve empty and pending states so they explain email workflow clearly

My Deals
- Update `DealActionCard`, `DealDocumentsCard`, and related copy to use:
  - “either doc unlocks access/requesting”
  - not NDA-only logic
- Only prompt for a specific doc if that is the chosen next step
- Remove misleading “Sign NDA” messaging where fee agreement also qualifies

Messages
- Replace deleted `get-document-download` dependency
- Download/view should come from stored URLs or template links directly
- Fix status language so “not requested”, “sent”, “signed”, and “under review” are distinct

Pending Approval
- Revisit this screen so it doesn’t hardcode NDA as the only readiness path
- If you still want NDA-first here, keep it intentionally as a business rule
- Otherwise convert it to the same chooser model

Phase 5 — Operational completeness
- Add resend handling that creates/updates request history cleanly
- Add cancellation / duplicate-request handling
- Add template-missing protection:
  - if `NDA.pdf` or `FeeAgreement.pdf` is missing, show admin-visible failure state instead of silent success
- Show “handled by Admin X” on both the request queue and firm summary
- Ensure realtime invalidates:
  - buyer document views
  - My Deals
  - marketplace gates
  - admin badge
  - admin tracking page

Screen-by-screen status after audit
- Admin > Document Tracking: needs major rebuild into real request workflow
- Admin sidebar badge: logic exists, but useless until `document_requests` is truly populated
- Marketplace listing cards: still wrong behavior
- Listing detail gate: still conceptually NDA-shaped, not agreement-shaped
- Connection request path: server-side rule is correct, UI still inconsistent
- Profile > Documents: partial, needs redesign and stronger state handling
- My Deals: still wrong copy/logic in multiple cards
- Messages: broken download path, stale status handling
- Pending Approval: still NDA-first and should be deliberately redefined
- Admin send flow: needs stronger recipient/request modeling for external recipients

Technical priorities
1. Fix `request-agreement-email` and request/firm synchronization
2. Rebuild Document Tracking around `document_requests`
3. Replace NDA-specific marketplace gating with agreement chooser flow
4. Update My Deals + Profile + Messages to consume the same canonical states
5. Remove remaining broken legacy assumptions and verify all routes end-to-end

Files most likely needing work
- `supabase/functions/request-agreement-email/index.ts`
- `src/pages/admin/DocumentTrackingPage.tsx`
- `src/hooks/admin/use-pending-document-requests.ts`
- `src/components/listing/ListingCardActions.tsx`
- `src/pages/ListingDetail.tsx`
- `src/components/pandadoc/NdaGateModal.tsx` or replacement
- `src/components/listing-detail/ConnectionButton.tsx`
- `src/pages/Profile/ProfileDocuments.tsx`
- `src/components/deals/DealActionCard.tsx`
- `src/components/deals/DealDocumentsCard.tsx`
- `src/pages/BuyerMessages/AgreementSection.tsx`
- `src/pages/BuyerMessages/useMessagesActions.ts`
- `src/pages/PendingApproval.tsx`

Bottom line
The foundation exists, but the revamp is only partially implemented. The main missing piece is not just “a few UI tweaks” — it is making request history, canonical agreement status, and every buyer/admin surface behave as one system. The right fix is: finish the data sync first, then rebuild Document Tracking as an actual request inbox, then replace all remaining NDA-specific buyer flows with a unified agreement workflow that supports either document.
