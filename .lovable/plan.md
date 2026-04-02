

# Document Signing Revamp — Final Remaining Issues

## Status: ~97% Complete

The core email-based flow, marketplace gating, admin pending queue, and buyer UI are all working correctly. Three issues remain.

---

## Issue 1: ListingDetail gate requires `firm_id` — fails open for no-firm users

**File:** `src/pages/ListingDetail.tsx`, line 162

The full-screen `NdaGateModal` only renders when `agreementStatus?.firm_id` exists. Users without a resolved firm (new accounts, generic email domains) bypass the gate entirely and see full deal details without any agreement.

**Fix:** Remove the `agreementStatus?.firm_id` condition. The gate should render based solely on coverage status (`showNdaGate` is already correct on line 59-60). The `NdaGateModal` component already handles no-firm scenarios — it invokes `request-agreement-email` which self-heals the firm.

Change line 162 from:
```
if (showNdaGate && agreementStatus?.firm_id && !isInactive && ...)
```
to:
```
if (showNdaGate && !isInactive && ...)
```

---

## Issue 2: Admin UsersTable still uses legacy send-nda-email / send-fee-agreement-email

**Files:**
- `src/components/admin/UsersTable.tsx` — imports `SimpleNDADialog`, `SimpleFeeAgreementDialog`
- `src/components/admin/MobileUsersTable.tsx` — same
- `src/components/admin/SimpleNDADialog.tsx` — calls `send-nda-email`
- `src/components/admin/SimpleFeeAgreementDialog.tsx` — calls `send-fee-agreement-email`
- `src/hooks/admin/use-nda.ts` — invokes `send-nda-email`
- `src/hooks/admin/use-fee-agreement.ts` — invokes `send-fee-agreement-email`

These admin send paths bypass `request-agreement-email` entirely, so documents sent from the Users table don't appear in the pending request queue, don't get tracked in `document_requests`, and don't trigger the sidebar badge.

**Fix:** Rewire `SimpleNDADialog` and `SimpleFeeAgreementDialog` to invoke `request-agreement-email` with admin override parameters instead of the legacy edge functions. This ensures all admin-initiated sends go through the same tracking pipeline.

---

## Issue 3: Legacy email templates still reference "Sign NDA" button copy

**File:** `supabase/functions/_shared/email-templates.ts`, lines 238 and 250

The NDA email templates still have button text "Sign NDA" and "Sign NDA Now" which reference the old PandaDoc signing flow with `signUrl`. These templates are used by the legacy `send-nda-email` edge function. Once Issue 2 is resolved (admin sends routed through `request-agreement-email`), these templates become dead code. No immediate fix needed — they'll be cleaned up when the legacy edge functions are deleted.

---

## Everything Else: Verified Working

| Area | Status |
|------|--------|
| ListingCardActions — either-doc gate + inline chooser modal | Correct |
| ConnectionButton — either-doc gate + inline chooser modal | Correct |
| ListingDetail — `showNdaGate` logic (line 59-60) | Correct |
| NdaGateModal — offers both NDA + Fee Agreement | Correct |
| AgreementSigningModal — chooser step when no type provided | Correct |
| PendingApproval — both doc buttons + either-doc check | Correct |
| ProfileDocuments — requestable even without firm | Correct |
| DealActionCard — either-doc rule + chooser modal | Correct |
| DealDocumentsCard — both NDA + Fee rows | Correct |
| DealStatusSection — either-doc stage logic | Correct |
| AgreementStatusBanner — correct messaging | Correct |
| DocumentTrackingPage — pending queue, amber rows, audit log | Correct |
| DocumentTrackingPage — Mark Signed with admin attribution | Correct |
| DocumentTrackingPage — realtime invalidation (3 query keys) | Correct |
| DocumentTrackingPage — filter/search independence | Correct |
| Sidebar badge — counts from document_requests | Correct |
| Welcome page — "Sign Agreement" copy | Correct |
| Edge function — request-agreement-email | Correct |

---

## Implementation Steps

### Step 1: Fix ListingDetail gate (1 line change)
- Remove `agreementStatus?.firm_id &&` from line 162 in `src/pages/ListingDetail.tsx`

### Step 2: Rewire admin send dialogs to unified pipeline
- Update `SimpleNDADialog.tsx` — change `onSendEmail` callback to invoke `request-agreement-email` with `{ documentType: 'nda', adminOverride: true, recipientEmail, firmId }`
- Update `SimpleFeeAgreementDialog.tsx` — same pattern with `documentType: 'fee_agreement'`
- Update `UsersTable.tsx` and `MobileUsersTable.tsx` send handlers to use the new unified invocation
- This ensures all admin sends appear in the pending request queue and sidebar badge

### Files Changed
- `src/pages/ListingDetail.tsx` — remove firm_id gate dependency
- `src/components/admin/SimpleNDADialog.tsx` — rewire to request-agreement-email
- `src/components/admin/SimpleFeeAgreementDialog.tsx` — rewire to request-agreement-email
- `src/components/admin/UsersTable.tsx` — update send handler
- `src/components/admin/MobileUsersTable.tsx` — update send handler

