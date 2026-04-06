

# Fix Admin-Bound Emails: Sender Identity + Verify All Support Notifications Exist

## Problem

All emails sent TO `support@sourcecodeals.com` are currently sent FROM `support@sourcecodeals.com` via Brevo. Outlook sees this as suspicious because the email didn't originate from your mail server — it came from Brevo's SMTP, but claims to be from your own address. This triggers SmartScreen/spam filtering.

**Fix**: Change the sender for all admin/support-bound notification emails to `noreply@sourcecodeals.com`. These are system notifications — they don't need to come from "support". The `replyTo` can stay as `support@` where appropriate.

## Emails That Send TO support@sourcecodeals.com

| Email | Edge Function | Current From | New From |
|---|---|---|---|
| New User Registration | `enhanced-admin-notification` | support@ | noreply@ |
| New Connection Request (admin) | `send-connection-notification` (type: admin_notification) | support@ | noreply@ |
| New Buyer Message | `notify-support-inbox` (type: new_message) | support@ | noreply@ |
| Admin Reply Copy | `notify-support-inbox` (type: admin_reply) | support@ | noreply@ |
| Document Request | `notify-support-inbox` (type: document_request) | support@ | noreply@ |
| Owner Inquiry (/sell form) | `send-owner-inquiry-notification` | support@ | noreply@ |
| Feedback Submitted | `send-feedback-email` | support@ | noreply@ |
| Admin Digest | `admin-digest` | support@ | noreply@ (broken function, but fix anyway) |

## Changes

### 1. `supabase/functions/_shared/email-sender.ts`
Add a new constant:
```
export const NOREPLY_SENDER_EMAIL = 'noreply@sourcecodeals.com';
export const NOREPLY_SENDER_NAME = 'SourceCo Notifications';
```

### 2. Edge functions sending TO support@ — use `noreply@` as sender

Each of these functions needs `senderEmail: 'noreply@sourcecodeals.com'` and `senderName: 'SourceCo Notifications'` added to their `sendEmail()` call:

- **`enhanced-admin-notification/index.ts`** (line 79) — add `senderEmail`
- **`send-connection-notification/index.ts`** (line 162, admin_notification branch) — add `senderEmail`
- **`notify-support-inbox/index.ts`** (line 107) — add `senderEmail`
- **`send-owner-inquiry-notification/index.ts`** (line 65) — add `senderEmail`
- **`send-feedback-email/index.ts`** — add `senderEmail`
- **`admin-digest/index.ts`** — add `senderEmail` (even though it's broken, fix the identity for when it's repaired)

### 3. Verify `noreply@sourcecodeals.com` is a verified sender in Brevo
This needs to be verified in Brevo's dashboard. The user should add `noreply@sourcecodeals.com` as a verified sender if not already done.

### 4. `src/components/admin/emails/AdminEmailRouting.tsx`
Update all "Admin Notifications" and "Messaging" entries that go to `support@` to show `senderName: 'SourceCo Notifications'` and note the `noreply@` sender.

### 5. `src/components/admin/emails/EmailCatalog.tsx`
Update preview metadata for admin-bound emails to reflect `noreply@sourcecodeals.com` sender.

### 6. Deploy all modified edge functions

### Summary
- Buyer-facing emails: unchanged (still from `support@` or `adam.haile@`)
- Admin/support-bound notifications: now from `noreply@` so Outlook stops flagging them as self-spoofed

