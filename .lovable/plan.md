

## Fix: Add "Remove Not a Fit" toggle for deals already marked

### Problem
Across multiple deal tables (Referral Partner Detail, GP Partners, SourceCo, CapTarget), the action menu always shows "Mark as Not a Fit" even when a deal is already marked. There is no way to undo the status.

### Fix
In each table's action menu, check `deal.remarketing_status === 'not_a_fit'` (or `listing.not_a_fit`). If already marked:
- Show **"Remove Not a Fit"** with a green undo icon instead
- On click, set `remarketing_status` back to `null` (or `not_a_fit = false`)

### Files to change

1. **`src/pages/admin/remarketing/ReMarketingReferralPartnerDetail/DealsTable.tsx`** (lines 428-444)
   - Check `deal.remarketing_status === 'not_a_fit'`
   - If true: show "Remove Not a Fit", update to `remarketing_status: null`
   - If false: keep current "Mark as Not a Fit" behavior

2. **`src/pages/admin/remarketing/GPPartnerDeals/GPPartnerTable.tsx`** (lines 509-516)
   - Replace "Already Not a Fit" (disabled text) with clickable "Remove Not a Fit" that clears the status

3. **`src/pages/admin/remarketing/SourceCoDeals/SourceCoTable.tsx`** (lines ~509-512)
   - Same pattern as GP Partners

4. **`src/pages/admin/remarketing/components/CapTargetTableRow.tsx`** (lines ~414-417)
   - Same pattern

5. **`src/pages/admin/remarketing/components/DealTableRow.tsx`** (lines ~602-605)
   - Same pattern — toggle between set/clear `not_a_fit`

Each change is small: swap the label, icon, and update payload based on current status.

