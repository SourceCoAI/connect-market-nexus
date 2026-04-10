

# Investigation Results + Remaining Fix

## What's Working

1. **Auto-select logged-in admin as sender** -- `ConnectionRequestEmailDialog` uses `useAuth()` to match the admin's email against `DEAL_OWNER_SENDERS` and defaults to their address. Working.

2. **Editable email body** -- The dialog has Edit/Reset buttons, a `Textarea` for editing, and passes `customBody` through `onConfirm`. Working.

3. **Sender dropdown** -- `DEAL_OWNER_SENDERS` list with support@, Bill, Alia, Brandon. Working.

4. **Expanded row actions** (ConnectionRequestActions) -- Opens the email dialog, passes `senderEmail` and `customBody` to `useConnectionRequestActions.handleAccept`/`handleReject`, which forward them to the edge functions. Working.

5. **WebflowLeadDetail** -- Opens the email dialog, sends emails with sender + customBody overrides. Working.

6. **Edge functions** -- Both `send-connection-notification` and `notify-buyer-rejection` accept and use `senderEmail`, `senderName`, `replyTo`, `customBodyText`. Working.

## What's Broken: AdminRequests.tsx Table-Level Actions

The `confirmAction` function in `AdminRequests.tsx` (line 245) is the handler for the `ConnectionRequestEmailDialog` rendered at the page level (line 376-383). It:

- **Ignores `senderEmail`** -- the parameter is received as `_senderEmail` (prefixed with underscore = intentionally unused)
- **Ignores `customBody`** -- the function signature doesn't even accept it: `async (comment: string, _senderEmail?: string)`
- **Uses legacy email functions** -- calls `sendConnectionApprovalEmail(selectedRequest)` and `sendConnectionRejectionEmail(selectedRequest)` which are old utility functions from `useAdmin()` that don't support sender overrides or custom body

This means: when an admin clicks Approve/Reject from the **table-level buttons** (not the expanded row), the email dialog opens correctly with sender selection and editable body, but the selected sender and any edits are **silently discarded**. The email is sent from the default address with the default body.

The same issue propagates to `MobileConnectionRequests` since it delegates `onApprove`/`onReject` back to `AdminRequests.tsx`.

## Plan

### Fix `AdminRequests.tsx` `confirmAction`

Update the function to:
1. Accept `customBody` as a third parameter: `async (comment: string, senderEmail: string, customBody?: string)`
2. Pass `senderEmail` and `customBody` to the edge function invocations
3. Replace the legacy `sendConnectionApprovalEmail`/`sendConnectionRejectionEmail` calls with direct `supabase.functions.invoke()` calls that include the sender and custom body overrides (same pattern used in `useConnectionRequestActions.ts`)

### Files Changed

| File | Change |
|------|--------|
| `src/pages/admin/AdminRequests.tsx` | Fix `confirmAction` to forward `senderEmail` and `customBody` to edge functions instead of using legacy email helpers |

One file, one function fix. Everything else is already wired correctly.

