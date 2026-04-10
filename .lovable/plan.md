

# Audit: Connection Request Flow -- Current State

## Verified Fixed (all entry points)

### 1. ConnectionRequestEmailDialog.tsx
- Wide modal (`sm:max-w-4xl`) with full email wrapper simulation (SourceCo logo, warm background, footer)
- First-person voice when a named admin is selected ("I will be in touch")
- Third-person for generic support@ sender
- "Access" not "introductions" in rejection copy
- No "do not reply" language
- Edit/reset body functionality
- Admin comment saved and forwarded

### 2. connection-request-actions/index.tsx
- Line 74: `comment` is correctly passed to `handleAccept` and `handleReject` (no underscore prefix)

### 3. useConnectionRequestActions.ts
- Line 123: Guard is `if (buyerEmail)` -- no `listingId` requirement -- General Inquiries send emails
- Line 88: `adminComment` passed as `notes` to `updateStatus.mutateAsync`
- Sender info correctly resolved from `DEAL_OWNER_SENDERS`

### 4. WebflowLeadDetail.tsx
- Line 75-143: Fully reworked -- comment forwarded to `updateStatus.mutate({ notes: comment })`, no `listingId` guard, sender info resolved and passed to both approval and rejection edge functions

### 5. AdminRequests.tsx
- Line 243-320: `listingId` uses `|| undefined` (not empty string), sender resolved from `DEAL_OWNER_SENDERS`, custom body forwarded, admin comment saved

### 6. notify-buyer-rejection edge function
- Line 22: "We limit access to a small number of buyers" (not "introductions")
- Custom body text splits by double-newlines into proper `<p>` tags

### 7. send-connection-notification edge function
- `listingId` is optional in the interface
- First-person body for named senders ("I will be in touch")
- Custom body text uses paragraph-level formatting
- `listingUrl` falls back to marketplace when no listingId

### 8. admin-profiles.ts
- Adam Haile is in `DEAL_OWNER_SENDERS` (line 90)

## One Concern: Edge Function Deployment

There are **zero logs** for `send-connection-notification` in the recent log window. This could mean:
- Nobody has triggered an approval since the last deploy (most likely)
- Or the function needs a fresh deploy to pick up the latest code changes

**Recommendation**: Before testing, redeploy both `send-connection-notification` and `notify-buyer-rejection` to ensure the running code matches the source.

## Bottom Line

All code is correct across all three admin entry points (side panel, main requests page, webflow detail). The only action needed is confirming the edge functions are deployed with the latest code, then testing end-to-end.

