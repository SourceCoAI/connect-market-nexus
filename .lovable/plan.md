

# Document Signing Revamp — Remaining Gaps

## What IS Working Correctly

| Area | Status |
|------|--------|
| `ListingCardActions.tsx` gate logic | Uses `!isNdaCovered && !isFeeCovered` — correct "either doc" rule |
| `ListingDetail.tsx` gate | Uses `!agreementStatus.nda_covered && !agreementStatus.fee_covered` — correct |
| `ConnectionButton.tsx` | Has `AgreementSigningModal` trigger + "either doc" gate — correct |
| `NdaGateModal` | Offers both NDA and Fee Agreement buttons — correct |
| `AgreementStatusBanner` | Shows "locked" only when both are missing (line 59) — correct |
| `DealActionCard` | Uses "either doc" (`hasAnyAgreement = ndaSigned || feeCovered`) — correct |
| `DealDocumentsCard` | Uses "either doc" — correct |
| `ProfileDocuments` | Email-based request/resend flow — correct |
| `AgreementSection` (Messages) | Uses `AgreementSigningModal` for signing — correct |
| `useDownloadDocument` | No longer calls deleted edge function — correct |
| `DocumentTrackingPage` default sort | `last_requested` — correct |
| `DocumentTrackingPage` amber highlighting | `hasPendingRequest` rows get `bg-amber-50/60` — correct |
| `DocumentTrackingPage` "Requested" column | Sortable, shows timestamp — correct |
| `DocumentTrackingPage` pending filter | "Pending Requests" filter option — correct |
| Edge function `request-agreement-email` | Syncs `firm_agreements`, inserts `document_requests`, supports admin override — correct |
| DB: `document_requests` columns | `recipient_email`, `recipient_name`, `requested_by_admin_id` added — correct |

## What Still Needs Fixing

### 1. Marketplace Card "Sign NDA to request access" Text (Medium — Screenshot Mismatch)

`ListingCardActions.tsx` line 184-195: The button text says **"Sign an agreement to request access"** and **"Sign Agreement"** — which is correct in code. However, the screenshot shows "Sign NDA to request access" and "Sign NDA". This means either:
- The latest code hasn't deployed/rendered yet, OR
- The screenshot is stale

**Action**: Verify live preview matches code. If cards still show "Sign NDA", the build may be stale.

### 2. Marketplace Card "Sign Agreement" Still Redirects Instead of Opening Modal (Critical)

`ListingCardActions.tsx` line 188: The "Sign Agreement" button wraps a `<Link to={listingId ? '/listing/${listingId}' : '/marketplace'}>` — this **redirects** the user to the listing detail page instead of opening an `AgreementSigningModal` inline. The user sees a full page navigation, then the `NdaGateModal` shows.

**Fix**: Replace the `<Link>` redirect with an inline `AgreementSigningModal` that opens directly from the card. Add state for `signingOpen` and render the modal.

### 3. `handleConnectionClick` Still Has NDA-Only Gate (Medium)

`ListingCardActions.tsx` line 114: `if (!isNdaCovered)` — this checks NDA alone. If a user has a Fee Agreement but no NDA, clicking "Request Access" redirects them to the listing page instead of opening the dialog.

**Fix**: Change to `if (!isNdaCovered && !isFeeCovered)`.

### 4. PendingApproval Page Still NDA-Only (Medium)

`PendingApproval.tsx` lines 78, 184, 219, 270-306: The entire page says "Sign your NDA", "Sign NDA to unlock the full deal pipeline", checks only `ndaStatus?.ndaSigned`. It does not mention Fee Agreement as an alternative.

**Fix**: Update copy to say "Sign an agreement (NDA or Fee Agreement)" and add Fee Agreement button alongside NDA button. Update navigation logic at line 78 to check either doc.

### 5. PendingApproval Uses `useBuyerNdaStatus` — NDA-Only Hook (Low)

Line 40: `const { data: ndaStatus } = useBuyerNdaStatus(user?.id)` — this hook only returns `ndaSigned` (NDA status). It does not check fee agreement coverage.

**Fix**: Replace with `useMyAgreementStatus` or extend `useBuyerNdaStatus` to also return fee coverage. Update the conditional logic throughout.

### 6. Document Tracking Has No "Pending Request Queue" Section (Medium)

The plan called for a dedicated top section showing individual pending requests from `document_requests` table (one row per request, not per firm). Currently the page only shows the firm summary table with amber highlighting. There's no request-level inbox.

**Fix**: Add a collapsible "Pending Requests" section at the top that queries `document_requests` where `status IN ('requested', 'email_sent')`, showing recipient, doc type, requested time, and a "Mark Signed" action. This is the operational inbox admins need.

### 7. Admin "Mark Signed" Does Not Show Which Admin Handled It (Low)

The `AgreementStatusDropdown` updates `firm_agreements` status but the Document Tracking table doesn't display which admin toggled the status. The `document_requests.requested_by_admin_id` column exists but there's no `signed_by_admin_id` or `handled_by` tracking visible in the UI.

**Fix**: When admin toggles status to "signed", update the matching `document_requests` row with the admin's name/ID. Display "Handled by [Admin Name]" in the audit log and optionally in the table row.

### 8. Admin Sidebar Badge Count May Be Zero (Low)

`usePendingDocumentRequests` queries `document_requests` table for `status IN ('requested', 'email_sent')`. If no requests have flowed through the edge function yet, this will always be 0. This is correct behavior — it will populate once users start requesting.

**No action needed** — this works correctly once data flows.

---

## Implementation Plan

### Step 1: Fix ListingCardActions to Open Modal Instead of Redirect
- Add `useState` for `signingOpen` 
- Replace the `<Link>` at line 188 with a `<Button>` that sets `signingOpen(true)`
- Render `<AgreementSigningModal>` at the bottom of the component
- Fix `handleConnectionClick` line 114 to use `!isNdaCovered && !isFeeCovered`

### Step 2: Fix PendingApproval to Support Either Doc
- Replace `useBuyerNdaStatus` with `useMyAgreementStatus`
- Update navigation logic: if either NDA or fee is covered, allow proceeding
- Update copy: "Sign an agreement" instead of "Sign your NDA"
- Add Fee Agreement button alongside NDA button
- Update signed state to show "Agreement signed" when either is complete

### Step 3: Add Pending Request Queue to Document Tracking
- Add a new query hook `usePendingDocumentRequests` that fetches individual rows from `document_requests` where `status IN ('requested', 'email_sent')`
- Render a collapsible section at the top of DocumentTrackingPage showing each pending request with: recipient name/email, doc type, requested timestamp, firm name
- Add "Mark Signed" quick action button on each row
- When "Mark Signed" is clicked, update both `document_requests.status = 'signed'` and the corresponding `firm_agreements` status, recording the admin's identity

### Step 4: Show Admin Attribution on Status Toggles
- When `AgreementStatusDropdown` changes status to 'signed', also update any matching open `document_requests` row to `status = 'signed'` with `requested_by_admin_id = current admin`
- Show the admin name in the audit log entries

### Files Changed
- `src/components/listing/ListingCardActions.tsx` — modal instead of redirect + fix connection click gate
- `src/pages/PendingApproval.tsx` — either-doc support
- `src/pages/admin/DocumentTrackingPage.tsx` — pending request queue section
- `src/components/admin/firm-agreements/AgreementStatusDropdown.tsx` — admin attribution on sign

