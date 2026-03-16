

# Status Report: Agreement Tracking Integrity

## What's Fully Done

All frontend hooks, components, and 3 of 4 edge functions now use the canonical `resolve_user_firm_id` RPC and read exclusively from `firm_agreements`:

- `useConnectionRequestFirm` — resolves via user_id + RPC
- `useConnectionRequestActions` — firm-only, no profile fallbacks
- `DualNDAToggle` / `DualFeeAgreementToggle` — firm-only
- `useUserFirm` (both versions) — canonical RPC
- `ProfileDocuments` (buyer) — canonical RPC
- `MessageCenter` — uses `firm_members` directly
- Pipeline filters + mobile table — `lead_*` fields only
- `confirm-agreement-signed` edge function — canonical RPC, no profile writes
- `get-buyer-nda-embed` / `get-buyer-fee-embed` — canonical RPC, no profile writes
- `auto-create-firm-on-approval` — re-resolves, ignores `cr.firm_id`
- `get-agreement-document` — canonical RPC
- `company` and `buyer_type` locked (PRIVILEGED_FIELDS + ProfileForm disabled + DB trigger)
- `SimpleNDADialog` / `SimpleFeeAgreementDialog` — firm-level badges
- `AgreementToggle.tsx` (non-marketplace) — resolves firm via domain
- Realtime hooks — marked APPROXIMATE
- Buyer-facing `useMyAgreementStatus` — uses `get_my_agreement_status` RPC
- `useFirmAgreementStatus` (buyer messages) — uses `get_user_firm_agreement_status` RPC
- `useBuyerNdaStatus` — uses `get_user_firm_agreement_status` RPC
- `AgreementStatusDropdown` — writes to `firm_agreements` via `update_agreement_status` RPC with audit logging
- `agreement_audit_log` table exists with admin attribution

## One Remaining Issue

### `pandadoc-webhook-handler` still writes to `profiles` table (MEDIUM)

**File**: `supabase/functions/pandadoc-webhook-handler/index.ts`, lines 408-434

When PandaDoc fires a `document.completed` webhook, this handler correctly updates `firm_agreements` (lines 366-396). But then on lines 416-426, it also loops through all `firm_members` and writes `nda_signed: true` / `fee_agreement_signed: true` back to each member's `profiles` row.

This is the last remaining path that writes stale agreement data to `profiles`. While it doesn't break anything today (since all frontend consumers now read from `firm_agreements`), it keeps the stale shadow data alive and could confuse future developers.

**Fix**: Remove the profile sync loop (lines 416-426). Keep the member query (needed for buyer notifications on line 429) but delete the `profiles.update()` calls.

## Summary

| Area | Status |
|------|--------|
| Frontend hooks (all) | Done |
| Admin components (all) | Done |
| Buyer components (all) | Done |
| Pipeline filters + mobile | Done |
| Edge: confirm-agreement-signed | Done |
| Edge: get-buyer-nda-embed | Done |
| Edge: get-buyer-fee-embed | Done |
| Edge: auto-create-firm-on-approval | Done |
| Edge: get-agreement-document | Done |
| Edge: pandadoc-webhook-handler | **Profile writes remain** |
| Data integrity (company/buyer_type lock) | Done |
| Audit logging (agreement_audit_log) | Done |
| `/admin/documents` as single source of truth | Done |

One edit to `pandadoc-webhook-handler/index.ts` to remove the profile sync loop, then deploy. That closes the last gap.

