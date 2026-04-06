

# Direct Buyers to Reply in-Platform, Not via Email

## Problem

Several messaging-related emails set `replyTo: 'support@sourcecodeals.com'`, which invites buyers to reply directly via email. Those replies land in Outlook and are invisible to all admins on the platform. Conversations fragment across email and the messaging system.

## Emails That Need Changes

| # | Edge Function | Email Purpose | Current Issue |
|---|--------------|---------------|---------------|
| 1 | `notify-buyer-new-message` | "Admin replied to your message" | Says "Log in to your dashboard to view the full message and reply" — decent, but `replyTo` is `support@` so email reply is easy. Needs stronger nudge + set `replyTo` to `noreply@` |
| 2 | `notify-buyer-inquiry-received` | "We received your inquiry" | Already says "reply directly on the platform" — good copy. But `replyTo` is `support@` which contradicts the message. Change to `noreply@` |
| 3 | `send-connection-notification` (approval_notification) | "Your introduction is approved" | Says "Reply to any email or message us in the platform for support" — actively encourages email reply. Fix copy + `replyTo` |
| 4 | `send-feedback-email` | Admin reply to feedback | Says "Please do not reply to this email" but `replyTo` is `support@`. Change to `noreply@` |
| 5 | `grant-data-room-access` | "Data room access granted" | Says "reply to this email. It goes directly to our deal team" — actively encourages email reply. Fix copy + `replyTo` |
| 6 | `notify-support-inbox` | Internal admin copy of messages | Admin-facing, no buyer impact — leave as-is |

## Changes Per File

### 1. `supabase/functions/notify-buyer-new-message/index.ts`
- Change `replyTo` from `support@sourcecodeals.com` to `noreply@sourcecodeals.com`
- Change `senderName` to `SourceCo Notifications` and `senderEmail` to `noreply@sourcecodeals.com`
- Update body copy: replace "Log in to your dashboard to view the full message and reply" with "Please reply directly on the platform so all admins can see your response and assist you faster."
- CTA button already links to `/messages` — correct

### 2. `supabase/functions/notify-buyer-inquiry-received/index.ts`
- Change `replyTo` from `support@sourcecodeals.com` to `noreply@sourcecodeals.com`
- Add a line: "Please do not reply to this email. All conversations are managed securely on the platform."
- CTA already links to `/messages` — correct

### 3. `supabase/functions/send-connection-notification/index.ts` (approval type)
- Change `replyTo` from `support@sourcecodeals.com` to `noreply@sourcecodeals.com`
- Replace "Reply to any email or message us in the platform for support" with "Message us directly on the platform for support. All conversations are tracked there for your records."
- CTA button already links to `/my-deals` — correct (messages tab is within My Deals)

### 4. `supabase/functions/send-feedback-email/index.ts`
- Change `replyTo` from `support@sourcecodeals.com` to `noreply@sourcecodeals.com`
- Keep "Please do not reply to this email" — already correct copy

### 5. `supabase/functions/grant-data-room-access/index.ts`
- Change `replyTo` from `support@sourcecodeals.com` to `noreply@sourcecodeals.com`
- Replace "reply to this email. It goes directly to our deal team" with "If you have questions about the materials, message us directly on the platform. Your deal team monitors all conversations there."
- Add a secondary CTA or note linking to `/messages`

## What Does NOT Change
- `notify-support-inbox` — internal admin email, no buyer interaction
- `send-connection-notification` (user_confirmation / admin_notification types) — these are confirmations/admin alerts, not conversation emails
- Onboarding emails (day2, day7) — these say "reply to this email" for general questions, not messaging threads. Leave as-is since those aren't tied to deal conversations.
- `request-agreement-email` — says "reply with signed copy attached" which is a legitimate email-reply workflow for document signing

## Summary
Five edge functions updated. Two types of changes per file:
1. `replyTo` changed from `support@` to `noreply@` so email clients don't offer an easy reply path
2. Body copy updated to explicitly direct buyers to the platform for all deal conversations

All CTA buttons already link to the correct platform pages (`/messages`, `/my-deals`). No link changes needed.

