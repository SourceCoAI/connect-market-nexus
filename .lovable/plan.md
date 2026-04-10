

# Deep Dive: Current State of Admin Email Preview + Sender Selection

## What's Fully Working

### 1. ConnectionRequestEmailDialog (the modal itself)
- Auto-selects logged-in admin's email as default sender via `useAuth()` + `DEAL_OWNER_SENDERS` matching
- Sender dropdown with support@, Bill, Alia, Brandon
- Exact email body preview (approval and rejection templates match edge functions)
- Edit button switches to `<Textarea>`, Reset button restores default
- `onConfirm(comment, senderEmail, customBody?)` signature passes all three values

### 2. Expanded Row Actions (ConnectionRequestActions/index.tsx)
- Accept/Reject buttons open the email dialog
- `handleEmailDialogConfirm` forwards `senderEmail` and `customBody` to `useConnectionRequestActions.handleAccept`/`handleReject`
- Those handlers invoke `send-connection-notification` and `notify-buyer-rejection` with sender overrides and custom body -- **fully working**

### 3. WebflowLeadDetail
- Opens email dialog on Accept/Decline
- `handleEmailDialogConfirm` sends emails via edge functions with `senderEmail`, `senderName`, `replyTo`, and `customBodyText` -- **fully working**

### 4. AdminRequests.tsx Table-Level Actions (Desktop)
- `confirmAction(comment, senderEmail, customBody)` correctly invokes edge functions directly with all overrides -- **fully working** (fixed in previous iteration)

### 5. Edge Functions
- Both `send-connection-notification` and `notify-buyer-rejection` accept and use `senderEmail`, `senderName`, `replyTo`, `customBodyText` -- **fully working**

### 6. Admin Profiles
- `DEAL_OWNER_SENDERS` contains support@, Bill, Alia, Brandon -- **correct**

---

## What's Broken: MobileConnectionRequests

`MobileConnectionRequests.tsx` (lines 105-123) renders its **own** `ConnectionRequestEmailDialog` but the `onConfirm` handler **discards all three parameters**:

```typescript
onConfirm={async (_comment, _senderEmail, _customBody) => {
  // All parameters ignored!
  await onApprove(selectedRequest);  // Just calls parent handler
}}
```

The `onApprove`/`onReject` callbacks point back to `AdminRequests.handleAction`, which opens the **AdminRequests-level** dialog. So on mobile:
1. User taps Approve → `MobileConnectionRequests` opens its own dialog
2. Admin selects sender, edits email, clicks confirm
3. The sender and custom body are **silently discarded**
4. `onApprove(selectedRequest)` is called, which triggers `handleAction` on `AdminRequests`, which would open a **second dialog**

This is a double-dialog bug AND a data-loss bug.

### Fix

Remove the redundant `ConnectionRequestEmailDialog` from `MobileConnectionRequests`. Instead, have the mobile approve/reject buttons directly call the parent's `onApprove`/`onReject` (which already open the AdminRequests-level dialog that works correctly).

## Plan

### 1. Fix `MobileConnectionRequests.tsx`

Remove the local `ConnectionRequestEmailDialog`, `selectedRequest`, `actionType`, `isDialogOpen` state, and the `handleAction` wrapper. Change `onApprove` and `onReject` button callbacks to call the parent props directly (they already open the AdminRequests-level dialog with full sender/customBody support).

### Files Changed

| File | Change |
|------|--------|
| `src/components/admin/MobileConnectionRequests.tsx` | Remove redundant email dialog; pass approve/reject directly to parent |

Everything else is complete and working. One file, one fix.

