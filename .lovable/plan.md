

# Document Signing Revamp — Final Cleanup

## Current Status: Core Flow is Complete

All critical functionality is working:
- `document_requests` table with RLS
- `request-agreement-email` edge function (Brevo)
- Buyer UI: `AgreementSigningModal`, `NdaGateModal`, `FeeAgreementGate` — all email-based
- `PendingApproval`, `ProfileDocuments` — rewritten
- `ConnectionButton` — "at least one" gate
- Server-side RPC gate — updated
- Admin `DocumentTrackingPage` — pending filter, amber rows, `last_requested` sort, pending stat card
- Admin sidebar badge, realtime sync on `document_requests`
- Admin attribution on toggle
- `SendAgreementDialog` — email flow
- `PandaDocSigningPanel` — deleted
- `MessageCenter` — already passing `null` for PandaDoc fallbacks

## Remaining Cleanup (Low Priority)

### 1. Remove `useCreatePandaDocDocument` from `use-pandadoc.ts`
The `useCreatePandaDocDocument` hook calls `create-pandadoc-document` edge function. It's defined but **not imported anywhere** — dead code. Remove it and the `PandaDocStatus` type. Keep `useAutoCreateFirmOnApproval` and `useBuyerNdaStatus` (both still used).

### 2. Clean PandaDoc fields from `use-connection-request-firm.ts`
Interface still has `nda_pandadoc_status: null` and `fee_pandadoc_status: null`. These are hardcoded to `null` already — harmless but noisy. Remove from interface and mapping.

### 3. Clean PandaDoc fields from `use-firm-agreements.ts`
Interface has optional `nda_pandadoc_*` and `fee_pandadoc_*` fields (lines 64-70). These columns still exist in the DB so this is harmless, but should be removed from the TypeScript interface since nothing reads them.

### 4. Delete legacy edge functions from disk + deployment
These are superseded and still deployed:
- `create-pandadoc-document/` — no longer called from frontend
- `get-document-download/` — uses PandaDoc API directly
- `send-nda-reminder/` — queries `nda_pandadoc_status`
- `send-fee-agreement-reminder/` — queries `fee_pandadoc_status`
- `reset-agreement-data/` — references PandaDoc columns

### 5. Update AI command center references
- `supabase/functions/ai-command-center/tools/integration/agreement-tools.ts` writes to `pandadoc_status` columns
- `supabase/functions/ai-command-center/system-prompt.ts` and `router.ts` mention PandaDoc
- Should be updated to reference the email-based flow

### 6. Update chatbot QA scenarios
`src/pages/admin/chatbot-test-runner/qaScenarios.ts` has test scenarios referencing "PandaDoc" integration. Should update to "email-based agreement flow".

### 7. Storage bucket for PDF templates
The `agreement-templates` bucket migration exists but the actual NDA.pdf and FeeAgreement.pdf files need to be manually uploaded by the admin. The edge function already checks for them and includes download links when present.

---

## Technical Details

### Files to Edit
- `src/hooks/admin/use-pandadoc.ts` — Remove `useCreatePandaDocDocument`, `PandaDocStatus` type
- `src/hooks/admin/use-connection-request-firm.ts` — Remove `nda_pandadoc_status`/`fee_pandadoc_status` from interface
- `src/hooks/admin/use-firm-agreements.ts` — Remove PandaDoc optional fields from interface
- `supabase/functions/ai-command-center/tools/integration/agreement-tools.ts` — Update to email flow
- `supabase/functions/ai-command-center/system-prompt.ts` — Replace PandaDoc references
- `supabase/functions/ai-command-center/router.ts` — Update routing comment
- `src/pages/admin/chatbot-test-runner/qaScenarios.ts` — Update test descriptions

### Edge Functions to Delete
- `create-pandadoc-document`
- `get-document-download`
- `send-nda-reminder`
- `send-fee-agreement-reminder`
- `reset-agreement-data`

### No Action Required
- `get-agreement-document` — not in the functions list (already removed)
- DB PandaDoc columns — can stay; removing columns is risky with no benefit
- `auto-create-firm-on-approval` — still useful for firm creation, PandaDoc reference within it is a secondary write that won't break anything

