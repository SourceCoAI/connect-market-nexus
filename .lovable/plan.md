
# Deep Investigation Plan — Why Agreement Emails Still Aren’t Reaching Inbox

## What I found in the code

1. **Agreement emails use a different sender path than the emails that already work**
   - `request-agreement-email` hardcodes:
     - `senderEmail: 'support@sourcecodeals.com'`
     - `replyToEmail: 'support@sourcecodeals.com'`
   - But the known-working flows do **not** follow that same pattern:
     - `send-connection-notification` uses the shared sender defaults and Adam-style reply-to
     - `user-journey-notifications` uses the shared sender defaults
     - `send-approval-email` uses admin/default sender logic
   - So agreement emails are on a **different From/Reply-To configuration** than the emails you said used to work.

2. **Agreement sending is still split across old and new systems**
   - Buyer-side flows now go through `request-agreement-email`
   - But some admin hooks still call legacy functions:
     - `src/hooks/admin/use-nda.ts` → `send-nda-email`
     - `src/hooks/admin/use-fee-agreement.ts` → `send-fee-agreement-email`
   - That means agreement emails are **not fully unified**, so behavior can differ depending on where the send originated.

3. **The new agreement flow is not sending the document the same way as before**
   - `request-agreement-email` sends a **public download link** to the document
   - The older NDA/Fee Agreement flows send **actual attachments**
   - So even aside from inbox delivery, the agreement flow is no longer using the same delivery format as the previously working admin email flows.

4. **Delivery observability is currently mismatched**
   - `document_requests` stores `email_correlation_id` as the app UUID
   - `brevo-webhook` writes `email_delivery_logs.correlation_id` as the **Brevo message-id**
   - Admin UI currently tries to join webhook events using the app correlation UUID
   - Result: even if Brevo does send a webhook, the UI can fail to show the true delivered/opened/bounced state

## Most likely root cause, ranked

### 1. Highest-confidence cause
**Agreement emails are using the wrong / less-proven sender identity path**
- The failing agreement flow is the one hardcoded to `support@sourcecodeals.com`
- The other flows you say worked before are aligned to Adam/admin/default sender behavior
- So the cleanest isolation step is to temporarily switch agreement emails to:
  - `adam.haile@sourcecodeals.com` as From, or
  - the same sender selection logic as the working flows

### 2. Very likely contributing issue
**You currently cannot trust the delivery UI to tell you what happened**
- Webhook correlation is wired wrong for agreement emails
- So “sent” may only mean “accepted by Brevo,” while the UI still cannot correctly prove delivered vs blocked vs bounced

### 3. Structural issue
**Agreement sends are split between legacy and new functions**
- That creates inconsistent behavior, inconsistent sender rules, and inconsistent attachment behavior

## Implementation plan

### Step 1 — Make agreement emails use the exact same sender approach as the known-good emails
Update `request-agreement-email` so it no longer hardcodes `support@sourcecodeals.com`.

For the immediate diagnostic pass:
- temporarily send agreement emails **from `adam.haile@sourcecodeals.com`**
- align reply-to with the same known-good identity
- use the same sender-selection rule used by the working notification flows

This gives us a true apples-to-apples test against the emails that already worked before.

### Step 2 — Unify all agreement send entry points
Remove split behavior so every NDA / Fee Agreement send uses one path:
- buyer request
- buyer resend
- admin send
- admin resend

Specifically:
- move admin NDA/Fee Agreement hooks off `send-nda-email` / `send-fee-agreement-email`
- route them through the same unified agreement sender used by buyer flows
- or make the legacy functions thin wrappers to the unified path

That eliminates path-specific sender/config differences.

### Step 3 — Restore “same as before” document delivery behavior
Because the old agreement system sent attachments and the new one only sends a public link, restore parity:
- extend the shared Brevo sender to support attachments
- have `request-agreement-email` attach the NDA / Fee Agreement file directly
- keep link fallback only if attachment loading fails

This makes agreement emails behave like the older admin agreement sends, not like a downgraded replacement.

### Step 4 — Fix webhook correlation so delivery status is real
Update the agreement delivery tracking so webhook events map back to the original request row correctly.

Best approach:
- keep storing Brevo `messageId` on `document_requests`
- when webhook fires, look up the matching `document_requests` row by `email_provider_message_id`
- then write the webhook event using the original app correlation id, or have the UI join by provider message id instead

This is required so the dashboard can honestly show:
- Sent to provider
- Delivered
- Opened
- Bounced
- Blocked
- Spam complaint

### Step 5 — Add explicit sender + provider audit data
For every agreement send, persist enough metadata to debug future failures fast:
- sender email actually used
- reply-to actually used
- provider message id
- latest provider status
- latest provider error / bounce reason

This can live on `document_requests` and/or `email_delivery_logs`.

### Step 6 — Verify both agreement paths end to end after the sender switch
Run one full test from each surface:
1. buyer resend from listing detail
2. admin send/resend from document tracking

For each, verify all of these:
- edge function returns success
- `document_requests` row updates
- provider message id is stored
- webhook callback lands
- delivery state updates in admin UI
- email actually arrives in `adambhaile00@gmail.com`

### Step 7 — Re-check all previously working email types after the agreement fix
Once agreement emails are aligned to the known-good sender strategy, smoke-test:
- connection request confirmation
- approval email
- user journey / onboarding emails

Goal: confirm we did not break the older working flows while normalizing agreement emails.

## Files likely involved

- `supabase/functions/request-agreement-email/index.ts`
- `supabase/functions/_shared/brevo-sender.ts`
- `supabase/functions/brevo-webhook/index.ts`
- `src/lib/agreement-email.ts`
- `src/hooks/admin/use-nda.ts`
- `src/hooks/admin/use-fee-agreement.ts`
- `src/components/admin/firm-agreements/AgreementStatusDropdown.tsx`
- `src/pages/admin/DocumentTrackingPage.tsx`

## Expected outcome

After this pass:
- agreement emails will send using the same trusted sender pattern as the emails that worked before
- admin and buyer sends will no longer diverge
- agreements will again be delivered in the same style as before (with attachments, if restored)
- the dashboard will show true provider-backed delivery states instead of misleading “sent” states
- we will be able to identify whether any remaining issue is truly provider-side rather than app-side
