

# Phase 38: Mobile Responsive — Filter Panel Sheet + Layout Fixes

## Issue Found

On mobile (375px), the marketplace filter panel renders inline as a full-width card above the listing grid, forcing users to scroll past 5 filter fields before seeing any listings. This is a significant UX problem.

## What Works (Verified via Browser Testing)

| Page | Status |
|------|--------|
| Login | Clean, centered form |
| Marketplace listing cards | Well-formatted, readable |
| My Deals | Stacks vertically, detail below list |
| Messages | Chat layout works, input bar at bottom |
| Profile | Tabs scrollable, form fields full-width |
| Saved Listings | Empty state clean |
| User menu dropdown | Renders properly |
| Navbar | Logo + avatar + bell all fit |

## Fix Required

**Marketplace filter panel** — hide behind a Sheet drawer on mobile screens (`< lg` breakpoint).

### Changes

**File 1: `src/pages/Marketplace.tsx`**
- Import `Sheet`, `SheetContent`, `SheetTrigger`, `SheetHeader`, `SheetTitle` from `@/components/ui/sheet`
- Import `useIsMobile` from `@/hooks/use-mobile`
- Add a "Filters" button visible only on mobile (`lg:hidden`) above the listings grid
- Wrap `FilterPanel` in a `Sheet` on mobile that slides in from the left
- Keep the existing inline filter sidebar for desktop (`hidden lg:block`)
- Change the grid from `grid-cols-1 lg:grid-cols-4` to just `lg:grid-cols-4` with the sidebar column hidden on mobile

### Implementation Detail

```text
Mobile layout:
  [Filters button]  ← triggers Sheet
  [Listing cards]

Desktop layout (unchanged):
  [FilterPanel sidebar] [Listing cards x3]
```

The FilterPanel component itself stays unchanged — it just gets rendered inside a Sheet on mobile instead of inline.

## Files Changed

| File | Change |
|------|--------|
| `src/pages/Marketplace.tsx` | Add mobile Sheet wrapper for FilterPanel, add "Filters" toggle button |

