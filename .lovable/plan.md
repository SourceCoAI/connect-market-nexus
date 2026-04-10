

# Elevate Connection Request Email Dialog - Final Design Pass

## Issues Found

1. **Third-person voice when sending as an admin**: Copy says "Bill Martin will be in touch shortly" even when Bill is the one sending. Should say "I will be in touch shortly" when a named admin is selected, and use third-person only for the generic support@ sender.

2. **Adam Haile missing from DEAL_OWNER_SENDERS**: He's in ADMIN_PROFILES but not in the sender dropdown.

3. **Edge function has same third-person issue**: Default body says "[senderName] will be in touch" -- needs "I" when a named sender.

4. **Modal could be wider and more refined**: Push to `sm:max-w-4xl` for a true full-width email preview feel. The email card should feel like a real rendered email with the SourceCo logo header.

5. **Email preview doesn't show the full email wrapper**: The buyer will receive an email wrapped in the `wrapEmailHtml` template (with SourceCo logo, background, card layout). The preview only shows the body content. Showing a mini version of the full email would be more accurate and impressive.

6. **EmailTestCentre still has stale "exclusive introduction" copy**: Minor, but should be cleaned.

## Changes

### 1. `src/lib/admin-profiles.ts`
- Add Adam Haile to `DEAL_OWNER_SENDERS` array

### 2. `src/components/admin/ConnectionRequestEmailDialog.tsx`
- Widen to `sm:max-w-4xl`
- Switch to first-person voice when a named admin (non-support@) is selected:
  - "I will be in touch shortly with next steps" instead of "[Name] will be in touch"
  - "I will reach out to coordinate next steps" instead of "[Name] from our team will reach out"
- Add a mini SourceCo logo at the top of the email preview card to simulate the real email wrapper
- Add the footer "SourceCo 2026" at the bottom of the preview card
- Improve the email card styling: subtle warm background (`#FAFAF8`) behind the card to simulate the email wrapper background
- Increase overall polish: slightly more padding, cleaner spacing
- `defaultBody` text must also use first-person for named senders

### 3. `supabase/functions/send-connection-notification/index.ts`
- Accept a `useFirstPerson` flag (or derive from senderEmail != support@)
- Default body uses "I" when sender is a named admin, "[Name]" when support@
- This ensures the actually-sent email matches the preview

### 4. `src/pages/admin/AdminRequests.tsx`
- Pass `useFirstPerson` or let the edge function derive it from senderEmail

### 5. `src/pages/admin/EmailTestCentre.tsx`
- Update stale "exclusive introduction" copy to "exclusive opportunity"

## Files Changed

| File | Change |
|------|--------|
| `src/lib/admin-profiles.ts` | Add Adam Haile to DEAL_OWNER_SENDERS |
| `src/components/admin/ConnectionRequestEmailDialog.tsx` | Widen to 4xl, first-person voice for named senders, SourceCo logo in preview, refined design |
| `supabase/functions/send-connection-notification/index.ts` | First-person body when sender is a named admin |
| `src/pages/admin/EmailTestCentre.tsx` | Fix stale "exclusive introduction" copy |

Edge function must be redeployed after changes.

