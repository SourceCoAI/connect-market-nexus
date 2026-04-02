

# Document Signing Revamp — Final Audit

## Status: ~99% Complete

The system is fully functional end-to-end. All major surfaces — marketplace cards, listing detail, My Deals, Profile Documents, PendingApproval, and admin Document Tracking — correctly implement the email-based workflow with the "either-doc" rule. Only two minor issues remain.

---

## Remaining Issues

### 1. Filter bug in DocumentTrackingPage (functional)

**File:** `src/pages/admin/DocumentTrackingPage.tsx`, lines 329-354

The `pending_requests` filter is inside an `else` branch of the search query check. When an admin types a search query AND has "Pending Requests" selected as the filter, the pending filter is ignored — all search results show regardless of pending status.

**Fix:** Move filter logic so it applies independently of search. The `pending_requests` filter (and all other status filters) should apply as a second pass after search, not as an alternative to search.

### 2. Welcome page copy says "Sign NDA" instead of "Sign Agreement"

**File:** `src/pages/Welcome.tsx`, line 171

The "How it works" text reads: `Apply → Verify your email → Admin review → Sign NDA → Browse deals → Request access`

This should say "Sign Agreement" instead of "Sign NDA" to reflect the new either-doc rule.

---

## Everything Else: Verified Working

| Area | Status |
|------|--------|
| ListingCardActions — either-doc gate + inline chooser modal | Correct |
| ConnectionButton — either-doc gate + inline chooser modal | Correct |
| ListingDetail — gate uses coverage, not firm_id | Correct |
| NdaGateModal — offers both NDA + Fee Agreement | Correct |
| AgreementSigningModal — chooser step when no type provided | Correct |
| PendingApproval — both doc buttons + either-doc check | Correct |
| ProfileDocuments — requestable even without firm | Correct |
| DealActionCard — either-doc rule + chooser modal | Correct |
| DealDocumentsCard — both NDA + Fee rows, either-doc gate | Correct |
| DealStatusSection — either-doc stage logic + copy | Correct |
| AgreementStatusBanner — no false "fee required" messaging | Correct |
| DocumentTrackingPage — pending queue, amber rows, audit log | Correct |
| DocumentTrackingPage — Mark Signed with admin attribution + audit log insert | Correct |
| DocumentTrackingPage — realtime invalidation (all 3 query keys) | Correct |
| Sidebar badge — counts from document_requests | Correct |
| Edge function — sends via Brevo, syncs both tables | Correct |

### Files to Change
- `src/pages/admin/DocumentTrackingPage.tsx` — fix filter/search independence (lines 329-354)
- `src/pages/Welcome.tsx` — change "Sign NDA" to "Sign Agreement" (line 171)

