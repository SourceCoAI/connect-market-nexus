

# Audit Complete: 7 Remaining Issues

## Confirmed Fixed (no changes needed)
All items from prior rounds are correct: BlurredFinancialTeaser, ConnectionButton, ListingSidebarActions, BuyerDataRoom, ListingDetail CTA, AgreementStatusBanner, useConnectionRequestsFilters, grant-data-room-access, notify-agreement-confirmed (both branches), send-templated-approval-email (both branches), DealSidebar, ListingPreview, NdaGateModal, EmailCatalog, EmailTestCentre, user-journey-notifications, email-templates.ts.

## Still Wrong - 7 Locations

### 1. `src/components/buyer/AgreementAlertModal.tsx` (line 59)
**Current:** "Sign it to unlock full deal access."
**Fix:** "Sign it so we can freely exchange deal information." (remove "full deal access" promise)

### 2. `src/components/buyer/AgreementAlertModal.tsx` (line 60)
**Current:** Uses em-dash in Fee Agreement description
**Fix:** Replace em-dash with hyphen: "Here is our fee agreement - you only pay..."

### 3. `src/pages/Profile/ProfileDocuments.tsx` (line 155)
**Current:** "Sign and return to support@sourcecodeals.com to unlock full deal access."
**Fix:** "Sign and return to support@sourcecodeals.com to receive deal materials and request introductions."

### 4. `src/pages/PendingApproval.tsx` (line 211-212)
**Current:** "Sign a quick NDA and Fee Agreement via email" + "Full access to off-market deals"
**Fix:** "Sign a Fee Agreement via email" + "Browse deals and request introductions"

### 5. `src/pages/PendingApproval.tsx` (line 254)
**Current:** Status step label "Full access" with sublabel "After approval"
**Fix:** "Access granted" with sublabel "After approval"

### 6. `src/pages/PendingApproval.tsx` (line 279)
**Current:** "The moment your account is approved, you'll have full access to the deal pipeline."
**Fix:** "Once approved, you can browse deals and request introductions."

### 7. `src/components/admin/editor-sections/EditorLivePreview.tsx` (line 405)
**Current:** "Get full access to detailed financials and business metrics"
**Fix:** "Get access to deal materials and business details"

### Borderline / Acceptable (No Change)
- `send-marketplace-invitation` (line 62): "Secure data room access for diligence" - This is a marketing email to prospective users who haven't signed up yet. It describes the platform's capabilities, not a promise of immediate access. Acceptable.
- `DealStatusSection.tsx` (line 46): "Sign an agreement (NDA or Fee Agreement)" - This is accurate; either document can advance the status. The system does accept both. Acceptable.
- `DealStatusSection.tsx` (lines 44, 48): Em-dashes in buyer-facing status text - These are functional explanations in the deal tracker, not email copy. Borderline but low priority; include in this round for consistency.
- `ConnectionButton.tsx` admin badge "full access" - Admin-only, not buyer-facing. No change.
- `InviteTeamMemberDialog.tsx` "Full access to all pages" - Admin role description. No change.
- `data-room-download` code comment "Full access" - Code comment, not user-facing. No change.
- `notify-agreement-confirmed` code comment "full access granted" - Code comment, not user-facing. No change.

## Files to Change

| File | Lines | Change |
|------|-------|--------|
| `src/components/buyer/AgreementAlertModal.tsx` | 59-60 | Remove "full deal access"; fix em-dash |
| `src/pages/Profile/ProfileDocuments.tsx` | 155 | "unlock full deal access" to "receive deal materials and request introductions" |
| `src/pages/PendingApproval.tsx` | 211-212, 254, 279 | Remove NDA mention; replace "full access" with "browse deals and request introductions" |
| `src/components/admin/editor-sections/EditorLivePreview.tsx` | 405 | "full access to detailed financials" to "access to deal materials and business details" |
| `src/components/deals/DealStatusSection.tsx` | 44, 48 | Replace em-dashes with hyphens |

## No Edge Function Redeployments Needed
All changes are frontend-only.

