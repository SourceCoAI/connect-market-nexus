

# Complete Email Architecture Audit & Rebuild Plan

## The Real Problem

Your Brevo configuration is perfect — both senders verified, DKIM/DMARC/SPF all green. The problem is entirely on the code side. Here's what's actually wrong:

### Root Cause: Fragmented sender identities across 30+ edge functions

You have **18 edge functions that call Brevo's API directly** (bypassing the shared `sendViaBervo` utility) and **8 that use `sendViaBervo`**. They use **5 different unverified sender email fallbacks**:

| Fallback address | Verified in Brevo? | Used by |
|---|---|---|
| `notifications@sourcecodeals.com` | NO | `brevo-sender.ts` default, `notify-buyer-new-message`, `notify-admin-new-message`, `send-owner-intro-notification` |
| `noreply@sourcecodeals.com` | NO | `send-onboarding-day2`, `send-onboarding-day7`, `send-password-reset-email`, `send-templated-approval-email`, `send-first-request-followup`, `send-contact-response`, `send-deal-referral`, `send-marketplace-invitation`, `send-data-recovery-email` |
| `support@sourcecodeals.com` | YES | `request-agreement-email` (current), `send-fee-agreement-email`, `send-approval-email` |
| `adam.haile@sourcecodeals.com` | YES | `send-user-notification`, `send-owner-inquiry-notification` |
| Various admin emails | Maybe | `send-fee-agreement-email` (dynamic admin sender), `send-approval-email` (dynamic) |

**The `SENDER_EMAIL` secret exists in Supabase but many functions don't even read it** — they read `NOREPLY_EMAIL`, `ADMIN_EMAIL`, `OWNER_INQUIRY_SENDER_EMAIL`, or just hardcode addresses.

### Evidence from the database

- **191 emails logged as "sent"** since March 1st
- **0 emails confirmed "delivered"** (the 2 "delivered" entries are webhook test data)
- Brevo accepts every API call (returns HTTP 200 + message ID), then silently drops the email because the sender address is unverified

### Why it worked before

Previously, some functions used `adam.haile@sourcecodeals.com` (verified) as the sender. Over time, code changes introduced unverified fallback addresses. The functions that still use verified senders (`adam.haile@` or `support@`) should be delivering — but the `SENDER_EMAIL` env var resolution may differ between the code in the repo and what's actually deployed.

---

## Complete Inventory: Every Email the Platform Sends

### Group A: User-facing emails (triggered by user actions)
1. **`request-agreement-email`** — NDA/Fee Agreement documents (uses `sendViaBervo`, sender: `support@`)
2. **`send-connection-notification`** — 3 subtypes: user confirmation, admin notification, approval notification (uses `sendViaBervo`)
3. **`send-approval-email`** — Buyer approval notification (uses `sendViaBervo`, dynamic admin sender)
4. **`send-simple-verification-email`** — Email verification link (DIRECT Brevo call, sender: `noreply@` — BROKEN)
5. **`send-verification-success-email`** — Post-verification welcome (needs check)
6. **`send-password-reset-email`** — Password reset (DIRECT Brevo call, sender: `noreply@` — BROKEN)

### Group B: Admin/system emails
7. **`user-journey-notifications`** — Profile approved/rejected (uses `sendViaBervo`)
8. **`send-user-notification`** — Generic admin-to-user email (DIRECT Brevo call, sender: `adam.haile@` — should work)
9. **`enhanced-email-delivery`** — Admin generic email sender (uses `sendViaBervo`)
10. **`enhanced-admin-notification`** — Admin notifications (DIRECT Brevo call)
11. **`send-templated-approval-email`** — Approval email template (DIRECT Brevo call, sender: `noreply@` — BROKEN)
12. **`notify-buyer-rejection`** — Rejection notification (uses `sendViaBervo`)
13. **`notify-buyer-new-message`** — New message notification (uses `sendViaBervo`, sender: `notifications@` — BROKEN)
14. **`notify-admin-new-message`** — Admin message notification (uses `sendViaBervo`, sender: `notifications@` — BROKEN)
15. **`send-task-notification-email`** — Task assignment emails (DIRECT Brevo call)

