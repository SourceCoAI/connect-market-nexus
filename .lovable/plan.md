

# Deep Dive: Remaining Issues & Dependencies

## Issues Found

### 1. `ProfileDocuments.tsx` bypasses the canonical resolver (CRITICAL)
**Lines 40-54**: The buyer's "My Documents" page resolves the firm by directly querying `connection_requests.firm_id` — the exact old circular pattern we just fixed in the database resolver. This means buyers could still see wrong firm agreements.

**Fix**: Replace the manual resolution with `supabase.rpc('resolve_user_firm_id', { p_user_id: user.id })` or `get_user_firm_agreement_status`.

### 2. `company` field is freely editable by users (DATA INTEGRITY RISK)
`ProfileForm.tsx` line 101-106: The company name input is a plain editable text field. If a user changes their company name after signup, the `resolve_user_firm_id()` function (Priority 2: normalized company name match) could resolve to a completely different firm, or fail to match their existing firm at all. The `PRIVILEGED_FIELDS` blocklist in `use-nuclear-auth.ts` only blocks `is_admin`, `approval_status`, `email_verified`, `role`, `id`, `email` — it does NOT block `company`.

**Fix**: Add `company` to the `PRIVILEGED_FIELDS` blocklist so users cannot change it. Make the field `disabled` in the ProfileForm UI with a note "Contact support to update."

### 3. No trigger syncs profile company changes to firm_agreements
Even if we lock the UI, there's no DB-level trigger that prevents a direct API update to `profiles.company`. And if it did change, nothing would update the corresponding `firm_agreements.normalized_company_name` or reassign `firm_members`.

**Fix**: Add `company` to the profile RLS policy or a validation trigger that blocks changes, OR add a trigger that re-runs firm resolution when `profiles.company` changes.

### 4. `auto-create-firm-on-approval` still uses stale `cr.firm_id` (line 91)
The edge function starts with `let firmId = cr.firm_id` — if the connection_request already has a (wrong) firm_id from the old circular resolver, it skips firm creation entirely and uses the wrong one. The migration fixed the resolver but existing connection_requests may still have bad `firm_id` values that weren't cleaned up (only teltonika.lt members were fixed).

**Fix**: In the edge function, always re-resolve via the new logic (email domain → company name → create new) instead of trusting `cr.firm_id`.

### 5. `useUserFirm` comment says "active connection_request → latest firm_member" (STALE COMMENT)
The hook calls `get_user_firm_agreement_status` which now delegates to `resolve_user_firm_id()` (fixed). But the JSDoc comment on line 12-15 still describes the old circular logic. Should be updated.

### 6. `buyer_type` field is editable — could change required agreement routing
The `buyer_type` affects what document requirements apply (PE firms need fee agreements, individuals may not). Users can freely change this in their profile, which could affect agreement coverage resolution.

**Fix**: Add `buyer_type` to `PRIVILEGED_FIELDS` or make it non-editable after approval.

### 7. Admin Document Tracking page doesn't show which admin changed statuses
The `FirmExpandableRow` shows audit log entries but the `AuditLogSection` component only displays `changed_by_name`. Need to verify the `update_firm_agreement_status` RPC actually records `changed_by_name` properly when admins make changes.

### 8. `MessageCenter.tsx` still manually resolves firm from `connection_requests.firm_id`
Line 108-110: Admin message center checks `firm_id` from connection_requests to associate users with firms, bypassing the canonical resolver.

## Summary of All Fixes Needed

| # | File | Issue | Fix |
|---|------|-------|-----|
| 1 | `src/pages/Profile/ProfileDocuments.tsx` | Bypasses resolver, uses old `connection_requests.firm_id` | Use `resolve_user_firm_id` RPC |
| 2 | `src/pages/Profile/ProfileForm.tsx` | `company` field editable | Make disabled + "Contact support" note |
| 3 | `src/hooks/use-nuclear-auth.ts` | `company` not in PRIVILEGED_FIELDS | Add `company` and `buyer_type` to blocklist |
| 4 | `supabase/functions/auto-create-firm-on-approval/index.ts` | Trusts stale `cr.firm_id` | Always re-resolve firm using email domain / company name logic |
| 5 | `src/hooks/admin/use-user-firm.ts` | Stale JSDoc comment | Update comment to reflect new resolver |
| 6 | `src/pages/admin/MessageCenter.tsx` | Manual firm resolution from CR | Use `resolve_user_firm_id` RPC |
| 7 | SQL migration | No DB-level protection on `profiles.company` changes | Add validation trigger blocking company changes after approval |

## Implementation Order

**Round 1** (this round — all frontend + edge function fixes):
1. Lock `company` and `buyer_type` fields: add to `PRIVILEGED_FIELDS`, disable in ProfileForm UI
2. Fix `ProfileDocuments.tsx` to use `resolve_user_firm_id` RPC
3. Fix `auto-create-firm-on-approval` to not trust stale `cr.firm_id`
4. Fix `MessageCenter.tsx` firm resolution
5. Update stale comments

**Round 2** (SQL migration):
6. Add DB trigger on `profiles` that blocks `company` updates for approved users (belt-and-suspenders)

