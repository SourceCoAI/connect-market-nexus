

# Fix Email Links + Redesign Profile Documents Tab

## Issues Found

1. **Message notification email** (`notify-buyer-new-message`) links to `/my-requests` (line 69) -- should link to `/my-deals` directly (the redirect works, but the URL is outdated)
2. **Profile Documents banner** says "Sign and return to adam.haile@sourcecodeals.com" -- should say `support@sourcecodeals.com` since we migrated operational emails
3. **Profile Documents tab** uses Card/Badge components with colored borders that don't match the Quiet Luxury minimal aesthetic used elsewhere
4. **Request timestamps** are available in the data (`requestedAt`) but not displayed in the Documents tab -- users should see when they requested each document

## Changes

### 1. `supabase/functions/notify-buyer-new-message/index.ts` -- Fix CTA link

Change line 69 from:
```
const loginUrl = 'https://marketplace.sourcecodeals.com/my-requests';
```
to:
```
const loginUrl = 'https://marketplace.sourcecodeals.com/my-deals';
```

Deploy the function.

### 2. `src/pages/Profile/ProfileDocuments.tsx` -- Redesign + sync timestamps

**Fix support email**: Change "adam.haile@sourcecodeals.com" to "support@sourcecodeals.com" in the pending banner.

**Redesign to match Quiet Luxury aesthetic**: Replace Card/Badge-heavy layout with clean, minimal rows using the same pattern as the listing sidebar Documents section:
- Remove Card wrapper, use whitespace-based separation
- Each document row: icon + name on left, status + timestamp on right
- Status shown as subtle text (not colored badges): "Signed", "Sent to email", "Not requested"
- Small emerald dot for signed, hollow dot for sent, no dot for not requested
- Show request timestamp: "Requested Mar 28, 2026" below status when available
- Show signed timestamp: "Signed Mar 30, 2026" when available
- Resend / Request buttons remain but styled as minimal text buttons, not outlined badges
- Remove the redundant "Complete" badge on the right side (the signed status on the left is sufficient)
- Pending banner: softer styling, remove amber border, use subtle background

### 3. Verify other email CTAs link correctly

- `notify-agreement-confirmed` links to `/marketplace` -- correct (browse deals after signing)
- `request-agreement-email` -- no app link in body (just instructions to reply) -- correct
- `send-connection-notification` approval links to `/my-deals` -- correct

### Files changed
- `supabase/functions/notify-buyer-new-message/index.ts` -- fix link URL
- `src/pages/Profile/ProfileDocuments.tsx` -- redesign + fix email + show timestamps
- Deploy `notify-buyer-new-message`

