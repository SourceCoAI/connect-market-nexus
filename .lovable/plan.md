

# Audit: Rejection Flow vs Approval Flow -- Parity Check

## Side-by-side comparison across all entry points

### 1. ConnectionRequestEmailDialog.tsx -- GOOD
Both approval and rejection paths are fully implemented:
- Rejection has its own default body copy (lines 88, 284-295)
- First-person voice is NOT used in rejection copy (correct -- rejection is from "The SourceCo Team")
- Sender selector works for both
- Edit/reset body works for both
- Subject line: "Regarding your interest in [listing]" (line 125)
- Red button with XCircle icon (line 343-345)
- Admin comment labeled "Rejection reason (optional)"

### 2. useConnectionRequestActions.ts -- Rejection (lines 211-287) vs Approval (lines 85-209)

| Feature | Approval | Rejection | Issue? |
|---------|----------|-----------|--------|
| `mutateAsync` with try/catch | Yes (line 88) | Yes (line 216) | OK |
| `notes: adminComment` | Yes (line 88) | Yes (line 219) | OK |
| In-app message | "Your request for..." (line 108) | `note \|\| 'Request declined.'` (line 223) | **ISSUE** -- uses `rejectNote` state, not `adminComment` |
| Email guard `if (buyerEmail)` | Yes (line 123) | Yes (line 232) | OK |
| Sender resolved from DEAL_OWNER_SENDERS | Yes (line 126) | Yes (line 234) | OK |
| customBody forwarded | Yes (line 144) | Yes (line 249) | OK |
| User notification (bell) | Yes - "request_approved" (line 158) | Yes - "status_changed" (line 264) | OK |
| Data room access provisioning | Yes (line 170) | N/A (correct) | OK |

**ISSUE A**: The in-app rejection message uses `rejectNote` (the old inline textarea state) not the `adminComment` from the email dialog. When admin uses the email dialog flow, `rejectNote` is empty so the message thread shows "Request declined." -- a generic fallback. The admin's typed comment is saved to `notes` on the DB record but never appears in the buyer's message thread.

### 3. AdminRequests.tsx -- Rejection path (lines 288-308)

| Feature | Approval | Rejection | Issue? |
|---------|----------|-----------|--------|
| Status update via unified hook | Yes | Yes | OK |
| Email invocation | `send-connection-notification` | `notify-buyer-rejection` | OK |
| Sender resolved | Yes | Yes | OK |
| customBody forwarded | Yes | Yes | OK |
| `listingId` guard removed | Yes | N/A (rejection doesn't need listingId) | OK |
| **In-app message** | None | None | Both skip in-app messages -- consistent |
| **User notification (bell)** | None | None | Both skip notifications -- consistent |

No issues here -- both paths are consistent within this entry point.

### 4. WebflowLeadDetail.tsx -- Rejection path (lines 117-149)

| Feature | Approval | Rejection | Issue? |
|---------|----------|-----------|--------|
| `mutateAsync` with try/catch + early return | Yes (line 83-88) | Yes (line 118-123) | OK |
| Email invocation | `send-connection-notification` | `notify-buyer-rejection` | OK |
| Sender resolved | Yes | Yes | OK |
| customBody forwarded | Yes | Yes | OK |
| **In-app message** | None | None | Both skip -- consistent |
| **User notification (bell)** | None | None | Both skip -- consistent |

No issues here.

### 5. notify-buyer-rejection edge function

| Feature | Approval edge fn | Rejection edge fn | Issue? |
|---------|------------------|--------------------|--------|
| Custom body paragraph splitting | Yes (double-newline) | Yes (double-newline) | OK |
| HTML escaping | `escapeHtmlWithBreaks` | Manual `.replace()` chain | **MINOR** -- different implementation, same effect |
| Named sender support | Yes -- `senderEmail`, `senderName`, `replyTo` | Yes | OK |
| Default sender | `senderName: 'SourceCo Notifications'`, `senderEmail: 'noreply@...'` | `senderName: 'SourceCo'`, `senderEmail: undefined` | **ISSUE B** |
| Subject capitalization | "Request approved: [title]" | "Regarding Your Interest in [title]" (Title Case) | Minor style difference, acceptable |

**ISSUE B**: When no sender is selected, the approval function sends from `SourceCo Notifications <noreply@sourcecodeals.com>`, but the rejection function sends from `SourceCo` with `senderEmail: undefined`. The `sendEmail` function likely has its own default, but this inconsistency means rejection emails may come from a different address than approvals when using the default sender.

### 6. ConnectionRequestEmailDialog -- Rejection preview copy

The dialog preview (lines 284-295) matches the edge function's default body (lines 20-25) exactly. The copy is:
- "We limit access to a small number of buyers per deal" (correct, not "introductions")
- Signed "The SourceCo Team" (correct)
- No first-person voice for rejections (correct -- rejections are always from the team)

This is correct and consistent.

## Summary of findings

### ISSUE A (Medium): In-app message for rejection uses stale `rejectNote` state
**Problem**: In `useConnectionRequestActions.ts` line 223, the rejection in-app message uses `note` (derived from `rejectNote` state variable), not `adminComment` from the email dialog. Since the email dialog flow passes `adminComment` as the third parameter to `handleReject`, but `rejectNote` remains empty, the buyer's message thread shows "Request declined." instead of any contextual message.

**Fix**: Use `adminComment` (the third parameter) as the message body, falling back to `rejectNote` then "Request declined.":
```typescript
body: adminComment || note || 'Request declined.',
```

### ISSUE B (Minor): Default sender inconsistency in rejection edge function
**Problem**: `notify-buyer-rejection` defaults to `senderName: 'SourceCo'` with no `senderEmail`, while `send-connection-notification` defaults to `senderName: 'SourceCo Notifications'` with `senderEmail: 'noreply@sourcecodeals.com'`.

**Fix**: Align the rejection function's defaults:
```typescript
senderName: customSenderName || 'SourceCo Notifications',
senderEmail: customSenderEmail || 'noreply@sourcecodeals.com',
replyTo: customReplyTo || 'support@sourcecodeals.com',
```

## Files that need changes

| File | Change |
|------|--------|
| `src/components/admin/connection-request-actions/useConnectionRequestActions.ts` | Line 223: Use `adminComment` param for in-app message body |
| `supabase/functions/notify-buyer-rejection/index.ts` | Lines 72-74: Align default sender to match approval function |

Everything else is at parity. Two small fixes needed.

