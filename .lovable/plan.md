

## Problem

Currently, users with `buyer_tier === 4` (Unverified) are completely blocked from viewing the Marketplace. The user wants a different behavior:

- **Approved users can always browse and preview deals** on the Marketplace
- **Requesting access to a deal (connection request) requires a complete profile** -- the gate moves from the Marketplace page to the "Request Full Deal Details" button

## Solution

### 1. Remove the Tier 4 full-page block from Marketplace

In `src/pages/Marketplace.tsx`, remove the tier 4 gate (lines 170-189) that blocks the entire Marketplace view. All approved users will now see deal listings regardless of profile completeness.

### 2. Add profile completeness check to ConnectionButton

In `src/components/listing-detail/ConnectionButton.tsx`, before opening the connection request dialog, check if the user's profile is complete. If not, show a prompt directing them to `/profile` instead of allowing the request.

**Profile completeness logic**: A helper function `isProfileComplete` will check required fields based on the user's `buyer_type`, leveraging the existing field mappings in `src/lib/buyer-type-fields.ts`. Required fields include:

- **All buyers**: first_name, last_name, company, phone_number, buyer_type, ideal_target_description, business_categories (at least 1), target_locations (at least 1)
- **Buyer-type-specific fields**: The critical financial fields defined per buyer type (e.g., fund_size for PE, estimated_revenue + deal_size_band for corporate, etc.) -- matching signup validation requirements

### 3. Create a profile completeness utility

A new file `src/lib/profile-completeness.ts` will export:
- `isProfileComplete(user)` -- returns boolean
- `getProfileCompletionPercentage(user)` -- returns 0-100 number
- `getMissingRequiredFields(user)` -- returns list of missing field labels

This centralizes the logic so it can be reused by `ConnectionButton`, `BuyerProfileStatus`, and `InvestmentFitScore`.

### 4. Show incomplete profile state in ConnectionButton

When profile is incomplete, instead of the "Request Full Deal Details" button, show:
- A warning card explaining profile completion is required
- A "Complete My Profile" link to `/profile`
- The completion percentage

## Files to Change

| File | Change |
|------|--------|
| `src/lib/profile-completeness.ts` | **New file** -- centralized profile completeness logic using buyer-type field mappings |
| `src/pages/Marketplace.tsx` | Remove the tier 4 full-page gate (lines 170-189) |
| `src/components/listing-detail/ConnectionButton.tsx` | Add profile completeness check; show "Complete Profile" prompt when incomplete instead of the request button |

## How It Works (User Flow)

1. User logs in with an approved account but incomplete profile
2. They see the Marketplace with all deal listings (no gate)
3. They click into a deal and see details
4. When they try to request access, they see: "Complete your profile to request deal access" with a link to their profile page and a progress indicator
5. After completing their profile, the request button becomes active
