

# Stop Emailing Every Admin on New Messages

## Problem

When a buyer sends a message, `notify-admin-new-message` emails ALL admin users (it queries `user_roles` for every admin, loops through them, and sends an email to each). This is noisy and unnecessary -- admins already get real-time toasts and dashboard notifications via the realtime subscription we just added. Only the buyer should get an email when an admin replies (which `notify-buyer-new-message` already handles correctly, sending to one buyer).

## Solution

Remove the admin email notifications entirely for new buyer messages. Admins are already notified via:
- Real-time toast in the admin dashboard (the `connection_messages` INSERT subscription we just added)
- The Message Center inbox updating in real-time
- Admin notifications panel

Keep `notify-buyer-new-message` as-is (correct behavior: emails one buyer when admin replies).

## Changes

### 1. `src/hooks/use-connection-messages.ts`
- Remove the `notify-admin-new-message` invocation block (lines 159-175) from the `useSendMessage` mutation

### 2. `src/pages/BuyerMessages/GeneralChatView.tsx`
- Remove the `notify-admin-new-message` invocation (lines 143-151) from the send handler

### 3. `supabase/functions/notify-admin-new-message/index.ts`
- Keep the file but add a deprecation comment at the top. We won't delete it to avoid breaking any existing references, but it will no longer be called.

### No changes to
- `notify-buyer-new-message` -- this correctly emails the one buyer when an admin replies (stays as-is)
- Admin realtime subscriptions -- already handle in-app notifications

