

# Comprehensive Admin Email Routing -- Full Audit & Rebuild

## What We're Building

Rebuild the Admin Routing tab to show a detailed, per-admin breakdown of every email they send or receive, plus a complete map of all 25+ email types across the platform with exact recipient routing.

## Complete Email Audit Results

### Sender Identity
- **All emails** send FROM `adam.haile@sourcecodeals.com` (locked in `email-sender.ts` line 15)
- **Sender name** varies: "Adam Haile - SourceCo" (default), "SourceCo" (most operational), "Adam Haile" (verification), "SourceCo Marketplace" (invitations/referrals)

### Who Receives What

**support@sourcecodeals.com (shared inbox)**:
- New buyer message (notify-support-inbox)
- Admin reply copy (notify-support-inbox)
- Document request (notify-support-inbox)

**ADMIN_NOTIFICATION_EMAIL env var (single address, fallback: admin@sourcecodeals.com)**:
- New user registration (enhanced-admin-notification)
- Listing saved (enhanced-admin-notification)

**ADMIN_NOTIFICATION_EMAILS env var (comma-separated, fallback: adam.haile@sourcecodeals.com)**:
- Admin digest (admin-digest)

**All admins via profiles query (is_admin=true) -- loops through each**:
- Feedback submitted (send-feedback-notification) -- queries profiles.is_admin
- Connection request admin notification (send-connection-notification) -- queries user_roles.admin

**OWNER_INQUIRY_RECIPIENT_EMAIL env var (fallback: adam.haile@sourcecodeals.com)**:
- Owner inquiry from landing page (send-owner-inquiry-notification)

**Specific admin (assigned task recipient)**:
- Task assigned (send-task-notification-email) -- goes to assignee_email
- Deal owner change (notify-deal-owner-change) -- goes to previous deal owner

**Buyer-facing (to individual buyer)**:
- Welcome email (user-journey-notifications: user_created)
- Email verified confirmation (user-journey-notifications: email_verified)
- Profile approved (user-journey-notifications: profile_approved)
- Profile rejected (user-journey-notifications: profile_rejected)
- Verification success (send-verification-success-email)
- Simple verification (send-simple-verification-email)
- Password reset (password-reset)
- Onboarding day 2 (send-onboarding-day2)
- Onboarding day 7 (send-onboarding-day7)
- Connection user confirmation (send-connection-notification: user_confirmation)
- Connection approved (send-connection-notification: approval_notification)
- Agreement NDA/Fee sent (request-agreement-email)
- Agreement confirmed (notify-agreement-confirmed)
- Admin reply notification (notify-buyer-new-message)
- Deal alert (send-deal-alert)
- Deal memo (send-memo-email)
- Marketplace invitation (send-marketplace-invitation)
- Deal referral (send-deal-referral)
- Data room access granted (grant-data-room-access)
- Marketplace buyer approved (approve-marketplace-buyer)
- Feedback response (send-feedback-email)
- User notification (send-user-notification)
- First request followup (send-first-request-followup)
- Contact response (send-contact-response)
- Data recovery (send-data-recovery-email)
- Templated approval (send-templated-approval-email)

**Owner-facing**:
- Owner intro notification (send-owner-intro-notification) -- to listing primary owner

**Deprecated (no longer called)**:
- notify-admin-new-message (previously emailed all admins on new messages)

## Plan

### `src/components/admin/emails/AdminEmailRouting.tsx` -- complete rewrite

Replace current simple routing tables with a comprehensive 4-section layout:

**Section 1: All Platform Emails** -- Master table of every email type, grouped by category (Admin Notifications, Buyer Lifecycle, Deal Flow, Agreements, Messaging, System). Columns: Email Type, Edge Function, Recipient, Sender Name, Reply-To. This is the single source of truth.

**Section 2: Admin-Specific Routing** -- Per-admin card for each admin in ADMIN_PROFILES showing:
- Their email address and title
- Which emails they personally receive (based on env var config and query logic)
- Which emails they send (memo emails use the calling admin's profile)
- Badge for "Shared Inbox Access" if they monitor support@

**Section 3: Shared Inbox** -- Keep existing, unchanged

**Section 4: Environment Variables** -- Show which env vars control routing: `ADMIN_NOTIFICATION_EMAIL`, `ADMIN_NOTIFICATION_EMAILS`, `OWNER_INQUIRY_RECIPIENT_EMAIL`, `ADMIN_EMAIL` -- with current fallback values

### Files changed
- `src/components/admin/emails/AdminEmailRouting.tsx` -- full rewrite with comprehensive routing data

