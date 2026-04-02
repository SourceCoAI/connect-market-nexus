

# Document Signing Revamp — Current State & Remaining Work

## What's Already Done and Working

| Area | Status |
|------|--------|
| `document_requests` table | Created with correct schema + RLS |
| `firm_agreements` columns (`nda_requested_at`, etc.) | Added |
| `request-agreement-email` edge function | Created, sends via Brevo, inserts `document_requests`, notifies admins |
| `AgreementSigningModal` | Rewritten for email flow |
| `NdaGateModal` | Rewritten for email flow |
| `FeeAgreementGate` | Rewritten for email flow |
| `PendingApproval` page | Rewritten — uses email-based NDA request |
| `ProfileDocuments` tab | Rewritten — shows simplified status with email request buttons |
| `ConnectionButton` gate | Changed to "at least one of NDA or Fee Agreement" |
| Server-side RPC gate | Updated to require at least one agreement |
| `DocumentTrackingPage` | Has pending filter, amber highlighting, `last_requested` sort, pending stat card |
| Admin sidebar badge | `usePendingDocumentRequests` hook + red dot |
| Admin attribution on toggle | `use-firm-agreement-mutations` updates `document_requests` with admin name |
| `SendAgreementDialog` | Rewritten for email flow |
| `PandaDocSigningPanel.tsx` | Deleted |
| `DealDocumentsCard` & `DealActionCard` | Already use `AgreementSigningModal` |
| `AgreementSection` (Messages) | Uses `resolveAgreementStatus` with `nda_status`/`fee_agreement_status` |
| Realtime sync | Subscribes to `document_requests` changes |

## What Still Needs Fixing

### 1. MessageCenter PandaDoc fallback (Medium)
`src/pages/admin/MessageCenter.tsx` line 133-139 still passes `nda_pandadoc_status` and `fee_pandadoc_status` as fallback to `resolveAgreementStatus()`. While this won't break (it's a fallback), it queries PandaDoc columns unnecessarily. Should pass `null` instead.

### 2. EmailTestCentre references `confirm-agreement-signed` (Low)
`src/pages/admin/EmailTestCentre.tsx` still has 2 test entries that invoke `confirm-agreement-signed` for NDA/fee completion emails. These should reference the new email-based flow or be removed.

### 3. Legacy edge functions still exist on disk (Low — cleanup)
These are superseded but still in the codebase:
- `get-buyer-nda-embed/`
- `get-buyer-fee-embed/`
- `confirm-agreement-signed/`
- `pandadoc-webhook-handler/`
- `cleanup-orphaned-pandadoc-documents/`
- `pandadoc-integration-test/`

They don't break anything but add noise. Can be deleted.

### 4. System test runner references legacy functions (Low)
`src/pages/admin/system-test-runner/apiTests.ts` tests `get-buyer-nda-embed` reachability and checks for `nda_pandadoc_status` columns. Should be updated to test `request-agreement-email` instead.

### 5. Email has no PDF attachment/link (Medium — manual step required)
The `request-agreement-email` function sends an HTML email explaining the process but doesn't attach or link the actual NDA/Fee Agreement PDF. You need to:
- Upload NDA.pdf and FeeAgreement.pdf to Supabase Storage (`agreement-templates` bucket)
- Update the edge function to include a download link

### 6. `use-pandadoc.ts` still references PandaDoc status (Low)
`useBuyerNdaStatus` at line 136 reads `nda_pandadoc_status` from the RPC result. This is harmless (just reads a column that still exists in DB) but should be cleaned up.

### 7. `use-connection-request-firm.ts` exposes PandaDoc columns (Low)
Interface and mapping include `nda_pandadoc_status`/`fee_pandadoc_status`. Harmless but should be cleaned.

---

## Implementation Plan

### Step 1: Fix MessageCenter PandaDoc fallback
Change lines 133-139 in `MessageCenter.tsx` to pass `null` instead of `firm.nda_pandadoc_status` / `firm.fee_pandadoc_status`.

### Step 2: Update EmailTestCentre
Replace the 2 `confirm-agreement-signed` test entries with `request-agreement-email` test entries that match the new flow.

### Step 3: Clean up `use-pandadoc.ts` and `use-connection-request-firm.ts`
Remove PandaDoc status field references from both hooks.

### Step 4: Update system test runner
Replace `get-buyer-nda-embed` test and `pandadoc_status` column tests with `request-agreement-email` tests.

### Step 5: Create Storage bucket + update edge function with PDF link
- Create `agreement-templates` storage bucket via migration
- Update `request-agreement-email` to include a download link for the appropriate PDF template (users will need to upload actual PDFs)

### Step 6: Delete legacy PandaDoc edge functions
Remove from disk: `get-buyer-nda-embed/`, `get-buyer-fee-embed/`, `confirm-agreement-signed/`, `pandadoc-webhook-handler/`, `cleanup-orphaned-pandadoc-documents/`, `pandadoc-integration-test/`

