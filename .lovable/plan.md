

# Fix: `chk_listings_website_not_empty` Constraint Violation

## Root Cause

The `listings.website` column has a database CHECK constraint: `TRIM(website) != ''`. But two code paths set `website` to an empty string:

1. **`CreateListingFromDeal.tsx` line 334**: `website: ''`
2. **`use-robust-listing-creation.ts` line 244**: Falls back to `''` when no website exists

The deal being created from (`d136656a`) has no website field, so it defaults to `''`, which violates the constraint on insert.

## Fix

### File 1: `src/pages/admin/CreateListingFromDeal.tsx`
- Line 334: Change `website: ''` to generate a placeholder like `'listing-' + crypto.randomUUID().slice(0, 8) + '.placeholder'`
- Also check if the source deal has a website value and use it if available (line 49 already fetches `website` from the deal)

### File 2: `src/hooks/admin/listings/use-robust-listing-creation.ts`
- Line 242-244: Change the empty-string fallback to generate the same placeholder pattern instead of `''`

Both changes ensure the NOT NULL + non-empty CHECK constraint is always satisfied, using the deal's actual website when available and a safe placeholder otherwise.

