

# Fix Listing Detail — Remove Full-Screen Block, Add Sidebar Document Status

## Problem
When a buyer requests an NDA (status becomes "sent"), the listing detail page shows a full-screen blocking modal (`NdaGateModal`) that prevents them from even viewing the listing. The user wants:
1. Buyers should always be able to VIEW listing details
2. Only the connection request button should be blocked (already works via `ConnectionButton`)
3. The sidebar should show that a document was sent to their email

## Changes

### 1. Remove the full-screen NdaGateModal from ListingDetail.tsx (lines 161-174)

Delete the early return that renders `NdaGateModal`. The `ConnectionButton` component already handles the unsigned state correctly — it shows an "Agreement Required" block with a "Request Agreement via Email" button. The `AgreementStatusBanner` can still appear inline on the page.

### 2. Add document-sent info card to the sidebar

In the sidebar section of `ListingDetail.tsx` (around line 348), add a new card that appears when the user has a pending/sent agreement. It will:
- Show when `agreementStatus.nda_status === 'sent'` or `fee_status === 'sent'`
- Display: "Your NDA has been sent to **user@email.com**. Review, sign, and reply to support@sourcecodeals.com."
- Include a "Resend" button that opens the `AgreementSigningModal`
- Use the same blue info styling as the `AgreementStatusBanner` info variant

### 3. Keep the AgreementStatusBanner

The existing banner component already handles sent/signed states well. It should render above the listing content (not as a blocker). Verify it's rendered somewhere on the page — if not, add it below the header.

### Files Changed
- `src/pages/ListingDetail.tsx` — remove NdaGateModal early return, add sidebar document status card
- `src/components/pandadoc/NdaGateModal.tsx` — no changes (still used by other surfaces if needed)

### Technical Details
- `agreementStatus.nda_status` will be `'sent'` for users who requested but haven't signed
- `user?.email` provides the email to display in the sidebar card
- `ConnectionButton` already blocks unsigned users from requesting connections (line 176)
- The `AgreementSigningModal` is already imported and used in `ConnectionButton`

