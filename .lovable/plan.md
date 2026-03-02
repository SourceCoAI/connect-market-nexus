
## Notify Admin on Buyer Reply + Rebrand Email Templates

### What's Missing

1. **No admin notification when a buyer replies** -- The `useSendMessage` hook (line 136) only triggers the `notify-buyer-new-message` edge function when `sender_role === 'admin'`. When a buyer sends a message, no email goes out to the admin.

2. **Existing buyer notification email uses wrong colors** -- The `notify-buyer-new-message` edge function uses green CTA buttons (`#059669`), green border accents, and blue-grey tones instead of the SourceCo brand palette (Charcoal `#0E101A`, Gold `#DEC76B`, Warm Grey `#E5DDD0`, Off-White `#FCF9F0`).

---

### Plan

#### 1. Create `notify-admin-new-message` edge function

**New file: `supabase/functions/notify-admin-new-message/index.ts`**

This function mirrors `notify-buyer-new-message` but sends to admin(s) when a buyer replies. It will:
- Accept `connection_request_id` and `message_preview` from the frontend
- Look up the buyer's name and the deal title from the connection request
- Look up admin emails (query `user_roles` table for users with `admin` role, then get their profile emails)
- Build a branded HTML email showing the buyer's name, deal title, and message preview
- Include a CTA button linking to the admin Message Center thread
- Send via the shared `sendViaBervo` utility with retry logic
- Log delivery via `logEmailDelivery`
- Use `requireAuth` (not `requireAdmin`) since the caller is a buyer

**Email design** (SourceCo brand):
- White body background (`#ffffff`)
- "SOURCECO" header in `#9A9A9A` uppercase
- Heading in Deep Charcoal `#0E101A`
- Message preview block with left gold border (`#DEC76B`) and off-white background (`#FCF9F0`)
- CTA button: Deep Charcoal background (`#0E101A`), white text
- Footer separator in Warm Grey (`#E5DDD0`)
- Link to admin message center: `https://marketplace.sourcecodeals.com/admin/marketplace/message-center`

#### 2. Update `useSendMessage` hook to trigger admin notification

**File: `src/hooks/use-connection-messages.ts`**

Add a symmetric block after the existing admin notification (lines 136-152):

```
if (params.sender_role === 'buyer') {
  supabase.functions
    .invoke('notify-admin-new-message', {
      body: {
        connection_request_id: params.connection_request_id,
        message_preview: params.body.substring(0, 200),
      },
    })
    .then(({ error: fnError }) => {
      if (fnError) console.error('Failed to send admin notification:', fnError);
    })
    .catch((err) => console.error('Error invoking notify-admin-new-message:', err));
}
```

Fire-and-forget, same pattern as the existing admin-to-buyer notification.

#### 3. Rebrand existing `notify-buyer-new-message` email template

**File: `supabase/functions/notify-buyer-new-message/index.ts`**

Update `buildMessageNotificationHtml`:
- Green left border (`#059669`) on message preview becomes Gold (`#DEC76B`)
- Preview background from `#f8fafc` to Off-White (`#FCF9F0`)
- CTA button from green (`#059669`) to Deep Charcoal (`#0E101A`)
- Heading color from `#0f172a` to `#0E101A`
- Body text from `#334155` to `#3A3A3A`
- Footer text and border aligned to Warm Grey (`#E5DDD0`, `#9A9A9A`)

#### 4. Deploy both edge functions

Deploy `notify-admin-new-message` (new) and redeploy `notify-buyer-new-message` (updated).

---

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/notify-admin-new-message/index.ts` | New edge function -- sends branded email to admin(s) when buyer replies |
| `src/hooks/use-connection-messages.ts` | Add buyer-to-admin notification trigger in `useSendMessage` |
| `supabase/functions/notify-buyer-new-message/index.ts` | Rebrand email HTML to SourceCo palette |

### What stays the same
- All existing messaging functionality (realtime, read receipts, typing indicators)
- Shared utilities (`brevo-sender.ts`, `email-logger.ts`, `auth.ts`, `cors.ts`)
- Database schema -- no changes needed
