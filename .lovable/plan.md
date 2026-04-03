
# Fix notify-support-inbox Email Not Sending

## Root Cause

The `notify-support-inbox` edge function calls `sendEmail` with the wrong signature:

```
// BROKEN (line 112):
await sendEmail(supabaseAdmin, {
  to: SUPPORT_EMAIL,
  subject,
  html: fullHtml,           // wrong field name
  replyTo: ...,
  senderName: ...,
  tags: ['support-inbox', type],  // not a valid field
});
```

But `sendEmail` expects a single `SendEmailOptions` object:
- `templateName` (required) -- missing
- `htmlContent` (not `html`)
- No `supabaseAdmin` first arg -- the function creates its own client
- No `tags` field exists

The supabaseAdmin object gets silently interpreted as the options, so `options.to` is undefined, causing the "email is missing in to" error.

## Fix

**`supabase/functions/notify-support-inbox/index.ts`**

- Remove the `supabaseAdmin` first argument
- Remove the `createClient` block (lines 107-110) -- not needed
- Change `html` to `htmlContent`
- Add `templateName: 'support-inbox-notification'`
- Remove `tags` (not a valid field)

```typescript
await sendEmail({
  templateName: 'support-inbox-notification',
  to: SUPPORT_EMAIL,
  subject,
  htmlContent: fullHtml,
  replyTo: SUPPORT_REPLY_TO,
  senderName: SUPPORT_SENDER_NAME,
});
```

- Deploy `notify-support-inbox`

### Files changed
- `supabase/functions/notify-support-inbox/index.ts` -- fix sendEmail call signature
- Deploy edge function
