

# Phase 8: Profile Page — Mobile Optimization

## Audit Summary

Audited at 375px: Profile index, ProfileForm, ProfileSettings, ProfileDocuments, ProfileTeamMembers, ProfileSecurity, DealAlertsTab, DealAlertCard.

## Issues Found

### Issue 1: DealAlertCard Header Overflows on Mobile
**File:** `src/components/deal-alerts/DealAlertCard.tsx` lines 64-90
The header has `flex items-start justify-between` with left side (checkbox + icon + title) and right side (badge + switch). On 375px with card padding, title like "My Custom Alert Name" pushes badge+switch off-screen. The criteria text (line 95) with bullet-separated parts also overflows.

**Fix:** Stack the header on mobile. Change the outer div to `flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2`. Move badge+switch to wrap below title on mobile. Also stack the footer actions (lines 97-126) — the "Created" date + Edit/Delete buttons overflow on mobile.

### Issue 2: DealAlertsTab Toolbar Overflows on Mobile
**File:** `src/components/deal-alerts/DealAlertsTab.tsx` lines 144-178
The `flex items-center justify-between` row has Select All + count on left, bulk delete + active/paused count on right. On 375px this is too wide.

**Fix:** Stack to `flex flex-col gap-2` on mobile: `flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2`.

### Issue 3: ProfileTeamMembers Invite Form — Button Below Input on Mobile
**File:** `src/pages/Profile/ProfileTeamMembers.tsx` line 189
`flex items-end gap-3` keeps the input and "Send Invite" button side by side. On 375px, the button gets crushed.

**Fix:** Change to `flex flex-col sm:flex-row sm:items-end gap-3`. Make the button full-width on mobile.

### Issue 4: ProfileDocuments — Document Row Cramped on Mobile
**File:** `src/pages/Profile/ProfileDocuments.tsx` line 175
`flex items-center justify-between py-4` — the label "Non-Disclosure Agreement (NDA)" plus status dots plus the Request/Resend button can get tight. The timestamp in the status line (line 189-193) can wrap awkwardly.

**Fix:** Hide timestamp on mobile using `hidden sm:inline` on the dot separator and timestamp span. This keeps the status clean.

### Issue 5: ProfileSecurity — Deactivation Dialog Footer Buttons Stack
**File:** `src/pages/Profile/ProfileSecurity.tsx` line 186
`DialogFooter` already stacks on mobile by default (Shadcn behavior). No fix needed.

### Issue 6: ProfileForm — Container Padding Already Handled
The profile page uses `container max-w-4xl py-8` which provides responsive padding. The form uses `grid-cols-1 md:grid-cols-2` which is already mobile-first. No padding issues.

### Issue 7: Profile Tabs — Already Fixed in Phase 4
Tabs already use `flex-wrap h-auto gap-1` and short mobile labels. No fix needed.

## Files Changed

| File | Change |
|------|--------|
| `src/components/deal-alerts/DealAlertCard.tsx` | Stack header and footer on mobile |
| `src/components/deal-alerts/DealAlertsTab.tsx` | Stack toolbar on mobile |
| `src/pages/Profile/ProfileTeamMembers.tsx` | Stack invite form on mobile |
| `src/pages/Profile/ProfileDocuments.tsx` | Hide timestamp on mobile for cleaner rows |

## Implementation Order

1. DealAlertCard header + footer stacking
2. DealAlertsTab toolbar stacking
3. ProfileTeamMembers invite form stacking
4. ProfileDocuments timestamp hiding

