

# Fix All Email Delivery — Hardcode Verified Sender

## Root Cause (Confirmed with Evidence)

The `SENDER_EMAIL` secret does **not exist** in the project (confirmed via secrets check — it's not in the 26 configured secrets). Every email function falls back to `notifications@sourcecodeals.com`, which is **not verified in Brevo**. Brevo accepts the API call (returns HTTP 200 + message ID) but then silently drops the email because the sender identity is unverified.

Evidence: 6+ sends to `adambhaile00@gmail.com` all show `status: sent` with valid Brevo message IDs, but nothing arrives in inbox.

## Fix

Since I cannot add secrets programmatically, I will **hardcode `support@sourcecodeals.com`** (the verified Brevo sender) as the default fallback in all email-sending code. The `SENDER_EMAIL` env var will still be checked first, but the fallback changes from `notifications@sourcecodeals.com` to `support@sourcecodeals.com`.

### Files to Change

1. **`supabase/functions/_shared/brevo-sender.ts`** (line 85)
   - Change fallback from `notifications@sourcecodeals.com` to `support@sourcecodeals.com`
   - This fixes ALL functions that rely on the shared sender default

2. **`supabase/functions/request-agreement-email/index.ts`** (line 216)
   - Change fallback from `notifications@sourcecodeals.com` to `support@sourcecodeals.com`

3. **`supabase/functions/send-approval-email/index.ts`** (line 63)
   - Change fallback from `noreply@sourcecodeals.com` to `support@sourcecodeals.com`

4. **`supabase/functions/enhanced-email-delivery/index.ts`** (lines 81-82)
   - Change fallback from `adam.haile@sourcecodeals.com` to `support@sourcecodeals.com`

5. **`supabase/functions/send-nda-email/index.ts`** (line 382)
   - Change fallback from `noreply@sourcecodeals.com` to `support@sourcecodeals.com`

6. **`supabase/functions/send-fee-agreement-email/index.ts`**
   - Check and update any `noreply@sourcecodeals.com` fallback

### Deploy

Redeploy all affected functions:
- `request-agreement-email`
- `send-connection-notification`
- `send-approval-email`
- `enhanced-email-delivery`
- `send-nda-email`
- `send-fee-agreement-email`
- `notify-buyer-rejection`
- `brevo-webhook`
- `user-journey-notifications`

### Why This Will Work

The connection notifications and approval emails **used to work** — they were sending from a verified identity. The only thing that changed is the sender fell back to an unverified address. Changing the default to the verified `support@sourcecodeals.com` restores the working behavior without depending on a secret that can't be added programmatically.

