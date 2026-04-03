

# Deep Investigation Results — Why Emails Are Not Arriving

## Evidence-Based Analysis

### What I verified in the actual deployed code and database

**1. The sender identity theory was WRONG all along.**

Proof: On March 31, emails to `adambhaile00@gmail.com` were sent using `notifications@sourcecodeals.com` (the old "unverified" fallback) via `user-journey-notifications` and `send-verification-success-email`. Those emails **worked and arrived**. The sender identity was never the root cause — changing it to `adam.haile@` or `support@` was unnecessary (though not harmful).

**2. Brevo IS accepting and delivering emails.**

On April 2 at 20:31, an NDA email was sent. At 20:40, the Brevo webhook confirmed `status: delivered` for that exact message (correlation_id matches the Brevo message-id `202604022031.78436361084@smtp-relay.mailin.fr`). Brevo delivered it to Gmail's servers successfully.

**3. The emails ARE being sent — Gmail is either filtering them or they need time.**

Database shows 8+ emails to `adambhaile00@gmail.com` logged as "sent" today with valid Brevo message IDs. Zero errors. The webhook confirmed delivery for at least one previous send.

### The ACTUAL remaining problems (code-side)

**Problem A: 12 functions still bypass `sendViaBervo` and call Brevo directly**

Despite the previous "migration" work, these functions were NOT converted:
- `send-onboarding-day2` — direct fetch, sender: `noreply@sourcecodeals.com`
- `send-onboarding-day7` — direct fetch, sender: `noreply@sourcecodeals.com`
- `send-first-request-followup` — direct fetch, sender: `noreply@sourcecodeals.com`
- `send-deal-alert` — direct fetch, sender: `adam.haile@` (works, but no retry)
- `send-deal-referral` — direct fetch, sender: `noreply@sourcecodeals.com`
- `send-templated-approval-email` — direct fetch, sender: `noreply@sourcecodeals.com`
- `send-contact-response` — direct fetch, sender: `noreply@sourcecodeals.com`
- `send-feedback-email` — direct fetch, sender: `adam.haile@` (works, but no retry)
- `send-feedback-notification` — direct fetch, sender: `adam.haile@` (works, but no retry)
- `send-task-notification-email` — direct fetch, sender: `adam.haile@` (works, but no retry)
- `send-nda-email` — direct fetch (legacy)
- `send-fee-agreement-email` — direct fetch (legacy)

These miss retry logic, consistent error handling, and unsubscribe compliance.

**Problem B: The agreement emails specifically — why they're not arriving at Gmail**

The agreement emails ARE reaching Brevo, and Brevo IS returning success. For at least one send on April 2, Brevo confirmed delivery to Gmail. But they're not appearing in inbox.

Possible causes (all outside code control):
- Gmail is classifying them as spam/promotions (check All Mail, Spam, Promotions tabs)
- The high volume of repeated sends to the same address (8+ NDA/fee agreement sends in 24 hours) may have triggered Gmail's rate limiting or filtering
- The attachment (NDA.docx, FeeAgreement.docx) may be triggering Gmail's security scanning

**What I CANNOT guarantee from code alone**: That Gmail will put emails in the Primary inbox. That's Gmail's decision based on sender reputation, content, frequency, and recipient behavior.

## The Fix — What Still Needs to Be Done

### Step 1: Migrate remaining 12 direct-fetch functions to `sendViaBervo`
Convert `send-onboarding-day2`, `send-onboarding-day7`, `send-first-request-followup`, `send-deal-alert`, `send-deal-referral`, `send-templated-approval-email`, `send-contact-response`, `send-feedback-email`, `send-feedback-notification`, `send-task-notification-email`, `send-nda-email`, `send-fee-agreement-email` to use `sendViaBervo`. This ensures retry logic, consistent sender, and unsubscribe compliance for ALL functions.

### Step 2: Add diagnostic logging to `sendViaBervo`
Log the actual sender email being used in every send so we can verify from logs what identity is being used without guessing.

### Step 3: Deploy all modified functions

### Step 4: User verification steps
The user needs to:
1. Check Gmail **All Mail** folder (not just inbox) — emails may be in Spam or Promotions
2. Check the Brevo dashboard → Logs/Activity to see actual delivery status for the message IDs from the edge function logs
3. Send ONE test email (not multiple) to avoid triggering Gmail's repeated-send filtering
4. If found in Spam, mark as "Not Spam" to train Gmail

## Files to Change
- `supabase/functions/send-onboarding-day2/index.ts`
- `supabase/functions/send-onboarding-day7/index.ts`
- `supabase/functions/send-first-request-followup/index.ts`
- `supabase/functions/send-deal-alert/index.ts`
- `supabase/functions/send-deal-referral/index.ts`
- `supabase/functions/send-templated-approval-email/index.ts`
- `supabase/functions/send-contact-response/index.ts`
- `supabase/functions/send-feedback-email/index.ts`
- `supabase/functions/send-feedback-notification/index.ts`
- `supabase/functions/send-task-notification-email/index.ts`
- `supabase/functions/send-nda-email/index.ts`
- `supabase/functions/send-fee-agreement-email/index.ts`
- `supabase/functions/_shared/brevo-sender.ts` (add sender logging)

## Honest Assessment

The code changes (migrating to `sendViaBervo`) will make the system more robust and consistent, but **the core delivery issue may not be code-related**. The evidence shows Brevo is accepting and even confirming delivery of emails. If Gmail is filtering them, the fix is on the Gmail/Brevo reputation side, not in the application code.

The user should check: Brevo dashboard → Transactional → Logs → search for the message IDs from the edge function logs to see Brevo's view of delivery status.

