

# Phase 100: Remaining Copy & UX Gaps in Connection Request Lifecycle

## Verification: All Phases 86-99 Implemented Correctly

Every phase has been verified in the codebase:
- **Phase 86**: Realtime `user_id` filter in place, admin toasts suppressed
- **Phase 87**: `user_notifications` inserted on approve/reject in individual actions
- **Phase 88**: `admin_notification` type bypasses auth in `send-connection-notification`
- **Phase 90**: Approval email CTA points to `/my-deals`
- **Phase 93**: Bulk actions send emails, notifications, and system messages
- **Phase 94**: Undo inserts system message + notification
- **Phase 95/97**: On Hold button on pending, Accept/Decline on on_hold banner
- **Phase 99**: Rejection copy softened in `ConnectionButton`, `DealStatusSection`, and `notify-buyer-rejection`

## Two Remaining Issues Found

### Issue 1: `DealActionCard.tsx` still uses old rejection/approval copy (Phase 99 missed this file)

**Line 42-43**: `"The owner has chosen another buyer for this opportunity. This reflects deal-specific fit, not your qualifications."`
Should match Phase 99 neutral language: `"This opportunity is no longer available at this time. This reflects deal-specific fit, not your qualifications."`

**Line 66-67**: `"Great news — the owner selected your firm..."` — This is the *approved* state and is accurate (the owner did select them), so no change needed.

### Issue 2: `DealStatusSection.tsx` has no `on_hold` stage explanation

`getCurrentStageIndex` doesn't handle `on_hold` — it falls through to pending logic (stage 1 or 2 based on NDA/fee status). The stage explanation then says "Sign your NDA" or "being presented to the owner" which may be misleading for an on-hold request. Should show a distinct message like "Your request is being evaluated — we'll update you shortly."

## Changes

**1. `DealActionCard.tsx` (line 42-43)** — Update rejected description to neutral copy matching Phase 99.

**2. `DealStatusSection.tsx`** — Add `on_hold` handling in both `getCurrentStageIndex` (return stage 2 regardless of NDA/fee) and `getStageExplanation` (add on_hold-specific message).

Two files, two small edits. No edge function changes needed.

