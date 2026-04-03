

# Email System — What's Done vs What Remains

## Current State (All Working)

The core infrastructure is complete and operational:
- All 30+ email-sending edge functions use `sendEmail()` from `_shared/email-sender.ts`
- Brevo API key rotated and confirmed working
- Sender identity locked to `adam.haile@sourcecodeals.com`
- Every send tracked in `outbound_emails` + `email_events`
- Brevo webhook updates delivery status and populates `suppressed_emails`
- Bounce suppression active in `sendEmail()`
- Email Dashboard at `/admin/emails`
- Shared template wrapper (`wrapEmailHtml()`) adopted by 7 high-traffic functions

## What Still Needs Work

### 1. Template wrapper adoption is incomplete

Only 7 of ~30 email-sending functions use `wrapEmailHtml()`. The remaining ~23 still build raw inline HTML with no consistent branding. These include:

- `send-first-request-followup` — raw HTML div
- `send-onboarding-day2` — raw HTML
- `send-onboarding-day7` — raw HTML
- `send-deal-alert` — raw HTML
- `send-deal-referral` — raw HTML
- `send-feedback-email` — raw HTML
- `send-contact-response` — raw HTML
- `send-marketplace-invitation` — raw HTML
- `send-memo-email` — has its OWN local `wrapEmailHtml()` function instead of using the shared one
- `send-verification-success-email` — raw HTML
- `send-simple-verification-email` — raw HTML
- `send-data-recovery-email` — raw HTML
- `send-task-notification-email` — raw HTML
- `send-owner-inquiry-notification` — raw HTML
- `send-owner-intro-notification` — raw HTML
- `send-feedback-notification` — raw HTML
- `notify-deal-owner-change` — raw HTML
- `notify-deal-reassignment` — raw HTML
- `notify-buyer-rejection` — raw HTML
- `notify-buyer-new-message` — raw HTML
- `notify-new-deal-owner` — raw HTML
- `grant-data-room-access` — raw HTML
- `approve-marketplace-buyer` — raw HTML
- `password-reset` — raw HTML

**Why it matters**: Recipients get visually inconsistent emails — some branded with SourceCo header/footer, others plain HTML. It looks unprofessional and erodes trust.

**Work**: Migrate each to import and use the shared `wrapEmailHtml()`. Batch into groups of 5-8, redeploy after each batch.

### 2. `send-memo-email` has a duplicate local wrapper

This function defines its own `wrapEmailHtml()` locally (line 128) instead of using the shared one from `_shared/email-template-wrapper.ts`. This means its branding diverges from the rest of the platform.

**Work**: Replace the local function with the shared import.

### 3. No remaining consolidation or deletion needed

The plan.md confirms all legacy functions (`enhanced-email-delivery`, `send-password-reset-email`, `send-approval-email`) are already deleted. `send-templated-approval-email` is the canonical approval sender. No duplicates remain.

## Recommended Execution

### Phase 1: Migrate remaining functions to shared wrapper (batched)
- Batch A (high-traffic user-facing): `send-first-request-followup`, `send-onboarding-day2`, `send-onboarding-day7`, `send-deal-alert`, `send-deal-referral`, `send-memo-email`
- Batch B (admin/system notifications): `notify-deal-owner-change`, `notify-deal-reassignment`, `notify-buyer-rejection`, `notify-buyer-new-message`, `notify-new-deal-owner`, `send-feedback-notification`
- Batch C (remaining): `send-feedback-email`, `send-contact-response`, `send-marketplace-invitation`, `send-verification-success-email`, `send-simple-verification-email`, `send-data-recovery-email`, `send-task-notification-email`, `send-owner-inquiry-notification`, `send-owner-intro-notification`, `grant-data-room-access`, `approve-marketplace-buyer`, `password-reset`

Each function gets the same change: import `wrapEmailHtml` from `../_shared/email-template-wrapper.ts`, wrap the existing body HTML with it, and redeploy.

### Phase 2: Verify and update plan.md

After all migrations, update plan.md to reflect full wrapper adoption.

## Summary

The email system is functionally complete — every email sends through one utility, one identity, with tracking and suppression. The only remaining work is cosmetic consistency: migrating the ~23 functions that still build raw HTML to use the shared branded wrapper. This is low-risk, high-impact polish work.