### Group C: Deal/marketplace emails
16. **`send-deal-alert`** — Deal alert notifications (DIRECT Brevo call)
17. **`send-deal-referral`** — Deal referral emails (DIRECT Brevo call, sender: `noreply@` — BROKEN)
18. **`send-memo-email`** — Deal memo emails (uses `sendViaBervo`)
19. **`send-marketplace-invitation`** — Marketplace invitations (uses Resend! Different system entirely, sender: `noreply@`)
20. **`send-owner-inquiry-notification`** — Owner inquiry (DIRECT Brevo call, sender: `adam.haile@`)
21. **`send-owner-intro-notification`** — Owner intro (DIRECT Brevo call, sender: `notifications@` — BROKEN)

### Group D: Legacy agreement emails (may be dead code)
22. **`send-nda-email`** — Legacy NDA sender (DIRECT Brevo call, sender: `noreply@`)
23. **`send-fee-agreement-email`** — Legacy Fee Agreement sender (DIRECT Brevo call, dynamic sender)

### Group E: Automated/scheduled emails
24. **`send-onboarding-day2`** — Day 2 onboarding (DIRECT Brevo call, sender: `noreply@` — BROKEN)
25. **`send-onboarding-day7`** — Day 7 onboarding (DIRECT Brevo call, sender: `noreply@` — BROKEN)
26. **`send-first-request-followup`** — First request follow-up (DIRECT Brevo call, sender: `noreply@` — BROKEN)
27. **`send-data-recovery-email`** — Data recovery (uses Resend, sender: `noreply@`)

### Group F: Feedback/contact emails
28. **`send-feedback-email`** — Feedback email (DIRECT Brevo call)
29. **`send-feedback-notification`** — Feedback admin notification (DIRECT Brevo call)
30. **`send-contact-response`** — Contact form response (DIRECT Brevo call, sender: `noreply@` — BROKEN)

### Group G: Webhook/tracking
31. **`brevo-webhook`** — Delivery tracking webhook receiver

---

## The Fix: Consolidate Everything Through `sendViaBervo`

### Step 1: Fix the shared sender default
Change `brevo-sender.ts` to use `adam.haile@sourcecodeals.com` as the hardcoded default (verified, and matches how you send manually from Brevo). Keep `SENDER_EMAIL` env var as override.

### Step 2: Migrate all 18 direct-Brevo-calling functions to use `sendViaBervo`
Each function that currently does `fetch('https://api.brevo.com/v3/smtp/email', ...)` needs to be converted to import and call `sendViaBervo()`. This gives every function:
- Retry logic with exponential backoff
- Consistent verified sender identity
- Unsubscribe header compliance
- Centralized error handling

Functions to migrate:
1. `send-simple-verification-email`
2. `send-password-reset-email`
3. `send-user-notification`
4. `send-owner-inquiry-notification`
5. `send-owner-intro-notification`
6. `send-onboarding-day2`
7. `send-onboarding-day7`
8. `send-first-request-followup`
9. `send-deal-alert`
10. `send-deal-referral`
11. `send-task-notification-email`
12. `send-templated-approval-email`
13. `send-contact-response`
14. `send-feedback-email`
15. `send-feedback-notification`
16. `send-nda-email`
17. `send-fee-agreement-email`
18. `enhanced-admin-notification`

### Step 3: Fix functions that pass wrong sender even through `sendViaBervo`
- `notify-buyer-new-message`: change fallback from `notifications@` to `adam.haile@`
- `notify-admin-new-message`: change fallback from `notifications@` to `adam.haile@`

### Step 4: Remove Resend-based functions or convert them
- `send-marketplace-invitation` uses Resend SDK — convert to `sendViaBervo`
- `send-data-recovery-email` uses Resend SDK — convert to `sendViaBervo`

### Step 5: Bulk redeploy ALL email functions
Deploy every modified function in one pass.

### Step 6: Send a real test email and verify delivery

## Files Changed (estimate: ~20 edge function files + brevo-sender.ts)

All changes follow the same pattern: replace the direct `fetch('https://api.brevo.com/v3/smtp/email', ...)` block with an `import { sendViaBervo }` + `await sendViaBervo({...})` call, using `adam.haile@sourcecodeals.com` as the verified sender.

