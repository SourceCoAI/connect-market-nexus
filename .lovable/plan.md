

# Add Admin Email Routing Tab to Email Dashboard

## What We're Building

A new "Admin Routing" tab on the Email Dashboard that shows a complete overview of which admin emails receive which notifications. This tab displays each admin from `ADMIN_PROFILES` along with the email types they receive, auto-derived from the actual edge function code logic.

## Current State

- The Email Dashboard has two tabs: "Delivery Log" and "Email Catalog"
- Admin notification emails go to two destinations:
  - `support@sourcecodeals.com` (shared inbox) -- messages, document requests, admin replies (via `notify-support-inbox`)
  - `ADMIN_NOTIFICATION_EMAIL` env var / hardcoded admin emails -- new user registrations, connection requests, listing saves
  - Individual admin emails -- deprecated `notify-admin-new-message` (no longer called)

## Design

A new third tab "Admin Routing" with:

1. **Shared Inbox card** -- `support@sourcecodeals.com` with the list of email types it receives (new messages, document requests, admin replies)

2. **Individual Admin table** -- Each admin from `ADMIN_PROFILES` with their name, title, and email. A column showing which notification types they receive (currently: env-var driven for `enhanced-admin-notification`, `admin-digest`, `send-feedback-notification`, `send-connection-notification` admin variant)

3. **Self-updating** -- The routing data is defined as a static config in the component (mirroring the actual edge function logic). When edge functions change, the config is updated alongside. No database query needed -- this is a reference/documentation view.

## Changes

### `src/components/admin/emails/AdminEmailRouting.tsx` -- new component

- Import `ADMIN_PROFILES` from `src/lib/admin-profiles.ts`
- Define a `ROUTING_CONFIG` array mapping each notification type to its destination (shared inbox or individual admins)
- Render two sections:
  - **Shared Inbox** card showing `support@sourcecodeals.com` and which notifications it gets
  - **Admin Profiles** table showing each admin, their role, and which emails route to them individually (if any)
- Clean minimal design consistent with the existing dashboard

### `src/pages/admin/EmailDashboardPage.tsx`

- Add a third tab "Admin Routing" alongside "Delivery Log" and "Email Catalog"
- Import and render `AdminEmailRouting` in the new tab

### Files changed
- `src/components/admin/emails/AdminEmailRouting.tsx` -- new component
- `src/pages/admin/EmailDashboardPage.tsx` -- add tab

