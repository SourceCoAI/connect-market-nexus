

# Phase 3: Listing Detail — Mobile Optimization

## Issues Found

### Issue 1: EnhancedFinancialGrid — 4 Columns Overflow on Mobile
**File:** `src/components/listing-detail/EnhancedFinancialGrid.tsx` line 18
The grid uses `grid-cols-4` / `grid-cols-3` with no responsive breakpoint. On 375px, 4 columns of financial metrics are each ~80px wide — values like "$1,250,000" overflow or wrap badly.

**Fix:** Add responsive prefix: `grid-cols-2 sm:grid-cols-4` (and `sm:grid-cols-3` for 3 metrics). Keep `gap-8` on desktop, reduce to `gap-4` on mobile.

### Issue 2: ListingHeader Title Font Size Too Large on Mobile
**File:** `src/components/listing-detail/ListingHeader.tsx` line 82
Title uses `!text-[30px] !leading-[38px]`. Long listing titles wrap to 4+ lines on 375px.

**Fix:** Change to `!text-[22px] sm:!text-[30px] !leading-[28px] sm:!leading-[38px]`.

### Issue 3: Hero Image Height Fixed at h-56 — Too Tall on Mobile
**File:** `src/components/listing-detail/ListingHeader.tsx` line 61
`h-56` (224px) takes over 60% of the viewport on 375px, pushing all content below the fold.

**Fix:** Change to `h-40 sm:h-56`.

### Issue 4: ListingHeader Location Row Wraps Poorly on Mobile
**File:** `src/components/listing-detail/ListingHeader.tsx` line 92
`flex items-center gap-3 flex-wrap` works but `gap-3` is generous. On mobile, location + categories + "Listed Xd ago" stack with too much vertical gap.

**Fix:** Change to `gap-2 sm:gap-3`.

### Issue 5: Sidebar Cards p-6 Padding Excessive on Mobile
**File:** `src/pages/ListingDetail.tsx` lines 330, 389, 419
Multiple sidebar cards use `p-6` (24px). On mobile where sidebar stacks below main content, this is fine for readability but consistent with Phase 1 fix pattern.

**Fix:** Change to `p-4 sm:p-6` on all three sidebar card containers.

### Issue 6: "Exclusive Deal Flow" Card Has mt-6 Inside Creating Top Gap
**File:** `src/pages/ListingDetail.tsx` line 390
The second sidebar card has `<div className="mt-6 pt-4 border-t ...">` as its first child, creating a dead space at the top of the card on mobile.

**Fix:** Change to `mt-4 sm:mt-6 pt-3 sm:pt-4`.

### Issue 7: Similar Listings Carousel — Cards min-w Too Wide
**File:** `src/components/listing-detail/SimilarListingsCarousel.tsx` line 27
Loading skeleton uses `min-w-[320px]` which overflows on 375px (375 - padding = ~327px).

**Fix:** Change to `min-w-[280px] sm:min-w-[320px]`.

### Issue 8: BlurredFinancialTeaser — Inner Grid 3 Columns on Mobile
**File:** `src/components/listing-detail/BlurredFinancialTeaser.tsx` line 43
The blurred preview uses `grid-cols-3` which is fine since it's decorative/blurred, but the CTA text and button should be checked. The `px-6` on the overlay (line 59) is tight on 375px.

**Fix:** Change to `px-4 sm:px-6`.

### Issue 9: ListingSidebarActions Inline Chat Textarea Takes Too Much Space
**File:** `src/components/listing-detail/ListingSidebarActions.tsx` line 460
`min-h-[80px]` for the textarea is reasonable but on mobile within the sidebar it's fine. No change needed.

### Issue 10: DealSourcingCriteriaDialog Already Responsive
This dialog already uses `max-w-[92vw]` and responsive text sizes. No changes needed.

## Files Changed

| File | Change |
|------|--------|
| `src/components/listing-detail/EnhancedFinancialGrid.tsx` | Responsive grid-cols-2 on mobile, smaller gap |
| `src/components/listing-detail/ListingHeader.tsx` | Smaller title font, shorter hero image, tighter location row gap |
| `src/pages/ListingDetail.tsx` | Responsive padding on sidebar cards, tighter mt/pt on deal flow card |
| `src/components/listing-detail/SimilarListingsCarousel.tsx` | Smaller skeleton min-width |
| `src/components/listing-detail/BlurredFinancialTeaser.tsx` | Tighter overlay padding on mobile |

## Implementation Order

1. EnhancedFinancialGrid responsive columns
2. ListingHeader title + image + gap
3. ListingDetail sidebar padding
4. SimilarListingsCarousel skeleton width
5. BlurredFinancialTeaser overlay padding

