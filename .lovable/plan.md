
## Fix Document Sync, Tracking & Admin Toggles -- Complete Remediation

### Issues Found

**1. CRITICAL: `update_firm_agreement_status` RPC references non-existent columns**
The NDA branch of the RPC sets `nda_scope` and `nda_deal_id` -- but these columns don't exist in `firm_agreements`. Only `fee_agreement_scope` and `fee_agreement_deal_id` exist. This means **every NDA status toggle from the admin will fail silently or error out**.

**2. `get_user_firm_agreement_status` RPC doesn't return document URLs**
The buyer's `useFirmAgreementStatus` hook calls this RPC, then `AgreementSection.tsx` tries to read `nda_signed_document_url`, `nda_document_url`, `fee_signed_document_url`, `fee_agreement_document_url` from the result -- but the RPC only returns `firm_id, firm_name, nda_signed, nda_status, nda_docuseal_status, nda_signed_at, fee_agreement_signed, fee_agreement_status, fee_docuseal_status, fee_agreement_signed_at`. All document URLs are always null on the buyer side.

**3. Admin `ThreadContextPanel` audit timeline doesn't show `changed_by_name`**
The activity timeline fetches `agreement_audit_log` but only selects `id, agreement_type, old_status, new_status, created_at, notes` -- missing `changed_by_name`. So when Bill Martin toggles NDA off, the timeline says "NDA: not_started" but doesn't say who did it.

**4. `DocumentTrackingPage` date columns don't show last admin action for non-signed states**
When an admin resets a document from "signed" to "not_started", `nda_signed_at` becomes null and the date column shows "--". There's no indication of the last status change or who performed it.

**5. `AgreementStatusDropdown` has no "Reset to Not Started" for all states**
The valid transitions don't include going from `signed` directly to `not_started`. The reset option exists as a separate menu item, but only for `currentStatus !== 'not_started'`. This is correct but the transitions from `signed` only allow `expired` -- there's no way to move `signed -> sent` to re-send.

**6. NDASection in connection request sidebar doesn't use `AgreementStatusDropdown`**
It still uses a simple Signed/Sent/Not Sent text display with no toggle capability. Admins can't change status from this view.

### Implementation Plan

#### Phase 1: Fix the RPC -- add missing columns + expand return type

**DB Migration:**
- Add `nda_scope` and `nda_deal_id` columns to `firm_agreements` (matching the fee_agreement equivalents)
- Update `get_user_firm_agreement_status` RPC to also return: `nda_signed_document_url`, `nda_document_url`, `nda_signed_by_name`, `fee_signed_document_url`, `fee_agreement_document_url`, `fee_agreement_signed_by_name`
- Update TypeScript types in `types.ts` to match expanded return

#### Phase 2: Show admin identity on all audit entries

**File: `src/pages/admin/message-center/ThreadContextPanel.tsx`**
- Add `changed_by_name` to the audit log query select
- Display admin name in timeline events for agreement status changes (e.g., "NDA: not_started -- by Bill Martin")

**File: `src/pages/admin/DocumentTrackingPage.tsx`**
- Add a "Last Action" column or enhance the date columns to show the last audit entry when status is not "signed"
- Show: admin name, action, timestamp (e.g., "Reset by Bill Martin, Mar 2")
- Fetch last audit entries for visible firms in a single batch query

#### Phase 3: Expand `AgreementStatusDropdown` transitions

**File: `src/components/admin/firm-agreements/AgreementStatusDropdown.tsx`**
- Add `signed -> sent` transition (re-send after signing)
- Show the "Reset to Not Started" option for ALL non-not_started states (already works, just confirming)
- Show signed document URL + draft URL in the hover metadata for all states where they exist
- Display `changed_by_name` from last audit entry in the hover metadata

#### Phase 4: Upgrade NDASection sidebar to use dropdowns

**File: `src/components/admin/connection-request-actions/NDASection.tsx`**
- Replace simple text display with `AgreementStatusDropdown` component
- Pass firm data and members so admin can toggle status directly from the connection request sidebar
- Keep the "Send" button for not_started state

#### Phase 5: Ensure buyer view shows all document URLs

**File: `src/pages/BuyerMessages/AgreementSection.tsx`**
- After Phase 1 RPC fix, document URLs will flow through correctly
- Show both signed PDF download AND draft download when both exist (even when signed)
- Show draft download when unsigned

### Technical Details

**DB Migration SQL:**
```sql
-- Add missing columns
ALTER TABLE firm_agreements ADD COLUMN IF NOT EXISTS nda_scope text DEFAULT 'blanket';
ALTER TABLE firm_agreements ADD COLUMN IF NOT EXISTS nda_deal_id uuid;

-- Expand RPC return type to include document URLs
CREATE OR REPLACE FUNCTION get_user_firm_agreement_status(p_user_id uuid)
RETURNS TABLE(
  firm_id uuid, firm_name text,
  nda_signed boolean, nda_status text, nda_docuseal_status text,
  nda_signed_at timestamptz, nda_signed_by_name text,
  nda_signed_document_url text, nda_document_url text,
  fee_agreement_signed boolean, fee_agreement_status text,
  fee_docuseal_status text, fee_agreement_signed_at timestamptz,
  fee_agreement_signed_by_name text,
  fee_signed_document_url text, fee_agreement_document_url text
) ...
```

**Files to modify:**

| File | Change |
|------|--------|
| DB migration | Add `nda_scope`, `nda_deal_id` columns; expand `get_user_firm_agreement_status` RPC |
| `src/integrations/supabase/types.ts` | Update `get_user_firm_agreement_status` return type |
| `src/pages/admin/message-center/ThreadContextPanel.tsx` | Add `changed_by_name` to audit query + display |
| `src/pages/admin/DocumentTrackingPage.tsx` | Show last audit action in date columns when not signed |
| `src/components/admin/firm-agreements/AgreementStatusDropdown.tsx` | Add `signed -> sent` transition, show doc URLs in metadata |
| `src/components/admin/connection-request-actions/NDASection.tsx` | Replace text display with `AgreementStatusDropdown` |
| `src/pages/BuyerMessages/AgreementSection.tsx` | Leverage expanded RPC data for dual doc URLs |

### What This Fixes
- NDA status toggles will stop failing (missing column fix)
- Buyer sees document URLs (signed PDF + draft) in all states
- Every admin toggle is attributed with admin name + exact timestamp
- Admin can toggle status from both Document Tracking page and connection request sidebar
- Activity timeline shows exactly who changed what and when
