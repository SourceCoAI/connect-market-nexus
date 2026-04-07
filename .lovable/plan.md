

# Data Room Access: Findings and Proposed Fixes

## Current State (What Already Works)

| Feature | Status |
|---------|--------|
| On approval, `data_room_access` row is auto-created with `can_view_teaser: true` | Working |
| Fee agreement status determines `can_view_full_memo` and `can_view_data_room` | Working |
| Admin toggles in connection request dropdown (Teaser / Full Memo / Data Room) | Working |
| `trg_auto_upgrade_data_room_on_fee_sign` auto-upgrades access when fee agreement is signed | Working |
| Buyer vault UI filters documents by `document_category` vs access toggles | Working |
| Edge function `data-room-download` checks access before serving signed URLs | Working |

## Issues Found

### 1. Published memos are NOT filtered by access level (Security Bug)

`BuyerDataRoom.tsx` line 146-160 fetches ALL published memos for the deal regardless of `memo_type`. A buyer with only teaser access (`can_view_teaser: true`) can see `full_memo` type memos in the vault. The query needs a filter:
- If `can_view_teaser` only: show memos where `memo_type = 'anonymous_teaser'`
- If `can_view_full_memo`: show both types

### 2. Sidebar "Explore data room" is gated on Fee Agreement (Too Restrictive)

`ListingSidebarActions.tsx` line 68: `const canExploreDataRoom = feeCovered && connectionApproved;`

This means a buyer whose connection is approved but hasn't signed the fee agreement can't open the data room at all — even though they have teaser access (`can_view_teaser: true`). The gate should be `connectionApproved` only. The access toggles already control what they see inside.

### 3. Messaging over-promises "full data room"

Multiple places tell buyers they'll get the CIM, real company name, and full financials:

| Location | Current Copy | Problem |
|----------|-------------|---------|
| `BlurredFinancialTeaser.tsx` | "Request access to view the CIM, real company name, and full financials." | Most buyers will only get the anonymous teaser initially |
| `ListingSidebarActions.tsx` tooltip | "Sign your Fee Agreement to unlock the data room." | Implies fee agreement = full access, but admin still controls toggles |
| Approval message (`useConnectionRequestActions.ts` line 92) | "You now have access to the deal overview and supporting documents in the data room." | Over-promises — they may only have the teaser |
| `ConnectionButton.tsx` line 190 | "Sign your documents to unlock the data room and request introductions." | Same issue |

### 4. Vault empty state messaging is vague

When a buyer has teaser-only access and there are no teaser documents uploaded yet, they see "Your data room is being prepared. Documents will appear here once released by the advisor." This is fine but could be more specific about what they have access to.

## Proposed Changes

### File 1: `src/components/marketplace/BuyerDataRoom.tsx`

**Filter memos by access level.** Before rendering memos, filter:
```
const visibleMemos = memos.filter(m => {
  if (m.memo_type === 'anonymous_teaser') return access?.can_view_teaser;
  if (m.memo_type === 'full_memo') return access?.can_view_full_memo;
  return false;
});
```

### File 2: `src/components/listing-detail/ListingSidebarActions.tsx`

**Change data room gate** from `feeCovered && connectionApproved` to just `connectionApproved`.

**Update tooltip** — remove fee agreement language when connection is approved. If connection is approved but fee not signed, no tooltip (they can open the vault; they'll see teaser-only content inside).

### File 3: `src/components/listing-detail/BlurredFinancialTeaser.tsx`

**Tone down the promise.** Change copy from:
> "Request access to view the CIM, real company name, and full financials."

To:
> "Request access to receive deal materials from the advisor."

This is accurate for all cases — teaser-only or full access.

### File 4: `src/components/admin/connection-request-actions/useConnectionRequestActions.ts`

**Tone down approval message.** Change from:
> "You now have access to the deal overview and supporting documents in the data room."

To:
> "Your introduction to [listing] has been approved. Deal materials have been made available in your data room. Our team will facilitate the introduction to the business owner — expect to hear from us within one business day."

This is accurate whether they get a teaser or full access.

### File 5: `src/components/listing-detail/ConnectionButton.tsx`

**Change copy** from "unlock the data room" to "unlock deal materials" — more accurate when most buyers get teasers only.

## What Does NOT Change

- Admin access toggles (already work correctly)
- Auto-provisioning on approval (already sets teaser=true, full/data_room based on fee agreement)
- Auto-upgrade trigger on fee agreement signing (already works)
- Edge function download access checks (already works)
- MFA gate on vault (already works)

## Implementation Order

1. Fix memo filtering in BuyerDataRoom (security fix)
2. Fix sidebar gate (teaser-only buyers can open vault)
3. Update all buyer-facing copy (5 strings across 4 files)

