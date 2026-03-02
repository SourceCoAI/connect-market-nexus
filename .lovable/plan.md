

## Fix Document Sync + Admin Toggle Audit Trail

### Issues Found

**1. Admin toggle "un-sign" (toggle OFF) does NOT cascade to buyer view**

The `update_firm_agreement_status` RPC handles `signed` transitions well (cascades `nda_signed=true` to profiles), but when an admin toggles a document BACK (e.g., `signed` -> `not_started` via "Reset to Not Started"), the RPC:
- Sets `nda_signed = (p_new_status = 'signed')` which correctly becomes `false` on firm_agreements
- But does NOT cascade `nda_signed = false` back to `profiles` for member users
- Result: Buyer view still shows "Signed" because `profiles.nda_signed` remains `true`

Same issue for fee_agreement.

**2. No audit log entry is written**

The `update_firm_agreement_status` RPC does NOT insert into `agreement_audit_log`. The audit log table exists but is never populated by this RPC. So admin toggle changes have zero tracking of who changed what, when.

**3. Audit log missing `changed_by_name` column**

The `agreement_audit_log` table has `changed_by` (uuid) but NO `changed_by_name` column. When reviewing audit history, there's no way to display "Bill Martin toggled NDA off" without a separate profile join.

**4. `useFirmAgreementStatus` (buyer Messages page) still uses manual firm resolution**

The `useFirmAgreementStatus` hook in `useMessagesData.ts` still does its own `connection_requests` + `firm_members` lookup instead of using the canonical `resolve_user_firm_id` RPC. This is a remaining inconsistency from Phase 1.

**5. Document URLs not shown in both states**

When admin toggles signed -> not_started, the signed document URL is preserved in the DB but the buyer UI only shows the `draftUrl` when unsigned and `signedDocUrl` when signed. Both should be visible where applicable.

**6. AgreementStatusDropdown "Reset to Not Started" transition clears signed_at but signed_by audit is lost**

The RPC uses `COALESCE(nda_signed_at, v_now)` which means it never clears `signed_at` when moving away from signed. When toggled off, `signed_at` remains stale from the previous signing.

### Implementation Plan

#### Phase A: Fix the RPC to handle un-signing and write audit logs

**DB Migration**: Update `update_firm_agreement_status` RPC:

1. Add `changed_by_name` column to `agreement_audit_log` table
2. When status changes AWAY from `signed` (e.g., to `not_started`, `sent`, etc.):
   - Clear `nda_signed_at` / `fee_agreement_signed_at` (reset timestamp)
   - Clear `nda_signed_by` / `fee_agreement_signed_by` and `*_signed_by_name`
   - Cascade `nda_signed = false` / `fee_agreement_signed = false` to ALL `profiles` of firm members
3. Always write to `agreement_audit_log` with:
   - `changed_by` = `auth.uid()`
   - `changed_by_name` = admin's name from profiles lookup
   - `old_status` = previous status value
   - `new_status` = new status value
   - `document_url` = any attached document
   - `notes` = provided notes
   - `metadata` = JSON with source, signed_by_name, etc.

#### Phase B: Fix buyer-facing firm resolution consistency

**File: `src/pages/BuyerMessages/useMessagesData.ts`**
- Update `useFirmAgreementStatus` to use `resolve_user_firm_id` RPC instead of manual lookup, matching the pattern already used in `ThreadContextPanel` and `use-user-firm.ts`

#### Phase C: Show document URLs in both signed and unsigned states

**File: `src/pages/BuyerMessages/AgreementSection.tsx`**
- When signed: show both "Download Signed PDF" and "View Draft" links
- When unsigned but draft exists: show "Download Draft" link
- Both admin (ThreadContextPanel) and buyer views already handle this correctly; AgreementSection is the only one that doesn't expose the signed document URL properly after un-signing

**File: `src/pages/admin/message-center/ThreadContextPanel.tsx`**
- Already shows both draft and signed URLs -- no change needed

#### Phase D: Show admin name + timestamp on all audit entries in DocumentTrackingPage

**File: `src/pages/admin/DocumentTrackingPage.tsx`**
- The NDA Date and Fee Date columns already show `signed_by_name` and date when signed
- Add: when status is NOT signed but was previously toggled by an admin, show the last audit entry's admin name + timestamp in a subtle tooltip or inline text (e.g., "Reset by Bill Martin, Mar 2")

**File: `src/pages/admin/message-center/ThreadContextPanel.tsx`**
- Activity timeline already reads from `agreement_audit_log` -- will automatically show the new `changed_by_name` entries once populated

#### Phase E: Ensure toggle invalidation reaches ALL buyer screens

**File: `src/hooks/admin/use-firm-agreement-mutations.ts`**
- Add missing invalidation keys to `onSuccess` of `useUpdateAgreementStatus`:
  - `['buyer-firm-agreement-status']`
  - `['my-agreement-status']`  
  - `['buyer-nda-status']`
  - `['thread-buyer-firm']`
  - `['user-firm']`
  
  (Some of these are already covered by the realtime subscription, but direct invalidation ensures immediate UI feedback on the admin side)

### Technical Details

**DB Migration SQL** (update_firm_agreement_status + audit log):
- ALTER `agreement_audit_log` ADD COLUMN `changed_by_name` text
- Rewrite the RPC to:
  - Read current status before updating (for `old_status` in audit)
  - On any non-signed status: clear signed_at, signed_by, signed_by_name fields
  - Cascade `signed = false` to profiles when un-signing
  - Insert audit log row on every status change
  - Lookup admin name from profiles for `changed_by_name`

**Files to modify**:
| File | Change |
|------|--------|
| DB migration | Add `changed_by_name` to audit log, rewrite RPC |
| `src/pages/BuyerMessages/useMessagesData.ts` | Use `resolve_user_firm_id` RPC |
| `src/hooks/admin/use-firm-agreement-mutations.ts` | Add buyer query key invalidations |
| `src/pages/admin/DocumentTrackingPage.tsx` | Show last audit admin + timestamp when not signed |

### What This Fixes
- Admin toggles NDA/Fee to "Not Signed" -> buyer immediately sees "Not Signed"
- Every toggle change is audited with admin name + exact timestamp
- Buyer Messages page uses same canonical firm resolver as all other pages
- Document URLs visible in both signed and unsigned states
- Activity timeline in admin shows full audit trail with admin names
