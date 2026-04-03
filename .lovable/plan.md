

# Persist Message Notification Until Admin Replies

## Problem

Currently the Messages badge only counts unread admin messages (`sender_role='admin'` + `is_read_by_buyer=false`). When a buyer sends a question and no admin has replied yet, the badge shows 0 — there's no visual indicator that they have an unanswered thread.

The user wants: the red notification badge on Messages should stay visible until an admin actually replies to the buyer's message.

## Approach

Add an "awaiting reply" count to the buyer message badge. A thread is "awaiting reply" when:
- The last message in the thread was sent by the buyer (`last_message_sender_role = 'buyer'`)
- No admin reply exists after the buyer's last message

The `connection_requests` table already tracks `last_message_sender_role` (set by the DB trigger on `connection_messages` insert). We can use this directly.

## Changes

### `src/hooks/use-connection-messages.ts` — `useUnreadBuyerMessageCounts`

Extend the query to also count threads where `last_message_sender_role = 'buyer'` (meaning the buyer sent the last message and is awaiting a reply). Add this as `awaitingReplyTotal` to the return value, and include it in the `messagesTotal` count used by the navbar badge.

Specifically:
1. After fetching `connection_requests`, also check which ones have `last_message_sender_role = 'buyer'`
2. Count those as "awaiting reply" — but only if there's at least one message (not empty threads)
3. Add `awaitingReplyCount` to the totals so the badge reflects pending conversations

### `src/components/navbar/DesktopNavItems.tsx`

The Messages badge already uses `unreadMessages?.messagesTotal`. Since we'll include awaiting-reply threads in that count, no navbar changes needed — it will automatically show the combined count.

### `src/components/navbar/MobileNavItems.tsx`

Same — already uses `unreadMessages?.messagesTotal`, no changes needed.

### Result
- Buyer sends a question → badge shows "1" on Messages
- Admin replies → badge clears (unless there are other unread messages)
- Buyer reads the reply and responds again → badge shows "1" again until admin replies

### Files changed
- `src/hooks/use-connection-messages.ts` — extend `useUnreadBuyerMessageCounts` to include awaiting-reply threads

