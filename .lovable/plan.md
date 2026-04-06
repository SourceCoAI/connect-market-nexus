

# Fix: Data Room Access + Premium Buyer Experience

## Three Issues Found

### Issue 1: Access toggles not auto-enabled despite signed Fee Agreement

**Root cause**: When the admin accepted this connection, the `handleAccept` code (line 149) evaluated `hasFeeAgreement` from local frontend state, which was `false` even though Sony's firm agreement is `signed`. The access record was created with `can_view_teaser: true, can_view_full_memo: false, can_view_data_room: false`.

The auto-upgrade trigger (`trg_auto_upgrade_data_room_on_fee_sign`) only fires on UPDATE to `firm_agreements`, but Sony's fee agreement was already signed before the connection was approved. So the trigger never ran for this record.

**Fix**: Change `handleAccept` to query `firm_agreements` directly from the database instead of relying on the frontend `hasFeeAgreement` prop, which is derived from the connection request card's local state and can be stale.

```typescript
// In handleAccept, before inserting data_room_access:
const { data: firmAgreement } = await supabase
  .from('firm_agreements')
  .select('fee_agreement_status')
  .eq('primary_company_name', user.company)  // or however firm is resolved
  .maybeSingle();

const feeAgreementSigned = firmAgreement?.fee_agreement_status === 'signed';
```

**Also**: Write a one-time migration to fix the existing access record for this buyer:
```sql
UPDATE data_room_access
SET can_view_full_memo = true, can_view_data_room = true
WHERE deal_id = 'd543b05b-2649-4327-a1dd-2a2589e73427'
  AND marketplace_user_id = '06b29c2a-3220-466c-b161-b92082808f39';
```

### Issue 2: Admin can't toggle Full Memo / Data Room when fee agreement IS signed

In the screenshot, the toggles show lock icons and are disabled because `hasFeeAgreement` is false in the connection request card. Same root cause as Issue 1: the prop is stale. The `AccessMatrixSection` needs the same server-side fee agreement check so the admin can always toggle access when the firm has signed.

**Fix**: The `hasFeeAgreement` boolean passed to `AccessMatrixSection` should be derived from `firm_agreements` table, not just the connection request's local state. Update the data-fetching in the parent component that renders this section to query firm agreement status.

### Issue 3: Premium Data Room Redesign

The current `BuyerDataRoom` uses standard Card/CardHeader components with purple gradients and badges. It needs a premium, minimal design matching the platform's "Quiet Luxury" aesthetic.

**Design direction**:
- Remove the purple `DataRoomOrientation` card entirely (it adds noise, not value)
- Clean section header: just "Data Room" with a subtle lock icon, no cards
- Documents listed as clean rows with generous whitespace: file icon, name, size/date in muted text, and ghost View/Download buttons on the right
- Folder grouping via subtle uppercase labels with hairline dividers, not card borders
- No badges, no colored backgrounds, no gradients
- Empty state: minimal centered text, no oversized icons

## Files to Change

| File | Change |
|------|--------|
| `src/components/admin/connection-request-actions/useConnectionRequestActions.ts` | Query `firm_agreements` directly in `handleAccept` instead of relying on `hasFeeAgreement` prop |
| `src/components/admin/connection-request-actions/ConnectionRequestDetail.tsx` (or parent) | Fetch firm agreement status from DB for `AccessMatrixSection` props |
| `src/components/marketplace/BuyerDataRoom.tsx` | Redesign to premium minimal layout |
| `src/components/marketplace/DataRoomOrientation.tsx` | Remove or replace with subtle inline text |
| Migration SQL | Fix existing access record for the restoration buyer |

## Implementation Order

1. Migration: fix existing access record (immediate unblock)
2. Fix `handleAccept` to query firm agreements from DB (prevent recurrence)
3. Fix `AccessMatrixSection` hasFeeAgreement resolution (admin can toggle)
4. Redesign `BuyerDataRoom` to premium layout

