

# Revert: Send Emails Directly From Admin's Email Address

## What happened
The "noreply@" sender lockdown caused emails to land in Gmail's Promotions tab. The original approach of sending directly from the admin's email (e.g., bill.martin@sourcecodeals.com) actually works fine -- the earlier test just arrived late.

## Changes

### 1. `supabase/functions/_shared/email-sender.ts` (lines 113-117)
Remove the sender lockdown logic. Revert to using the admin's actual email as the Brevo sender:

```typescript
// REMOVE these lines:
const isCustomSender = options.senderEmail && options.senderEmail !== VERIFIED_SENDER_EMAIL && options.senderEmail !== NOREPLY_SENDER_EMAIL;
const brevoSenderName = isCustomSender ? `${senderName} via SourceCo` : senderName;
const brevoSenderEmail = NOREPLY_SENDER_EMAIL;

// REPLACE with:
const brevoSenderName = senderName;
const brevoSenderEmail = senderEmail;
```

Also update line 152 (already uses `brevoSenderName`/`brevoSenderEmail` so no change needed there).

### 2. Redeploy edge functions
- `send-connection-notification` (approval emails)
- `notify-buyer-rejection` (decline emails)

Both consume the shared `email-sender.ts`, so redeploying picks up the revert.

### Result
- Approval emails: sent from admin's actual email (e.g., `Bill Martin <bill.martin@sourcecodeals.com>`)
- Rejection emails: sent from admin's actual email when custom sender is provided, otherwise from `noreply@sourcecodeals.com`
- Reply-to remains the admin's email

