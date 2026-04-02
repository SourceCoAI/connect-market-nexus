

# Document Signing Revamp — Final Remaining Issues

## Overall Status: 95% Complete

The system is substantially built. All major screens, gates, the edge function, realtime subscriptions, and the admin tracking page exist and are correctly structured. However, there is **one critical data bug** and a few minor improvements needed.

---

## CRITICAL BUG: Column Name Mismatch in Pending Request Queue

The `document_requests` table has a column called `agreement_type`, but the admin pending request queue query (DocumentTrackingPage line 215) selects `document_type`. The `PendingRequest` interface also references `document_type`. The edge function inserts correctly using `agreement_type`.

**Result**: Every pending request row will have `document_type: null`, so the queue shows "Unknown" for the document type, and the "Mark Signed" button updates the wrong `firm_agreements` column (falls through to fee agreement). The sidebar badge query in `usePendingDocumentRequests` also likely works since it only counts by status, but the display is broken.

**Fix**: Change the query to select `agreement_type` and update the `PendingRequest` interface and all references from `document_type` to `agreement_type` (or alias it in the select: `agreement_type` and rename the interface field).

Files: `src/pages/admin/DocumentTrackingPage.tsx` — lines 198-224 (interface + query), lines 569-628 (rendering).

---

## MINOR: Pending Queue "Mark Signed" Doesn't Record Admin Attribution

When an admin clicks "Mark Signed" in the pending queue (line 594-621), it updates `document_requests.status` to `signed` but does NOT set `signed_toggled_by` or `signed_toggled_by_name`. The columns exist in the table schema but the update payload doesn't include them.

**Fix**: Import `useAuth` and include the current admin's ID and name in the update:
```
signed_toggled_by: currentUser.id,
signed_toggled_by_name: currentUser.first_name + ' ' + currentUser.last_name,
signed_at: new Date().toISOString(),
```

---

## MINOR: Pending Queue Not Invalidated by Realtime

The realtime subscription (line 236) invalidates `admin-document-tracking` and `admin-pending-doc-requests` on `document_requests` changes, but does NOT invalidate `admin-pending-request-queue` — the query key used by `usePendingRequestQueue()`.

**Fix**: Add `queryClient.invalidateQueries({ queryKey: ['admin-pending-request-queue'] })` to the realtime handler at line 238.

---

## Everything Else: Verified Working

| Area | Status | Verified |
|------|--------|----------|
| ListingCardActions — "either doc" gate | Correct | `!isNdaCovered && !isFeeCovered` at line 114, 173 |
| ListingCardActions — inline modal (not redirect) | Correct | `setSigningOpen(true)` at line 190, no `<Link>` redirect |
| ListingDetail — gate condition | Correct | `!nda_covered && !fee_covered` at line 60 |
| NdaGateModal — offers both docs | Correct | Two request buttons (NDA + Fee Agreement) |
| ConnectionButton — "either doc" gate | Correct | Line 53, line 176 |
| ConnectionButton — action button (not static text) | Correct | `setShowAgreementModal(true)` at line 193 |
| AgreementStatusBanner — "either doc" | Correct | Line 59 checks `!coverage.fee_covered` |
| DealActionCard — "either doc" | Correct | `hasAnyAgreement = ndaSigned || feeCovered` |
| DealDocumentsCard — "either doc" | Correct | Same pattern |
| PendingApproval — both NDA + Fee buttons | Correct | Lines 278-293 |
| PendingApproval — uses `useMyAgreementStatus` | Correct | Line 42 |
| ProfileDocuments — email-based request/resend | Correct | Full implementation with status badges |
| AgreementSection (Messages) — uses modal | Correct | `AgreementSigningModal` |
| useDownloadDocument — no deleted edge function | Correct | Uses direct URLs |
| Edge function — syncs both tables | Correct | Updates `document_requests` + `firm_agreements` |
| Edge function — admin override | Correct | Checks `user_roles`, accepts `recipientEmail` |
| Edge function — PDF download link | Correct | Gets public URL from `agreement-templates` bucket |
| Admin notifications — sent to all admins | Correct | Lines 250-270 |
| DocumentTrackingPage — default sort `last_requested` | Correct | Line 263 |
| DocumentTrackingPage — amber highlighting | Correct | Line 818 |
| DocumentTrackingPage — "Requested" sortable column | Correct | Lines 765-772 |
| DocumentTrackingPage — pending filter option | Correct | Line 665 |
| DocumentTrackingPage — pending request queue section | Correct | Lines 555-631 |
| Sidebar badge — counts from `document_requests` | Correct | `usePendingDocumentRequests` |
| Realtime — `firm_agreements` + `document_requests` | Correct | Lines 231-245 |
| Audit log — shows admin attribution | Correct | Lines 942-956 |

---

## Implementation Plan

### Step 1: Fix column name mismatch (Critical)
In `DocumentTrackingPage.tsx`:
- Change `PendingRequest` interface: `document_type` → `agreement_type`
- Change query select: `document_type` → `agreement_type`
- Update all rendering references from `req.document_type` to `req.agreement_type`

### Step 2: Add admin attribution to "Mark Signed"
- Import `useAuth` in the component (or pass admin user down)
- When clicking "Mark Signed", include `signed_toggled_by`, `signed_toggled_by_name`, and `signed_at` in the update payload

### Step 3: Fix realtime invalidation for pending queue
- Add `queryClient.invalidateQueries({ queryKey: ['admin-pending-request-queue'] })` to the `document_requests` realtime handler

### Files Changed
- `src/pages/admin/DocumentTrackingPage.tsx` — all 3 fixes in one file

