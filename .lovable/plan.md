
# Phase 6: Navbar, Auth Pages, Modals & Cross-Cutting — Mobile Optimization

## Audit Summary

Tested Navbar, auth pages (Login, Welcome, Signup, ForgotPassword, PendingApproval), notification popovers, AgreementAlertModal, and DealSourcingCriteriaDialog at 375px viewport.

## Issues Found

### Issue 1: NavbarLogo — "Marketplace" Text Crowds on Mobile
**File:** `src/components/navbar/NavbarLogo.tsx` line 17-19
Logo text "SourceCo Marketplace" takes ~200px. Combined with avatar + bell icon on 375px, the middle gap disappears or elements wrap.

**Fix:** Hide "Marketplace" text on mobile: `<span className="text-xl text-muted-foreground ml-1 font-light hidden sm:inline">Marketplace</span>`

### Issue 2: MobileNavItems — Uses Old Lucide Icons Instead of Custom NavIcons
**File:** `src/components/navbar/MobileNavItems.tsx` lines 3, 29, 38, 45, 56
Desktop nav uses custom `NavIcons` (`MarketplaceIcon`, `SavedIcon`, etc.) but mobile menu uses generic Lucide icons (`Store`, `Heart`, `Briefcase`, `MessageSquare`). Visual inconsistency.

**Fix:** Import and use the same `NavIcons` from `@/components/icons/NavIcons` to match desktop nav. Not a layout break, but a polish item.

### Issue 3: BuyerNotificationBell Popover Width
**File:** `src/components/buyer/BuyerNotificationBell.tsx` line 183
`w-80 sm:w-96` — on 375px, `w-80` (320px) leaves only 55px for margins. The popover uses `align="end"` so it can overflow left.

**Fix:** Change to `w-[calc(100vw-2rem)] sm:w-96` to ensure it never overflows the viewport.

### Issue 4: AgreementAlertModal — `p-8` Padding Excessive on Mobile
**File:** `src/components/buyer/AgreementAlertModal.tsx` line 41
`p-8` (32px) on a forced-open modal leaves only ~311px of content width on 375px.

**Fix:** Change to `p-5 sm:p-8`.

### Issue 5: AgreementAlertModal — Title `text-2xl` + Description `text-base` Large on Mobile
**File:** `src/components/buyer/AgreementAlertModal.tsx` lines 52, 57
Title and description are fine for desktop but push the CTA button below the fold on 375px.

**Fix:** Change title to `text-xl sm:text-2xl`, description to `text-sm sm:text-base`.

### Issue 6: PendingApproval — CardTitle `text-2xl` Long Text Overflows
**File:** `src/pages/PendingApproval.tsx` line 180
Title "You're in the queue — sign an agreement for immediate access" at `text-2xl` wraps to 4+ lines on mobile.

**Fix:** Change to `text-lg sm:text-2xl`.

### Issue 7: PendingApproval — No Horizontal Padding on Mobile
**File:** `src/pages/PendingApproval.tsx` line 161
The `max-w-md` container has no `px` padding, so on 375px it touches screen edges.

**Fix:** Add `px-4` to the container: `<div className="w-full max-w-md space-y-6 px-4">`

### Issue 8: Welcome Page — Right Content `pr-8` Unnecessary on Mobile
The right panel is `hidden lg:flex` so this doesn't affect mobile. No fix needed.

### Issue 9: AuthLayout, Login, ForgotPassword, DealSourcingCriteriaDialog
All already responsive. No fixes needed.

## Files Changed

| File | Change |
|------|--------|
| `src/components/navbar/NavbarLogo.tsx` | Hide "Marketplace" text on mobile |
| `src/components/navbar/MobileNavItems.tsx` | Use custom NavIcons for consistency |
| `src/components/buyer/BuyerNotificationBell.tsx` | Viewport-safe popover width |
| `src/components/buyer/AgreementAlertModal.tsx` | Responsive padding and text sizes |
| `src/pages/PendingApproval.tsx` | Smaller title, add container padding |

## Implementation Order

1. NavbarLogo hide "Marketplace" on mobile
2. MobileNavItems use NavIcons
3. BuyerNotificationBell popover width
4. AgreementAlertModal responsive padding + text
5. PendingApproval title size + container padding
