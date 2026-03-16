

# Remaining Gaps in Firm Association & Agreement Tracking

## Already Implemented (Confirmed)
All items from the original plan and the two subsequent rounds are in place:
- `resolve_user_firm_id()` rewritten (non-circular)
- `useConnectionRequestFirm` resolves via user_id + RPC
- `useConnectionRequestActions` — no profile fallbacks
- `DualNDAToggle` / `DualFeeAgreementToggle` — firm-only
- `use-firm-agreement-actions.ts` `useUserFirm` — uses canonical RPC
- `ProfileDocuments.tsx` — uses canonical RPC
- `MessageCenter.tsx` — uses `firm_members`
- `auto-create-firm-on-approval` — re-resolves, ignores `cr.firm_id`
- `company` and `buyer_type` locked in `PRIVILEGED_FIELDS` + disabled in ProfileForm + DB trigger
- `SimpleNDADialog` / `SimpleFeeAgreementDialog` — use firm-level badges
- `AgreementToggle.tsx` (non-marketplace) — resolves firm via domain
- Realtime hooks — marked as APPROXIMATE

## Still Broken (3 components still reading stale profile-level booleans)

### 1. `MobileConnectionRequestsTable.tsx` — reads `request.user?.nda_signed` / `request.user?.fee_agreement_signed` (HIGH)
Lines 73-91 display agreement status badges directly from the profile join. On mobile pipeline views, admins see wrong statuses.

**Fix**: Use the `useConnectionRequestFirm` hook or `AgreementStatusBadge` with firm-resolved data instead of `request.user?.nda_signed`.

### 2. `PipelineFilters.tsx` — filter counts use `request.user?.nda_signed` / `request.user?.fee_agreement_signed` (HIGH)
Lines 159-171 compute NDA/Fee filter option counts from stale profile booleans. Pipeline filter counts are wrong.

**Fix**: These filters need to check `request.lead_nda_signed` (CR-level) only, or ideally resolve from firm data. Since filter counts run over the full request list, the pragmatic fix is to use only the `lead_*` fields from the connection_requests table (which are per-request, not per-profile) and drop the `|| r.user?.nda_signed` fallback.

### 3. `use-pipeline-filters.ts` — filter logic uses `request.user?.nda_signed` / `request.user?.fee_agreement_signed` (HIGH)
Lines 143-175 apply NDA/Fee filters using stale profile booleans as fallback.

**Fix**: Same approach — use only `request.lead_nda_signed` / `request.lead_fee_agreement_signed` (the CR-level fields), remove `|| request.user?.nda_signed` fallback.

## Summary

| # | File | Issue | Fix |
|---|------|-------|-----|
| 1 | `MobileConnectionRequestsTable.tsx` | Reads `request.user?.nda_signed` for badge display | Replace with firm-resolved data or `lead_nda_signed` |
| 2 | `PipelineFilters.tsx` | Filter counts use stale profile booleans | Remove `r.user?.nda_signed` fallback, use `lead_*` fields only |
| 3 | `use-pipeline-filters.ts` | Filter logic uses stale profile booleans | Remove `request.user?.nda_signed` fallback, use `lead_*` fields only |

These are the last 3 remaining files still reading stale profile-level agreement booleans. Everything else from the original plan is confirmed implemented.

## Implementation
Single round, all 3 files. Each edit is a simple removal of the `|| request.user?.nda_signed` / `|| request.user?.fee_agreement_signed` fallback pattern, keeping only the `lead_*` fields from the connection request record itself.

