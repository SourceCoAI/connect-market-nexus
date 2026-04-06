

# Add Cooldown to "Request Documents" Button on Pending Approval

## Current State

- The `handleRequestBothDocuments` function calls `sendAgreementEmail` for both NDA and Fee Agreement
- It inserts into `document_requests` table with `status: 'requested'` — admin dashboard tracks these correctly via the Document Tracking page
- **No cooldown exists** — after the request completes, the button is immediately clickable again, allowing spam

## Changes

### File: `src/pages/PendingApproval.tsx`

1. **Add cooldown state**: `docCooldown` boolean + `cooldownSeconds` number (counts down from 120)
2. **After successful request**: Set `docCooldown = true`, start a countdown interval from 120 to 0, then reset
3. **Button text changes**:
   - During request: "Sending..." (existing)
   - After success, during cooldown: "Documents requested — request again in 1:45"
   - After cooldown expires: back to "Request Documents via Email"
4. **Button disabled** during both `isRequestingDocs` and `docCooldown`
5. **Show confirmation text** below button when cooldown is active: "Check your email for the NDA and Fee Agreement." (replaces the "One signature covers..." text during cooldown)

No other files need changes — the admin tracking already works correctly via the `document_requests` table insert in the edge function.

## Files Changed

| File | Change |
|------|--------|
| `src/pages/PendingApproval.tsx` | Add 2-minute cooldown timer after successful document request |

