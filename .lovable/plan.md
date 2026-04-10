

# Deep Audit: Connection Request Approval/Rejection Flow

## What is confirmed working

### 1. ConnectionRequestEmailDialog.tsx
- Wide modal (`sm:max-w-4xl`) with full email wrapper simulation (SourceCo logo, warm background, footer)
- First-person voice when a named admin sender is selected ("I will be in touch")
- Third-person voice for generic support@ sender
- "Access" not "introductions" in both approval and rejection copy
- Edit/reset email body functionality
- Admin comment (internal note) is forwarded via `onConfirm(comment, senderEmail, customBody)`
- Adam Haile is in the sender dropdown

### 2. connection-request-actions/index.tsx (side panel flow)
- Line 74: `comment` is correctly passed to `handleAccept` and `handleReject` (no underscore prefix)
- Email dialog properly wired

### 3. useConnectionRequestActions.ts (side panel flow)
- Line 123: Guard is `if (buyerEmail)` -- no `listingId` requirement
- Line 88: `adminComment` passed as `notes` to `updateStatus.mutateAsync`
- Sender info correctly resolved from `DEAL_OWNER_SENDERS`
- Uses `useUpdateConnectionRequestStatus` which does a direct `.update()` on `connection_requests`

### 4. WebflowLeadDetail.tsx
- Line 75-143: Comment forwarded to `updateStatus.mutate({ notes: comment })`, no `listingId` guard, sender info resolved and passed to both edge functions

### 5. notify-buyer-rejection edge function
- Line 22: "We limit access to a small number of buyers per deal" (correct)
- Custom body splits by double-newlines into proper `<p>` tags

### 6. send-connection-notification edge function
- `listingId` is optional in the interface
- First-person body for named senders ("I will be in touch")
- Custom body text uses paragraph-level formatting
- `listingUrl` falls back to marketplace when no listingId
- Reply-to set to sender email for named senders

### 7. admin-profiles.ts
- Adam Haile is in `DEAL_OWNER_SENDERS` (line 90)
- All senders have correct names and titles

## Remaining issues found

### Issue 1: AdminRequests.tsx uses a DIFFERENT mutation path (CRITICAL)

`AdminRequests.tsx` line 44 uses `useConnectionRequestsMutation()` from `use-connection-requests-mutation.ts`. This mutation uses `supabase.rpc('update_connection_request_status', ...)` -- an **RPC function**. This is a completely different code path from the side panel's `useUpdateConnectionRequestStatus` which does a direct `.update()`.

If the RPC `update_connection_request_status` doesn't exist, has wrong parameter names, or has RLS issues, this path silently fails. **This is the most likely reason the user's approval attempt failed** -- the RPC threw an error, the mutation's `onError` handler showed a destructive toast, and neither the status update nor email send happened.

The side panel flow (`useConnectionRequestActions`) uses `useUpdateConnectionRequestStatus` (direct `.update()`), which works. But the main Requests page uses the RPC-based mutation, which may be broken.

**Fix**: Either verify the RPC works, or switch `AdminRequests.tsx` to use `useUpdateConnectionRequestStatus` directly (the same hook the side panel uses), eliminating the inconsistency.

### Issue 2: AdminRequests.tsx sends approval email even when senderEmail is undefined

Line 258: `const finalSenderEmail = senderEmail || 'support@sourcecodeals.com'` -- this means the edge function always gets `senderEmail: 'support@sourcecodeals.com'` and `senderName: 'SourceCo'` when no sender is selected. But the `ConnectionRequestEmailDialog` always provides a sender, so this is a minor defensiveness issue, not a bug.

### Issue 3: No edge function logs exist for `send-connection-notification`

Zero logs found. This confirms that the approval edge function has **never been successfully invoked** since the last deploy. This aligns with the hypothesis that the status update (RPC) fails before the email send is reached.

### Issue 4: Duplicate status update logic across 3 entry points

There are now THREE separate status update mechanisms:
1. `useUpdateConnectionRequestStatus` (direct `.update()`) -- used by side panel + WebflowLeadDetail
2. `useConnectionRequestsMutation` (RPC `update_connection_request_status`) -- used by AdminRequests.tsx
3. Both paths handle errors differently and have different side effects

This duplication is the root cause of inconsistent behavior.

### Issue 5: WebflowLeadDetail uses `.mutate()` not `.mutateAsync()`

Line 83: `updateStatus.mutate(...)` is fire-and-forget. If it fails, the email still sends. The side panel uses `mutateAsync` with proper error handling. This means WebflowLeadDetail could send an approval email even if the status update fails.

### Issue 6: Minor copy inconsistency in approval in-app message

`useConnectionRequestActions.ts` line 108 still says "Your introduction to..." in the in-app message thread, while the email says "Your request for...". The user specifically said "We're not making an introduction" -- this in-app message should also say "Your request for..." or similar.

## Recommended implementation plan

### 1. Unify the status update path (HIGH PRIORITY)
- Make `AdminRequests.tsx` use `useUpdateConnectionRequestStatus` (the direct `.update()` hook) instead of the RPC-based `useConnectionRequestsMutation`
- This eliminates the RPC as a failure point and ensures all 3 entry points use the same proven code path

### 2. Fix WebflowLeadDetail to use `mutateAsync`
- Change `updateStatus.mutate(...)` to `await updateStatus.mutateAsync(...)` with proper error handling
- Only send email if status update succeeds

### 3. Fix in-app message copy
- Change "Your introduction to" to "Your request for" in `useConnectionRequestActions.ts` lines 108-109

### 4. Redeploy edge functions
- Both `send-connection-notification` and `notify-buyer-rejection` should be redeployed to ensure the live code matches source

## Files that need changes

| File | Change |
|------|--------|
| `src/pages/admin/AdminRequests.tsx` | Replace RPC mutation with direct update hook |
| `src/components/admin/WebflowLeadDetail.tsx` | Change `.mutate()` to `await .mutateAsync()` with error handling |
| `src/components/admin/connection-request-actions/useConnectionRequestActions.ts` | Fix "introduction" copy in in-app messages |
| Edge functions | Redeploy both |

