

# Assessment: Plan Was Implemented — But 4 Additional Locations Were Missed

## What Was Implemented (Confirmed)

All 5 items from the plan are done:

| Plan Item | Status |
|-----------|--------|
| Memo filtering in BuyerDataRoom by access level | Done (lines 158-163) |
| Sidebar gate changed to `connectionApproved` only | Done (line 68) |
| BlurredFinancialTeaser copy softened to "deal materials" | Done |
| Approval message toned down in useConnectionRequestActions | Done (line 92) |
| ConnectionButton copy changed to "deal materials" | Done (line 190) |

## What Was Missed — 4 Additional Locations Still Over-Promise

### 1. `src/pages/ListingDetail.tsx` (line 336)
> "Request a connection to unlock the data room. Once approved, you get immediate access to the CIM, real company name, and full business details."

This is the CTA paragraph above the sidebar actions on the listing page. Still promises CIM, real company name, full details.

**Fix:** Change to "Request a connection to receive deal materials from the advisor."

### 2. `src/components/marketplace/AgreementStatusBanner.tsx` (line 64)
> "A signed Fee Agreement is required to request deal access and unlock the data room."

This banner appears when a buyer hasn't signed the fee agreement. Since we now allow teaser access without fee agreement, this copy is misleading — they CAN request access and see the teaser without a fee agreement.

**Fix:** Change to "A signed Fee Agreement is required to unlock full deal materials and request introductions."

### 3. `supabase/functions/notify-agreement-confirmed/index.ts` (line 97)
> "You now have full access to browse deals, request introductions, and access the data room on approved deals."

This email is sent when an agreement is confirmed. It promises "access the data room" which over-promises — admin toggles still control what they see.

**Fix:** Change to "You now have full access to browse deals, request introductions, and receive deal materials on approved deals."

### 4. `supabase/functions/grant-data-room-access/index.ts` (lines 173-174)
> "The data room contains deal details, supporting documentation, and diligence materials."

This email is sent when data room access is explicitly granted. The language is acceptable since it's sent after admin grants access, but "deal details, supporting documentation, and diligence materials" may over-promise if the buyer only got teaser access.

**Fix:** Change to "Deal materials have been made available for your review. Your access link is personal — do not share or forward it. All access is tracked."

## Files to Change

| File | Change |
|------|--------|
| `src/pages/ListingDetail.tsx` | Update CTA copy (line 336) |
| `src/components/marketplace/AgreementStatusBanner.tsx` | Update banner copy (line 64) |
| `supabase/functions/notify-agreement-confirmed/index.ts` | Update email copy (line 97) |
| `supabase/functions/grant-data-room-access/index.ts` | Update email copy (lines 173-174) |

## No Other Gaps Found

The core access logic (toggles, auto-provisioning, fee-agreement trigger, download checks, memo filtering, sidebar gate) is all correctly implemented.

