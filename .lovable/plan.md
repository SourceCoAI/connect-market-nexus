

# Complete Email Architecture Cleanup & Standardization

## Current State

**What's working now:** The `BREVO_API_KEY` was rotated and emails are now arriving. The new unified `sendEmail()` in `email-sender.ts` works correctly.

**The problem:** Only 10 of ~26 email-sending functions use the new `sendEmail()`. The remaining 16+ still use the legacy `sendViaBervo()` from `brevo-sender.ts`, or call Brevo directly. Plus there are 21 stale test `document_requests` records to clean up.

## Inventory

### Already migrated to `sendEmail()` (10 functions — no changes needed)
- `request-agreement-email`
- `send-connection-notification`
- `send-user-notification`
- `send-approval-email`
- `enhanced-email-delivery`
- `user-journey-notifications`
- `notify-deal-owner-change`
- `notify-buyer-new-message`
- `notify-buyer-rejection`
- `notify-admin-new-message`

### Still on legacy `sendViaBervo()` — must migrate (16 functions)
1. `send-transactional-email` (template-based sender)
2. `send-contact-response`
3. `send-feedback-email`
4. `send-marketplace-invitation`
5. `send-deal-referral`
6. `send-simple-verification-email`
7. `send-onboarding-day2`
8. `send-onboarding-day7`
9. `send-templated-approval-email`
10. `send-task-notification-email`
11. `grant-data-room-access`
12. `approve-marketplace-buyer`
13. `notify-deal-reassignment`
14. `send-nda-email` (legacy, should be deleted)
15. `send-fee-agreement-email` (legacy, should be deleted)
16. `send-deal-alert` (likely uses sendViaBervo)

### Direct Brevo API call (bypasses both shared senders)
- `enhanced-admin-notification` — calls `api.brevo.com` directly

## Plan

### Phase 1: Delete stale document_requests
Delete all 21 pending test records from `document_requests` where status is `requested` or `email_sent` and recipient is a test address (`adambhaile00@gmail.com`, `ahaile14@gmail.com`).

### Phase 2: Migrate remaining 14 functions to `sendEmail()`
Each function gets the same change: replace `import { sendViaBervo } from '../_shared/brevo-sender.ts'` with `import { sendEmail } from '../_shared/email-sender.ts'` and adapt the call signature. Functions that also import `email-logger.ts` drop that import (tracking is built into `sendEmail()`).

Functions to migrate:
1. `send-transactional-email`
2. `send-contact-response`
3. `send-feedback-email`
4. `send-marketplace-invitation`
5. `send-deal-referral`
6. `send-simple-verification-email`
7. `send-onboarding-day2`
8. `send-onboarding-day7`
9. `send-templated-approval-email`
10. `send-task-notification-email`
11. `grant-data-room-access`
12. `approve-marketplace-buyer`
13. `notify-deal-reassignment`
14. `enhanced-admin-notification` (direct Brevo call → `sendEmail()`)

### Phase 3: Delete legacy email functions
Delete these edge functions entirely (replaced by `request-agreement-email`):
- `send-nda-email`
- `send-fee-agreement-email`

### Phase 4: Delete legacy shared modules
Once no function imports them:
- Delete `_shared/brevo-sender.ts`
- Delete `_shared/email-logger.ts`

### Phase 5: Deploy all changed functions

## What this achieves
- Every email in the platform goes through one sender (`sendEmail()`) with one verified identity (`adam.haile@sourcecodeals.com`)
- Every email is tracked in `outbound_emails` + `email_events`
- No more fragmented sender identities or orphaned code paths
- Legacy dead code is removed

## Files changed
- 14 edge function `index.ts` files (migrate to `sendEmail()`)
- 2 edge function directories deleted (`send-nda-email`, `send-fee-agreement-email`)
- 2 shared files deleted (`brevo-sender.ts`, `email-logger.ts`)
- Database: delete stale `document_requests` rows

