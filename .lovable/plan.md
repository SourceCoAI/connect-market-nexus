

# Audit: Email Infrastructure -- Current State

## All fixes confirmed implemented correctly

### 1. email-sender.ts -- Sender lockdown (WORKING)
- Line 115-117: Custom senders locked to `noreply@sourcecodeals.com` with `"[Name] via SourceCo"` display name
- Line 111: Reply-to correctly chains: `options.replyTo → options.senderEmail → DEFAULT_REPLY_TO`
- Line 152: Brevo payload uses `brevoSenderName` and `brevoSenderEmail` (locked)
- Line 163: Reply-to set to admin's actual email for direct replies

### 2. useConnectionRequestActions.ts -- Rejection in-app message (FIXED)
- Line 223: `body: adminComment || note || 'Request declined.'` -- correctly prioritizes dialog comment

### 3. notify-buyer-rejection -- Sender defaults aligned (FIXED)
- Lines 72-74: `senderName: 'SourceCo Notifications'`, `senderEmail: 'noreply@sourcecodeals.com'`, `replyTo: 'support@sourcecodeals.com'`

## One minor issue remaining

### Duplicate `htmlContent` property in email-sender.ts (Line 155-156)
```
htmlContent: options.htmlContent,
htmlContent: options.htmlContent,   // ← duplicate
```
Harmless (JS uses the last value) but should be cleaned up.

## Deployment concern

Both `send-connection-notification` and `notify-buyer-rejection` show **zero logs** in the current window. This could mean either no emails have been triggered since the last deploy, or the deployed code doesn't match source. A redeploy of both functions would guarantee the live code includes the sender lockdown fix.

## Build errors (unrelated)
The build errors shown are all in `enrich-deal` and `extract-buyer-criteria-background` -- pre-existing TypeScript issues unrelated to email sending.

## Plan

| Step | Detail |
|------|--------|
| Remove duplicate `htmlContent` line in `email-sender.ts` (line 156) | One-line deletion |
| Redeploy `send-connection-notification` | Ensure live code has sender lockdown |
| Redeploy `notify-buyer-rejection` | Ensure live code has sender lockdown |

Everything else is confirmed correct and at parity. The email system design (single verified sender + reply-to) is the right approach -- no architectural changes needed.

