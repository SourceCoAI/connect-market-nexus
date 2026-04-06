

# Investigation: Data Room Access on Pending Connection

## Current State

The restoration listing (`d543b05b`) has:
- **Connection request status: `pending`** — the admin has never accepted it
- **0 `data_room_access` records** — these are only created when the admin clicks "Accept"
- **2 documents on the source deal** (`d136656a`): Anonymous Teaser PDF + Lead Memo PDF
- **0 documents on the listing itself**
- **Fee Agreement: Signed**, NDA: Signed (both shown green in sidebar)

## Why You Can't Access the Data Room

The "Explore data room" button is visible in the sidebar but it does nothing useful because `connectionApproved` is `false` (the connection is `pending`, not `approved`). The `BuyerDataRoom` component at the bottom of the page checks `connectionApproved` — since it's false and no `data_room_access` record exists, it renders nothing.

**This is working as designed.** The flow is:

```text
1. Buyer requests connection  →  status = "pending"
2. Admin accepts connection   →  status = "approved"
                              →  data_room_access row auto-created
                              →  BuyerDataRoom becomes visible
                              →  Documents from source deal visible via dual-ID
```

You are stuck at step 1. The admin needs to accept the connection request.

## What Should Happen — The Intended Flow

1. **Buyer visits listing, has signed Fee Agreement + NDA** → sidebar shows documents as "Signed", connection button enabled
2. **Buyer clicks "Request Access"** → connection_request created with status `pending`
3. **Admin sees request in queue, clicks "Accept"** → status changes to `approved`, `data_room_access` record auto-created with full permissions (since fee agreement is signed)
4. **Buyer returns to listing** → "Explore data room" scrolls to the data room section, which now shows the Anonymous Teaser and Lead Memo PDFs from the source deal

## Action Required

**Go to the admin connection requests queue and accept the pending connection request for this listing.** That will trigger the auto-provisioning of `data_room_access` and unlock the data room.

## Potential UX Improvements (Optional)

There are no bugs here — the system is gated correctly. However, two UX improvements could be considered:

1. **Clearer "Explore data room" state when pending**: Currently the button appears clickable but has a tooltip saying "Request a connection to access the data room." Since the user already HAS a pending request, the tooltip is misleading. It should say "Your connection request is pending approval" instead.

2. **Sidebar should differentiate "no connection" vs "pending connection"**: The data room tooltip doesn't distinguish between "you haven't requested access yet" and "you've requested but it hasn't been approved." The messaging should reflect the actual state.

## Implementation (2 small changes)

### File: `src/components/listing-detail/ListingSidebarActions.tsx`

Update `getDataRoomTooltip()` (line 174-178) to check whether a connection request exists but is pending:

```typescript
const getDataRoomTooltip = () => {
  if (!feeCovered) return 'Sign your Fee Agreement to unlock the data room.';
  if (!connectionApproved) return 'Your connection request is pending admin approval.';
  return '';
};
```

This requires passing `connectionExists` as a prop (or a `connectionPending` boolean) to distinguish "no request" from "pending request". If no connection exists at all, the tooltip should say "Request a connection to access the data room." If pending, it should say "Your connection request is pending approval."

### File: `src/components/listing-detail/ListingSidebarActions.tsx`

Disable the "Explore data room" button visually when connection is not approved (it already doesn't scroll to anything useful, but it looks clickable in the screenshot).

