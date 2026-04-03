

# Fix Topic Picker Feedback, Topic Context in Messages, and Admin Real-Time

## Three Issues

1. **"General Support" click does nothing visible** -- the general chat is already shown by default, so clicking it just closes the popover with no feedback. Need to scroll to input/focus the message box and show a brief toast or visual confirmation.

2. **No topic context in the message** -- when picking "Documents" or a deal, the reference is set internally but there's no visible indicator to the buyer that their message is about a specific topic. Need to show a topic badge/chip above the message input when a reference is pre-attached.

3. **Admin doesn't see new messages in real-time** -- `useRealtimeAdmin` subscribes to many tables but NOT `connection_messages`. Admins only see real-time messages if they have the specific thread open (via `useConnectionMessages` hook). Need to add a `connection_messages` INSERT subscription to `useRealtimeAdmin` so the Message Center inbox refreshes and shows a toast.

## Changes

### 1. `src/pages/BuyerMessages/GeneralChatView.tsx`
- When `reference` is set (from topic picker), show a small topic chip/badge above the message input area (e.g., "Re: Documents" or "Re: [Deal Name]") with an X to clear it
- Auto-focus the message input when the component mounts with a reference pre-set

### 2. `src/pages/BuyerMessages/NewMessagePicker.tsx`
- For "General Support": after calling `onSelectGeneral()`, the chat should auto-focus the input. This already happens via the reference flow -- but we need GeneralChatView to focus on mount/reference change.

### 3. `src/pages/BuyerMessages/MessageInput.tsx`
- Show the active reference as a small chip above the textarea when one is set (e.g., "Topic: Documents" with dismiss X)
- This gives clear visual feedback that the message will be tagged with this topic

### 4. `src/hooks/use-realtime-admin.ts`
- Add a subscription to `connection_messages` table for INSERT events
- On new message: show toast "New message from [buyer]" and invalidate `['connection-messages']`, `['unread-message-counts']`, `['admin-message-center-threads']`, `['buyer-message-threads']` query keys
- This ensures the admin Message Center inbox updates in real-time

### Files changed
- `src/pages/BuyerMessages/MessageInput.tsx` -- show topic chip when reference is active
- `src/pages/BuyerMessages/GeneralChatView.tsx` -- auto-focus input on reference change
- `src/hooks/use-realtime-admin.ts` -- add `connection_messages` INSERT subscription with toast + invalidation

