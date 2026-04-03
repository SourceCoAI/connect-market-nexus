

# Use support@sourcecodeals.com for Buyer-Facing Emails

## Current State

All emails are sent **from** `adam.haile@sourcecodeals.com` (the only verified sender in Brevo). The `replyTo` also defaults to Adam's email. This means every email -- agreement documents, message notifications, agreement confirmations, onboarding -- all come from Adam personally.

## The Challenge

Brevo requires the **sender** (`from`) to be a verified sender/domain. We cannot change the `from` address to `support@sourcecodeals.com` unless it is also verified in Brevo. However, we **can** change the `replyTo` address freely, and we can change the `senderName` display name.

## Approach: Two-Tier Sender Identity

Instead of one locked identity, define two sender profiles in `email-sender.ts`:

| Profile | Use Case | From (Brevo sender) | Sender Name | Reply-To |
|---|---|---|---|---|
| **Personal** (default) | Deal referrals, memo sends, owner-facing | adam.haile@ | Adam Haile - SourceCo | adam.haile@ |
| **Support** | Document emails, message notifications, agreement confirmations, onboarding, verification | adam.haile@ (Brevo constraint) | SourceCo | support@ |

The **from** address stays `adam.haile@` (Brevo verified sender constraint), but the **display name** changes to "SourceCo" and **reply-to** changes to `support@` for buyer-facing operational emails. When a buyer hits "reply", it goes to `support@sourcecodeals.com`.

## Which Emails Get the Support Profile

These emails are operational/system emails where replies should go to a team inbox, not Adam personally:

- `request-agreement-email` -- document sends (NDA/Fee Agreement)
- `notify-agreement-confirmed` -- agreement signed confirmation
- `notify-buyer-new-message` -- new message notification to buyer
- `notify-admin-new-message` -- new message notification to admin (replyTo stays admin)
- `send-verification-success-email` -- email verification success
- `send-onboarding-day2` / `send-onboarding-day7` -- onboarding sequences
- `approve-marketplace-buyer` -- connection approval
- `grant-data-room-access` -- data room access granted
- `send-connection-notification` -- connection request notifications
- `password-reset` -- password reset

These stay personal (Adam's identity):
- `send-memo-email` -- personal outreach from admin
- `send-deal-referral` -- deal referral from admin
- `send-contact-response` -- personal response to contact form

## Technical Changes

### 1. `email-sender.ts` -- Add support profile constant

Add a `SUPPORT_REPLY_TO` constant (`support@sourcecodeals.com`) and a `SUPPORT_SENDER_NAME` constant (`SourceCo`). No changes to how the function works -- callers just pass `replyTo` and `senderName` overrides.

### 2. Each edge function -- Update `sendEmail()` calls

For each operational email function listed above, add/update two fields:
```
senderName: 'SourceCo',
replyTo: 'support@sourcecodeals.com',
```

This is a straightforward find-and-replace across ~10 edge functions. No logic changes.

### 3. Also verify: Is support@ set up to receive email?

This is outside of code -- the user needs to confirm that `support@sourcecodeals.com` is a working inbox (Google Workspace, etc.) that can receive replies. The code change is safe regardless.

### 4. Future: Verify support@ as Brevo sender

Once `support@sourcecodeals.com` is verified as a sender in Brevo, we can update `VERIFIED_SENDER_EMAIL` to use it as the actual `from` address for operational emails. For now, the reply-to approach gives 90% of the benefit.

## Files Changed

- `supabase/functions/_shared/email-sender.ts` -- add support profile constants
- `supabase/functions/request-agreement-email/index.ts`
- `supabase/functions/notify-agreement-confirmed/index.ts`
- `supabase/functions/notify-buyer-new-message/index.ts`
- `supabase/functions/send-verification-success-email/index.ts`
- `supabase/functions/send-onboarding-day2/index.ts`
- `supabase/functions/send-onboarding-day7/index.ts`
- `supabase/functions/approve-marketplace-buyer/index.ts`
- `supabase/functions/grant-data-room-access/index.ts`
- `supabase/functions/send-connection-notification/index.ts`
- `supabase/functions/password-reset/index.ts`

All changes are adding `senderName: 'SourceCo'` and `replyTo: 'support@sourcecodeals.com'` to existing `sendEmail()` calls. Deploy all updated functions after.

