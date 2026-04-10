

# Fix: Email Preview Dialog Not Showing on Accept/Decline

## Root Cause

There are **two separate action paths** for approving/rejecting connection requests:

1. **Table-level buttons** (`AdminRequests.tsx`) — correctly wired to open `ConnectionRequestEmailDialog`
2. **Expanded row detail buttons** (`ConnectionRequestActions` → `ApprovalSection`) — calls `handleAccept`/`handleReject` in `useConnectionRequestActions.ts` which **directly updates status and sends emails with no preview dialog**

You clicked Accept from the expanded row detail (path #2), so no modal appeared. The email was sent immediately.

## Plan

### 1. Add email preview dialog to `ConnectionRequestActions`

In `src/components/admin/connection-request-actions/index.tsx`:
- Add state for `showEmailDialog` and `emailActionType` (approve/reject)
- Render `ConnectionRequestEmailDialog` in this component
- On confirm, call the existing `actions.handleAccept` or `actions.handleReject` logic

### 2. Update `ApprovalSection` to open dialog instead of acting directly

In `ApprovalSection.tsx`:
- Change `handleAccept` and `handleReject` props to open the email preview dialog instead of executing immediately
- The dialog's confirm callback will then trigger the actual action

### 3. Update `useConnectionRequestActions.ts`

- Export a version of accept/reject that accepts an optional admin comment from the dialog
- Or: keep `handleAccept`/`handleReject` as-is and just gate them behind the dialog in the parent

### 4. Also wire into `WebflowLeadDetail.tsx`

This component also has its own `handleAccept`/`handleReject` that bypass the dialog — same fix needed.

## Files Changed

| File | Change |
|------|--------|
| `src/components/admin/connection-request-actions/index.tsx` | Add `ConnectionRequestEmailDialog`, gate accept/reject behind it |
| `src/components/admin/connection-request-actions/ApprovalSection.tsx` | No change needed (handlers are already passed as props) |
| `src/components/admin/WebflowLeadDetail.tsx` | Add same email preview dialog gating |

