

# Document Signing Revamp — Comprehensive Fix Plan

## What's Working

| Area | Status |
|------|--------|
| `document_requests` table + RLS | Done |
| `firm_agreements` request tracking columns | Done |
| `request-agreement-email` edge function | Done — sends via Brevo, inserts request, notifies admins |
| `AgreementSigningModal` (dialog) | Done — email-based |
| `NdaGateModal` (full-screen) | Done — email-based |
| `FeeAgreementGate` (full-screen) | Done — email-based |
| `ConnectionButton` (listing detail) | Done — "at least one" gate |
| Server-side RPC gate | Done — checks both NDA and fee coverage |
| `DocumentTrackingPage` data hook | Done — has `hasPendingRequest`, amber highlighting, `last_requested` sort |
| Admin sidebar badge | Done — `usePendingDocumentRequests` |
| Realtime subscriptions | Done — `firm_agreements` + `document_requests` |
| Admin status toggle attribution | Done — updates `document_requests` with admin name on sign |
| `SendAgreementDialog` (admin) | Done — invokes `request-agreement-email` |
| `ProfileDocuments` tab | Done — email-based request + status |
| `PendingApproval` page | Done — email-based NDA signing |
| `DealActionCard` / `DealDocumentsCard` | Done — use `AgreementSigningModal` |

## What's Broken — Must Fix

### 1. Marketplace Card "Sign NDA" Button Does Nothing Useful (Critical)

`ListingCardActions.tsx` lines 178-199: When `isNdaCovered` is false, it renders a "Sign NDA" button that links to `/listing/{id}`. This navigates to the listing detail page which then shows the `NdaGateModal`. However, the gate logic at `ListingDetail.tsx` line 59-60 checks `!agreementStatus.nda_covered` — meaning it **only** gates on NDA, not "at least one".

**The problem**: The marketplace cards still check NDA-only (`isNdaCovered`) and Fee-only (`isFeeCovered`) as separate sequential gates. But the new rule is "either one". A user with a Fee Agreement signed but no NDA sees "Sign NDA" on every card, even though they should be allowed to request access.

**Fix**: Change `ListingCardActions.tsx` to check `!isNdaCovered && !isFeeCovered` (neither covered) as the gate condition, and update the button text from "Sign NDA" to "Sign Agreement" with a link that opens the `AgreementSigningModal` directly rather than redirecting.

### 2. ListingDetail NDA Gate Too Strict (Critical)

`ListingDetail.tsx` line 59-60: `showNdaGate = !isAdmin && user && agreementStatus && !agreementStatus.nda_covered` — this blocks the entire listing detail page if NDA is not signed, even if the fee agreement IS signed. Should be `!agreementStatus.nda_covered && !agreementStatus.fee_covered`.

### 3. Default Sort on DocumentTrackingPage Is `last_signed` Not `last_requested` (Medium)

Line 232: `const [sortField, setSortField] = useState<SortField>('last_signed')` — should default to `'last_requested'` so new pending requests appear first for admins.

### 4. No Sortable "Last Requested" Column Header (Medium)

The table headers have sortable buttons for company, NDA status, fee status, members, and last_signed — but there is no column header for sorting by `last_requested`. Admins cannot easily sort by most recent request.

### 5. ConnectionButton Agreement Block Has No Action (Medium)

`ConnectionButton.tsx` lines 174-191: When neither agreement is signed, it shows a static block saying "Contact support@sourcecodeals.com to get started." This should instead let the user request an agreement directly via `AgreementSigningModal`, not tell them to email support.

### 6. `SendAgreementDialog` Sends as the Calling User, Not the Target Buyer (Medium)

The `request-agreement-email` edge function uses `auth.uid()` to determine the recipient (line 42-48). When an admin invokes `SendAgreementDialog`, the edge function sends the email to the **admin's** own email, not the buyer's. The `SendAgreementDialog` passes `recipientEmail` in the body, but the edge function ignores it and always uses the authenticated user's profile email.

**Fix**: Update the edge function to accept an optional `recipientEmail` / `recipientName` parameter. When provided (and caller is admin), send to the specified recipient instead. Add admin check before allowing override.

### 7. `AgreementStatusBanner` Still Says "An NDA is required" (Low)

`AgreementStatusBanner.tsx` line 64: Shows "An NDA is required to view deal details" even when the new rule is "at least one." Should not show this locked banner if fee agreement is already covered.

---

## Implementation Plan

### Step 1: Fix ListingDetail NDA-Only Gate
Change `showNdaGate` in `ListingDetail.tsx` from `!agreementStatus.nda_covered` to `!agreementStatus.nda_covered && !agreementStatus.fee_covered`. This aligns the listing detail page with the "at least one" rule.

### Step 2: Fix ListingCardActions to Use "Either" Logic
In `ListingCardActions.tsx`:
- Change the NDA gate block (line 179) to `!isNdaCovered && !isFeeCovered`
- Change button text from "Sign NDA" to "Sign Agreement to request access"
- Instead of linking to the listing detail, open an inline `AgreementSigningModal` directly from the card
- Remove the separate fee gate block since it's now unified

### Step 3: Fix ConnectionButton Agreement Block
In `ConnectionButton.tsx`:
- Replace the static "Contact support" message with an `AgreementSigningModal` trigger button
- Add state for the modal and wire it to request NDA via email directly

### Step 4: Fix DocumentTrackingPage Default Sort
Change default `sortField` from `'last_signed'` to `'last_requested'` so new requests appear first by default.

### Step 5: Add "Requested" Column Header to Document Tracking Table
Add a sortable "Requested" column header that sorts by `last_requested`. Show the request timestamp for each firm row (NDA or fee, whichever is more recent).

### Step 6: Fix Edge Function for Admin-Triggered Sends
Update `request-agreement-email` to:
- Accept optional `recipientEmail` and `recipientName` body params
- Check if calling user is admin (via `user_roles` table)
- If admin and recipient params provided: send to specified recipient, still log the request against the resolved firm for that buyer
- If not admin: send to authenticated user (current behavior)

### Step 7: Fix AgreementStatusBanner
Update the "locked" NDA banner condition to also check `!coverage.fee_covered` — don't show "NDA required" if fee agreement is already signed.

### Step 8: Redeploy Edge Function
Deploy updated `request-agreement-email` after the admin-send fix.

---

## Technical Details

### Files Changed
- `src/pages/ListingDetail.tsx` — gate condition (1 line)
- `src/components/listing/ListingCardActions.tsx` — gate logic + add `AgreementSigningModal` (rebuild gate block)
- `src/components/listing-detail/ConnectionButton.tsx` — add signing modal trigger
- `src/pages/admin/DocumentTrackingPage.tsx` — default sort + add column header
- `src/components/marketplace/AgreementStatusBanner.tsx` — banner condition
- `supabase/functions/request-agreement-email/index.ts` — admin override for recipient

### No Database Changes Required
All tables and columns already exist.

