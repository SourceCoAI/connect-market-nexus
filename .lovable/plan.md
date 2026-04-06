

# Differentiate Unapproved Users in Document Tracking Pending Queue

## Problem

When a user requests documents from the Pending Approval screen (before being approved), the request appears in the admin Document Tracking "Pending Requests" queue identically to requests from approved users. Admins have no way to tell whether the requester is still pending approval or already approved.

## Solution

Add a small "Pending Approval" badge next to the user's name in the Pending Request queue rows when the requesting user's `approval_status` is not `approved`.

## Changes

### File: `src/pages/admin/DocumentTrackingPage.tsx`

1. **Extend `usePendingRequestQueue` query**: After fetching pending requests, do a secondary lookup on `profiles` for all unique `user_id` values to get their `approval_status`. Return this as a map alongside the requests.

2. **Extend `PendingRequest` interface or pass approval map**: Add an `approval_status` field resolved from the profiles lookup.

3. **Update `PendingRequestRow` component**: When `approval_status !== 'approved'`, render a small orange/amber badge: `⏳ Pending Approval` next to the user's name. This gives admins immediate context — the user hasn't been approved yet, so documents shouldn't necessarily be sent until approval happens.

### Implementation Detail

In `usePendingRequestQueue`, after fetching document_requests, extract unique `user_id` values, query `profiles` for `id, approval_status`, and merge the status back into each request object. The badge renders inline next to the name/email, styled consistently with existing badges (small, amber).

## Files Changed

| File | Change |
|------|--------|
| `src/pages/admin/DocumentTrackingPage.tsx` | Fetch user approval status in pending queue query; show "Pending Approval" badge on unapproved user rows |

