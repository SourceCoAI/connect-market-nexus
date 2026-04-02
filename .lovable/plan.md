

# Verify & Redeploy All Email-Sending Edge Functions

## Assessment

All existing email functions are deployed and reachable. The code in the repo is correct — the three critical user-facing email functions are:

1. **`send-connection-notification`** — handles buyer confirmation, admin notification, and approval notification emails. Uses `sendViaBervo`. Last successful send: March 19.
2. **`user-journey-notifications`** — handles welcome, email verified, account approved/rejected emails. Uses `sendViaBervo`. Last successful send: April 1.
3. **`send-approval-email`** — admin-triggered approval email. Calls Brevo directly (not via `sendViaBervo`). Last successful send: March 31.

These all worked before and the code hasn't changed. However, the **shared dependencies** they import (`brevo-sender.ts`, `cors.ts`, `auth.ts`, `email-logger.ts`) were recently modified. Edge functions bundle shared code at deploy time, so the deployed versions may be running stale shared code. To guarantee consistency, all email functions should be redeployed.

Additionally, `send-approval-email` bypasses `sendViaBervo` entirely — it calls Brevo's API directly without retry logic, unsubscribe checks, or List-Unsubscribe headers. This should be migrated.

## Plan

### Step 1: Migrate `send-approval-email` to use `sendViaBervo`
Replace the direct `fetch('https://api.brevo.com/v3/smtp/email', ...)` call in `send-approval-email/index.ts` with `sendViaBervo()`. This gives it retry logic, unsubscribe compliance, and consistent error handling — matching every other email function.

### Step 2: Redeploy all email-sending edge functions
Deploy all functions that send email so they pick up the latest shared dependencies:
- `send-connection-notification`
- `user-journey-notifications`
- `send-approval-email`
- `request-agreement-email`
- `brevo-webhook`
- `notify-buyer-rejection`
- `notify-deal-owner-change`
- `notify-deal-reassignment`
- `notify-new-deal-owner`
- `send-memo-email`
- `grant-data-room-access`

### Step 3: Smoke-test the three critical paths
Use `curl_edge_functions` to verify each function boots correctly and returns expected error shapes (auth required, missing fields, etc.).

## Files Changed
- **`supabase/functions/send-approval-email/index.ts`** — Replace direct Brevo fetch with `sendViaBervo` import/call

## No Other Code Changes
The `send-connection-notification`, `user-journey-notifications`, and all other email functions already have correct code. They just need redeployment.

