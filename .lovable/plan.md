

# Audit: What Was and Wasn't Implemented from the Strategic Plan

## CRITICAL 1: `check_data_room_access` RPC — NOT FIXED

The RPC still only checks `WHERE deal_id = p_deal_id`. It has **zero awareness** of `source_deal_id`. The comment in `data-room-download/index.ts` line 87 says "the RPC now handles dual-ID (source_deal_id) awareness" — but **this is a lie**. The actual SQL does a simple `deal_id = p_deal_id` match only.

**Result**: Buyer clicks "View" on a source deal document -> RPC checks access for source_deal_id -> no match -> **403 Access Denied**.

**Fix needed**: Update the RPC to also check `SELECT id FROM listings WHERE source_deal_id = p_deal_id` and look for access records on those listing IDs.

## CRITICAL 2: RLS Policy on `data_room_documents` — NOT FIXED

The RLS policy `Buyers can view granted documents` still joins `a.deal_id = data_room_documents.deal_id` with no source_deal_id awareness.

**Result**: The fallback query in `BuyerDataRoom.tsx` (lines 103-109) that fetches source deal documents will be **blocked by RLS** and return empty results. The client-side fallback code exists but is dead code because RLS won't let it through.

**Fix needed**: Update the RLS policy to include `OR EXISTS (SELECT 1 FROM listings l WHERE l.source_deal_id = data_room_documents.deal_id AND l.id = a.deal_id)`.

## CRITICAL 3: Backfill — DONE

122 `data_room_access` records were inserted via migration. Confirmed in database.

## HIGH 1: Editor Documents Section — DONE

`EditorDocumentsSection.tsx` exists, shows documents from both listing ID and source_deal_id with category badges. Read-only (no upload capability added, but that was a recommendation, not a requirement).

## HIGH 2: BuyerDataRoom Empty State — DONE

Lines 144-161 show a "Your access is being set up" message when `connectionApproved` is true but no access record exists.

## HIGH 3: Fee Agreement Auto-Upgrade Trigger — NOT IMPLEMENTED

No trigger named anything like `auto_upgrade_data_room_on_fee_agreement` exists. The migration file only contains the backfill INSERT. The trigger was supposed to automatically upgrade `can_view_full_memo` and `can_view_data_room` to `true` when `firm_agreements.fee_agreement_status` changes to `signed`.

**Result**: A buyer who gets approved BEFORE signing the fee agreement is stuck with teaser-only access forever — their toggles never upgrade.

**Fix needed**: Create a trigger on `firm_agreements` that, on UPDATE of `fee_agreement_status` to `signed`, runs an UPDATE on `data_room_access` for all marketplace users belonging to that firm.

## LOW 1: Audit Trail Gap — NOT ADDRESSED (acceptable as low priority)
## LOW 2: Access Expiry — NOT ADDRESSED (business decision, acceptable)

---

## Summary of Gaps to Fix

| Item | Status | Severity |
|------|--------|----------|
| `check_data_room_access` RPC dual-ID | NOT DONE | CRITICAL |
| RLS policy dual-ID awareness | NOT DONE | CRITICAL |
| `data-room-download` edge function | Comment says fixed, but relies on broken RPC | CRITICAL |
| Backfill existing connections | DONE | -- |
| Editor documents section | DONE | -- |
| BuyerDataRoom empty state | DONE | -- |
| Fee agreement upgrade trigger | NOT DONE | HIGH |

## Implementation Plan

### Migration SQL (single migration)

1. **Replace `check_data_room_access` RPC** to add a second EXISTS check: if `p_deal_id` is a source deal, look up listings referencing it and check access on those listing IDs.

2. **Drop and recreate the `Buyers can view granted documents` RLS policy** on `data_room_documents` to add the same source_deal_id join logic.

3. **Create trigger function `auto_upgrade_access_on_fee_agreement()`** on `firm_agreements` — when `fee_agreement_status` is updated to `signed`, UPDATE all `data_room_access` rows for users in that firm to set `can_view_full_memo = true, can_view_data_room = true`.

4. **Create trigger** `trg_auto_upgrade_data_room_on_fee_sign` AFTER UPDATE on `firm_agreements`.

### Edge Function

No changes needed to `data-room-download/index.ts` — it already calls the RPC correctly, the RPC just needs to be fixed.

### No Frontend Changes

All frontend code (BuyerDataRoom fallback, editor section, empty state) is already correctly implemented. The fixes are purely database-level.

