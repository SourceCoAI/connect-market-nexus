

# Fix Email Delivery — Agreement Emails + Reactivate All Brevo Emails

## What's Actually Wrong

### 1. Agreement emails: Function not redeployed
The analytics show a **401** on the most recent `request-agreement-email` call. The code in the repo has been updated (adding `logEmailDelivery`, correlation IDs, etc.) but the **deployed** edge function is still the old version. This is why:
- `document_requests` shows `email_correlation_id: null` and `email_provider_message_id: null` for ALL rows — the deployed code never writes these fields
- `email_delivery_logs` has ZERO entries for agreement emails — the deployed code never logs them
- Earlier sends (before today's code changes) DID work — `document_requests` shows `status: email_sent` for requests from hours ago

The 401 on the latest call likely means the redeployed function hasn't been deployed at all, or the auth flow changed in a way that broke the deployed version.

### 2. Brevo webhook: Use "Outbound webhook"
Yes, **Outbound webhook** is correct. This sends events FROM Brevo TO your `brevo-webhook` edge function URL. You're already on the right screen.

### 3. Other emails "wiped"
The `send-approval-email` function calls Brevo directly (not via `sendViaBervo`), and the `email_delivery_logs` show it was working on March 31 (`approval_email` for `adambhaile00@gmail.com` — status: sent). The `send-connection-notification` function uses `sendViaBervo`. Both functions exist in the codebase and should be working. "Wiped" likely means they also need redeployment after recent code changes to shared files (`_shared/brevo-sender.ts`, `_shared/email-logger.ts`, `_shared/cors.ts`, `_shared/auth.ts`).

## Root Cause
**All email edge functions need redeployment.** Changes to shared utilities (`brevo-sender.ts`, `email-logger.ts`, `auth.ts`) and to the functions themselves are in the codebase but not deployed. Edge functions serve the LAST DEPLOYED code, not what's in the repo.

## Plan

### Step 1: Deploy all email-related edge functions
Deploy these functions that send emails via Brevo:
- `request-agreement-email` (agreement NDA/Fee emails)
- `send-approval-email` (buyer approval)
- `send-connection-notification` (connection request confirmations)
- `user-journey-notifications` (welcome, verification success)
- `send-deal-alert` (deal alerts)
- `send-marketplace-invitation` (marketplace invitations)
- `brevo-webhook` (delivery tracking — for the webhook you're setting up)
- `notify-admin-new-message`, `notify-buyer-new-message`, `notify-buyer-rejection`
- `notify-deal-owner-change`, `notify-deal-reassignment`, `notify-new-deal-owner`
- `send-memo-email`, `send-fee-agreement-email`, `send-nda-email`
- `send-verification-success-email`, `send-simple-verification-email`
- `send-password-reset-email`
- `grant-data-room-access`

### Step 2: Brevo webhook setup (manual — in Brevo dashboard)
After deploying, set up the **Outbound webhook** in Brevo:
- **URL**: `https://vhzipqarkmmfuqadefep.supabase.co/functions/v1/brevo-webhook`
- **Events**: delivered, hardBounce, softBounce, blocked, spam, opened, clicked, unsubscribed

### Step 3: Test end-to-end
- Trigger a resend from the listing detail as a buyer
- Trigger an admin send from Document Tracking
- Verify `email_delivery_logs` gets an entry
- Verify `document_requests` gets `email_correlation_id` and `email_provider_message_id` populated
- Verify email lands in inbox

## No Code Changes Needed
All the code is already correct in the repository. The only action is **deploying the edge functions** so the live environment matches the codebase.

