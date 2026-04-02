

# Revamp Document Tracking — Full Lifecycle Dashboard

## Problem Summary

The Document Tracking page partially works but has critical gaps:

1. **Status dropdown only shows "Sent" from `not_started`** — correct per transition rules, but admins need the table to clearly reflect which firms have pending requests vs which are just `not_started` (never requested). Currently they look the same.
2. **The `firm_agreements` status updates correctly to `sent` when a user requests**, but the table doesn't visually distinguish "user requested, email was sent" from "admin manually set to sent". The `Requested` column exists but isn't prominent enough.
3. **Pending Request Queue works** (screenshot 3) but is separate from the main table — the table rows themselves should clearly indicate pending status with row highlighting and the status badge should reflect "Requested" distinctly.
4. **No "Send Email" action from admin side** — admins can only change status manually but can't trigger the actual email from the document tracking table.
5. **Admin attribution on sign** — the signed dialog exists in `AgreementStatusDropdown` but the "Mark Signed" in the Pending Queue doesn't use it (skips the signer selector dialog).
6. **User-side sync** — the `ConnectionButton` sidebar correctly shows dual doc status with resend, but the user profile Documents tab may not reflect the latest state.

## Changes Required

### 1. Simplify AgreementStatusDropdown transitions for email-based flow

The current transitions include `redlined`, `under_review`, `expired`, `declined` — these are PandaDoc-era statuses. The new flow is simpler:
- `not_started` → `sent` (admin sends email manually or user requests)
- `sent` → `signed` (admin marks after receiving signed doc via email)
- `sent` → `not_started` (reset)
- `signed` → `not_started` (revoke)

Remove `redlined`, `under_review` from the dropdown transitions (keep in type for backward compat). The dropdown should show contextual actions:
- From `not_started`: "Send Email" (triggers `request-agreement-email` edge function) 
- From `sent`: "Mark Signed" (opens signer dialog)
- Reset option always available

**File**: `src/components/admin/firm-agreements/AgreementStatusDropdown.tsx`

### 2. Add "Send Email" action to AgreementStatusDropdown

When admin clicks "Send Email" from the dropdown:
- Need to pick a member to send to (use `FirmSignerSelector`)
- Call `request-agreement-email` edge function with `firmId`, `recipientEmail`, `recipientName`, `agreementType`
- Update status to `sent` + set `nda_requested_at` / `fee_agreement_requested_at`
- This replaces the current "just set status to sent" behavior

**File**: `src/components/admin/firm-agreements/AgreementStatusDropdown.tsx`

### 3. Improve Pending Request Queue — use signer dialog for Mark Signed

Currently the "Mark Signed" button in the pending queue does a direct update without the signer dialog. Change it to open a simplified dialog that:
- Pre-fills the signer name from `recipient_name`
- Lets admin add notes
- Records attribution (`signed_toggled_by`, `signed_toggled_by_name`)

**File**: `src/pages/admin/DocumentTrackingPage.tsx` (pending queue section)

### 4. Better row highlighting in main table

Currently `firm.hasPendingRequest` adds `bg-amber-50/60` — make this more prominent:
- Add a small colored dot or badge next to the firm name for pending requests
- Show "Requested" as a distinct badge in the NDA/Fee status column when status is `sent` AND there's a `requested_at` timestamp (meaning user initiated, not admin)

**File**: `src/pages/admin/DocumentTrackingPage.tsx` (FirmExpandableRow)

### 5. Ensure user-side Documents tab syncs

Verify that the profile Documents tab reads from `get_my_agreement_status` RPC (which reads `firm_agreements`) so it shows the correct `sent` / `signed` states.

**File**: Check `src/components/profile/` for documents tab — may need verification only, no changes if already using the RPC.

### 6. Add admin "Send Email" capability from the table

When an admin changes status to `sent` via dropdown, instead of just toggling the DB field, actually invoke `request-agreement-email` to send the real email. This requires selecting a member/email first.

**File**: `src/components/admin/firm-agreements/AgreementStatusDropdown.tsx`

## Files Changed

- **`src/components/admin/firm-agreements/AgreementStatusDropdown.tsx`** — Simplify transitions to `not_started ↔ sent ↔ signed`. Add "Send Email" action that opens a member picker dialog, calls `request-agreement-email` edge function, and updates status. Keep "Mark Signed" with signer dialog.
- **`src/pages/admin/DocumentTrackingPage.tsx`** — Improve pending queue "Mark Signed" to use a dialog with signer pre-fill and admin notes. Enhance row highlighting for pending requests. Add visual indicator (dot/badge) on firm name for pending items.
- **`src/hooks/admin/use-firm-agreements.ts`** — May need minor updates if the `AgreementStatus` type needs cleanup (keep all values for backward compat but simplify UI transitions).

## What Already Works (No Changes Needed)

- `firm_agreements` status syncs correctly when user requests docs
- `document_requests` table tracks all requests with timestamps
- Realtime subscriptions refresh the admin table on changes
- Pending Request Queue shows inbound requests
- User-side `ConnectionButton` shows dual doc status with resend
- `check_agreement_coverage` RPC correctly resolves coverage for marketplace gates
- Edge function `request-agreement-email` sends emails via Brevo

