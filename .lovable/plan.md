

# Show User Approval Status on Connection Requests

## Problem

When a connection request is linked to an existing marketplace profile, there's no indication whether that user is approved, pending, or rejected. Screenshots show "Matched to Marketplace Profile" but no approval status — admins need this at a glance.

## Changes

### 1. Collapsed row header (ConnectionRequestRow.tsx, ~line 542-544)

After the existing `BuyerTierBadge`, add an approval status badge when `request.user` exists:

- **Approved**: small emerald dot/badge — subtle since this is the expected state
- **Pending**: amber badge "Pending" — stands out as a warning
- **Rejected**: red badge "Rejected" — clear alert

### 2. WebflowLeadDetail "Matched to Marketplace Profile" card (~line 228-239)

Add an approval status badge inline with the user info row. Same color coding:
- Approved: emerald "Approved" badge
- Pending: amber "Pending Approval" badge  
- Rejected: red "Rejected" badge

### 3. Expanded marketplace view (ConnectionRequestRow.tsx)

For standard marketplace requests in the expanded detail, add the same approval indicator near where the user profile info is displayed.

## Files

| File | Change |
|------|--------|
| `src/components/admin/ConnectionRequestRow.tsx` | Add approval status badge in collapsed header (~line 542) and expanded detail |
| `src/components/admin/WebflowLeadDetail.tsx` | Add approval status badge inside "Matched to Marketplace Profile" card (~line 228) |

