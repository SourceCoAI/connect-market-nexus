

# Fix: Guide Users to Exact Missing Fields on Profile Page

## Problem

When a buyer clicks "Complete Profile (73%)" from a listing card, they land on `/profile` with a big form and no idea which fields need filling. The missing-field info exists in `ConnectionButton` (on the listing detail page) but is completely absent from the Profile page itself.

## Solution

Add a **completion banner** at the top of the Profile form that:
1. Shows the completion percentage and a progress bar
2. Lists the exact missing fields by name (e.g., "Phone", "Search Stage", "Acquisition Equity")
3. Auto-scrolls to / highlights the first missing field
4. Disappears once the profile is 100% complete

Also pass `?incomplete=true` query param from the listing card and listing detail "Complete My Profile" links so the banner can appear prominently when arriving from that flow.

## Changes

### File 1: `src/pages/Profile/ProfileForm.tsx`

- Import `getMissingFieldLabels`, `getProfileCompletionPercentage`, `isProfileComplete` from `profile-completeness`
- Add a banner component at the top of the form (inside `<CardContent>`, before the form fields) that:
  - Shows an amber alert box with `AlertCircle` icon: "Complete these fields to unlock deal access"
  - Lists each missing field as a bullet
  - Shows a progress bar with percentage
  - Only renders when profile is incomplete
- Add `required` red asterisk styling to labels of fields that are in the missing list

### File 2: `src/components/listing/ListingCardActions.tsx` (line 157)

- Change `<Link to="/profile">` → `<Link to="/profile?tab=profile&complete=1">`

### File 3: `src/components/listing-detail/ConnectionButton.tsx` (line 170-175)

- Change `<Link to="/profile">` → `<Link to="/profile?tab=profile&complete=1">`

### Technical Details

- Reuses existing `getMissingFieldLabels(user)` and `getProfileCompletionPercentage(user)` — no new logic needed
- The banner is always visible when fields are missing, regardless of query param (the param just ensures the correct tab is active)
- Missing field labels come from `FIELD_LABELS` map — already human-readable

