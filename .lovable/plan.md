

# Audit: Implementation Status and Remaining Gaps

## What's DONE and Working

| Item | Status |
|------|--------|
| `check_data_room_access` RPC with dual-ID | DONE — verified in database |
| RLS policy on `data_room_documents` with dual-ID | DONE — verified in database |
| Fee agreement auto-upgrade trigger | DONE — `trg_auto_upgrade_data_room_on_fee_sign` exists |
| Backfill of 122 access records | DONE |
| Editor Documents Section | DONE |
| BuyerDataRoom empty state ("access being set up") | DONE |
| Auto-provision access on connection accept | DONE |

## What's BROKEN or MISSING

### BUG 1 (CRITICAL): Category Name Mismatch — Teaser Documents Invisible

`BuyerDataRoom.tsx` line 69:
```
if (access?.can_view_teaser) allowedCategories.add('teaser');
```

But the actual document category in the database is `anonymous_teaser`, not `teaser`. Every teaser document will be filtered out by the client-side category check on line 118 (`allowedCategories.has(doc.document_category)`).

A buyer with teaser access will see **zero teaser documents** even though they exist and RLS allows them through.

**Fix**: Change `'teaser'` to `'anonymous_teaser'` on line 69.

### BUG 2 (HIGH): BuyerDataRoom Access Query Doesn't Use Dual-ID

The access check query (lines 50-65) only looks for `deal_id = dealId` (the listing ID). If for any reason the `data_room_access` record was created against the source deal ID instead of the listing ID, the buyer would see nothing. The RPC and RLS have dual-ID awareness, but this client-side query does not.

This is currently not causing issues because the auto-provisioning code creates access against the listing ID. But it's a fragility — if an admin manually adds access via the data room panel on the source deal, the buyer won't see it.

**Fix**: After the primary query returns null, also check via the listing's `source_deal_id` (same pattern as the document fallback).

### BUG 3 (HIGH): Fee Agreement Trigger Uses Company Name Matching

The trigger `auto_upgrade_access_on_fee_agreement` matches users via:
```sql
WHERE p.company = NEW.primary_company_name
```

This is fragile. If `profiles.company` doesn't exactly match `firm_agreements.primary_company_name` (different casing, extra whitespace, abbreviations), the upgrade silently fails. There's no error — it just updates zero rows.

Checked the data: for the 5 signed agreements, each has 1-5 matching profiles. So it works for current data. But this is a ticking time bomb for new firms with any naming inconsistency.

**Better approach**: Match via `marketplace_buyers.firm_id` → `firm_agreements.id`, or via the user's email domain matching the firm. However, this would require understanding the firm_agreements ↔ profiles linkage better. For now, the company name match works but should be documented as a known fragility.

### GAP 4 (MEDIUM): No Backfill for the Restoration Listing

The restoration listing (`d543b05b`) has:
- 0 `data_room_access` records
- 1 pending connection request (never accepted)
- 2 documents on source deal, 0 on listing itself

The backfill only inserted records for previously approved connections. Since this listing's connection is still `pending`, no access exists. This is correct behavior — but once the admin accepts it, the auto-provisioning should kick in. Just needs testing.

### GAP 5 (MEDIUM): No Document Upload in Listing Editor

The `EditorDocumentsSection` is read-only. It shows documents from both listing and source deal with badges, but admins cannot upload documents from the editor. They must go to the separate Data Room tab for the source deal.

This was noted as a recommendation, not a requirement, in the original plan. But it means admins have no way to add documents directly to a listing — only to the source deal. If the listing has no source deal (created directly as a marketplace listing), there's no upload path at all from the editor.

### GAP 6 (LOW): Audit Trail Still Logs Source Deal ID

The `data-room-download` edge function logs `doc.deal_id` (the source deal ID) in the audit trail. An admin looking at analytics for the listing won't see these events. The listing ID context is lost.

## Additional Considerations Beyond the Original Plan

### 1. Publish Gate: Document Warning

When `publish-listing` runs, it checks for memo PDFs using `source_deal_id` fallback. But it doesn't warn if there are zero `data_room` category documents. For a production marketplace, having only a teaser and memo (no financials, tax returns, etc.) might be insufficient. Consider adding a non-blocking warning.

### 2. Connection Request Flow on This Specific Listing

The pending connection request for the restoration listing needs to be accepted to test the full flow. Once accepted:
1. `data_room_access` should be auto-created (with `can_view_full_memo` and `can_view_data_room` based on fee agreement status)
2. The RLS policy should allow the source deal documents through
3. BuyerDataRoom should display the 2 documents (teaser + memo)
4. Clicking "View" should call `data-room-download`, which should pass the dual-ID RPC check

### 3. What Happens If Documents Are Added After Publishing?

If an admin uploads new documents to the source deal after the listing is live, those documents are immediately visible to buyers (since the dual-ID RLS policy checks in real-time). This is the correct behavior for Option B (dual-ID awareness). No action needed.

## Implementation Plan (Fixes Only)

### Fix 1: `src/components/marketplace/BuyerDataRoom.tsx`
- Line 69: Change `'teaser'` to `'anonymous_teaser'`

### Fix 2: `src/components/marketplace/BuyerDataRoom.tsx`
- Lines 50-65: Add fallback to check `source_deal_id` for access records if primary query returns null

### Fix 3 (Optional): Document the company name matching fragility
- Add a comment to the migration noting the limitation
- Consider a future migration to use a more robust firm ↔ user linkage

No database changes, no edge function changes. Two small frontend fixes.

