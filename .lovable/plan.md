

# Email System — Current State & What Remains

## What's Already Done (Working Correctly)

1. **Single sender utility**: All 34 edge functions now use `sendEmail()` from `_shared/email-sender.ts`. Zero references to legacy `sendViaBervo()`, `brevo-sender.ts`, or `email-logger.ts` remain.
2. **Correct API key**: `BREVO_API_KEY` was rotated and confirmed working — emails are arriving via Brevo.
3. **Locked sender identity**: Every email goes out as `adam.haile@sourcecodeals.com` with consistent reply-to.
4. **Tracking**: Every send creates an `outbound_emails` record with status updates and `email_events` entries.
5. **Legacy cleanup**: `send-nda-email`, `send-fee-agreement-email`, `brevo-sender.ts`, and `email-logger.ts` are all deleted.

## What Still Needs Work

### 1. Brevo Webhook Not Connected to New Tables
The `brevo-webhook` edge function still writes to legacy tables (`email_delivery_logs`, `engagement_signals`, `document_requests`). It does NOT update `outbound_emails` or `email_events` — meaning delivery confirmations, bounces, opens, and clicks from Brevo are never recorded against the new tracking system.

**Why it matters**: You can see "accepted" in the admin UI but never "delivered", "opened", or "bounced". The new tracking tables stay stuck at "accepted" forever.

**Fix**: Update `brevo-webhook` to match incoming Brevo message IDs against `outbound_emails.provider_message_id` and update status + insert `email_events`.

### 2. No Consolidated Email Dashboard
The `DocumentTrackingPage` reads from `outbound_emails` for agreement emails only. There's no single admin view showing ALL platform emails, their delivery status, open rates, or failures.

**Why it matters**: You have no visibility into whether onboarding emails, deal alerts, task notifications, etc. are actually being delivered.

**Fix**: Build an admin Email Dashboard page that queries `outbound_emails` with filters by template, status, date range.

### 3. Stale/Duplicate Edge Functions
Several edge functions do overlapping things:
- `send-approval-email` vs `send-templated-approval-email` — both send approval emails
- `enhanced-email-delivery` — generic wrapper that adds no value over calling `sendEmail()` directly
- `enhanced-admin-notification` — same pattern
- `send-password-reset-email` — may conflict with Supabase Auth's built-in password reset

**Why it matters**: Maintenance burden, confusion about which function to call, potential for sending duplicate emails.

**Fix**: Audit each for active callers in the frontend. Consolidate where possible, delete unused ones.

### 4. Email Templates Are Raw HTML Strings
Most edge functions build HTML with inline string concatenation. There's no consistent branding, no shared layout, and no preview capability.

**Why it matters**: Emails look inconsistent, are hard to maintain, and can't be previewed before sending.

**Fix**: Create a shared HTML email layout wrapper and migrate the most important templates to use it.

### 5. No Suppression/Bounce Handling
If Brevo reports a hard bounce or spam complaint, nothing prevents the system from trying to send to that address again. There's no suppression list.

**Why it matters**: Repeatedly sending to bounced addresses damages sender reputation and can get the domain blocked.

**Fix**: Add a `suppressed_emails` check inside `sendEmail()` before calling Brevo, populated by the webhook on bounce/complaint events.

## Recommended Phases

### Phase 1: Connect Brevo Webhook to New Tables
Update `brevo-webhook/index.ts` to write delivery events to `outbound_emails` (status updates) and `email_events` (event log). This closes the tracking loop.

### Phase 2: Add Bounce Suppression
Create a `suppressed_emails` table. Populate it from webhook bounce/complaint events. Check it in `sendEmail()` before sending.

### Phase 3: Consolidate Duplicate Functions
Audit frontend call sites for overlapping email functions. Merge or delete redundant ones.

### Phase 4: Email Dashboard
Build an admin page showing all `outbound_emails` with status badges, filters, and delivery stats.

### Phase 5: Template Standardization
Create a shared HTML email wrapper with consistent branding. Migrate high-traffic templates to use it.

## Summary

The core sending infrastructure is solid and working. The remaining work is about closing the observability loop (webhook → tracking), preventing reputation damage (suppression), reducing complexity (consolidating duplicates), and improving visibility (dashboard). None of these are blockers for emails being sent — they're operational maturity improvements.

