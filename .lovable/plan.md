

## Holistic Firm Agreement & Document Tracking Overhaul

### Current State

The existing **Document Tracking** page (`/admin/documents`) only shows firms that have already been sent a document (`nda_status != 'not_started'`). It excludes:
- Marketplace users whose firms have `not_started` status
- Users without any firm record at all
- It's read-only (no inline status toggling)
- Its query (`admin-document-tracking`) is **never invalidated** by any mutation, so it goes stale when statuses change

Meanwhile, the **"Needs Agreements" tab** in the Remarketing Buyers page shows remarketing buyers without fee agreements -- but this is a different dataset from marketplace users.

There is no single screen that pulls ALL marketplace-facing users/firms and shows their complete document lifecycle.

### What We'll Build

Replace the current Document Tracking page with a **comprehensive Firm Agreements Dashboard** that:

1. Shows **every firm** in `firm_agreements` (not just those with `sent` status) -- this captures all marketplace users since firms are auto-created on signup
2. Shows **orphan marketplace users** (approved profiles with no firm record) as a separate "Needs Firm" group
3. Displays **both NDA and Fee Agreement status inline** per firm (side by side, not as separate rows)
4. Includes **inline status toggling** (dropdown to change status directly from the table)
5. **Auto-updates** when status changes from any source (DocuSeal webhook, manual toggle, buyer signing via messages, admin toggle)

### Status Sources That Must Sync

All of these paths update `firm_agreements` and must invalidate the tracking query:

| Source | How it updates | Current invalidation |
|--------|---------------|---------------------|
| DocuSeal webhook | Updates `nda_signed`, `nda_docuseal_status`, etc. via edge function | None for `admin-document-tracking` |
| Admin manual toggle (AgreementStatusDropdown) | Calls `update_firm_agreement_status` RPC | Invalidates `firm-agreements` but NOT `admin-document-tracking` |
| Admin toggle via user row (AgreementToggle) | Calls `update_agreement_via_user` RPC | Invalidates `firm-agreements` but NOT `admin-document-tracking` |
| Buyer signs via Messages embed | Calls `confirm-agreement-signed` edge function | Invalidates `my-agreement-status` only |
| Auto-create on signup/approval | Creates firm record | No frontend invalidation |

### Implementation Plan

**1. Rebuild DocumentTrackingPage to show ALL firms with inline controls**

Replace the data hook to:
- Fetch ALL `firm_agreements` (remove the `not_started` filter)
- Include member count, primary contact info, email domain
- Show NDA and Fee Agreement status **side by side** per firm row (not separate rows per document)
- Add a "Not Started" filter option alongside existing filters
- Add counts for each status category in stat cards

Add inline status controls:
- Each NDA/Fee cell gets the existing `AgreementStatusDropdown` component for quick status changes
- Reuse `useUpdateAgreementStatus` mutation from `use-firm-agreement-mutations.ts`

Add an "Orphan Users" alert:
- Query `profiles` where `approval_status = 'approved'` and no matching `firm_members` record
- Show count + expandable list so admin can manually create firm associations

**2. Fix query invalidation across all mutation paths**

Add `admin-document-tracking` to the invalidation list in:
- `useUpdateAgreementStatus` (firm-agreement-mutations.ts)
- `useUpdateFirmNDA` (firm-agreement-mutations.ts)
- `useUpdateFirmFeeAgreement` (firm-agreement-mutations.ts)
- `useUpdateAgreementViaUser` (firm-agreement-actions.ts)

This ensures any status change from any admin surface immediately refreshes the tracking page.

**3. Add realtime subscription for external updates**

Add a Supabase realtime channel listening to `firm_agreements` table changes. When a row is updated (e.g., by DocuSeal webhook or buyer signing), automatically invalidate the tracking query. This handles the "buyer signs from messages" and "webhook fires" cases without polling.

### Files to Change

| File | Change |
|------|--------|
| `src/pages/admin/DocumentTrackingPage.tsx` | Rebuild: show all firms, side-by-side NDA/Fee columns, inline `AgreementStatusDropdown`, orphan users alert, realtime subscription, updated stat cards |
| `src/hooks/admin/use-firm-agreement-mutations.ts` | Add `admin-document-tracking` to all `invalidateQueries` calls in `onSuccess` for all 3 mutation hooks |
| `src/hooks/admin/use-firm-agreement-actions.ts` | Add `admin-document-tracking` to `invalidateQueries` in `useUpdateAgreementViaUser` |

### What stays the same

- All existing firm creation logic (auto-create on signup/approval)
- All existing signing flows (DocuSeal embed, webhook handler, confirm-agreement-signed)
- All existing mutation hooks and RPCs
- Sidebar link stays at `/admin/documents` under Deals section
- Remarketing Buyers "Needs Agreements" tab remains for remarketing-specific view

### New Table Layout (per row = one firm)

```text
| Firm Name | Domain | Members | NDA Status [dropdown] | NDA Sent | NDA Signed | Fee Status [dropdown] | Fee Sent | Fee Signed | Primary Contact |
```

Status dropdown options: Not Started, Sent, Signed, Declined, Expired, Redlined, Under Review

### Stat Cards

- Total Firms
- NDA Signed / Total
- Fee Signed / Total  
- Needs Attention (sent but unsigned > 7 days)
- Orphan Users (no firm)

