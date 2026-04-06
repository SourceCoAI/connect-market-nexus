

# Fix: Duplicate Website Unique Constraint on Listing Creation

## Root Cause

The `fromDeal` parameter (`d136656a`) points to an **existing listing** in the `listings` table (not a separate deals table). This listing already has `website: https://protegrityrestoration.com/`.

When "Update Listing" is clicked, the code in `CreateListingFromDeal.tsx` line 334 copies the source listing's website verbatim into the new listing INSERT. The `idx_listings_unique_website` unique index rejects this because the original listing already owns that website value.

The secondary error ("AI content generation could not complete") is the `generate-marketplace-listing` edge function timing out or failing silently — separate issue, non-blocking since the form falls back to manual entry.

## Fix

### File 1: `src/pages/admin/CreateListingFromDeal.tsx`

**Line 334-336**: The website for the NEW listing must always be unique. Never copy the source listing's website directly. Generate a unique placeholder:

```typescript
// Always use a unique placeholder for the new listing's website field
// The source deal's website is stored internally but the new marketplace
// listing needs its own unique value to satisfy the DB constraint
website: `listing-${crypto.randomUUID().slice(0, 8)}.placeholder`,
```

This ensures no collision with the source listing's website or any other listing.

### File 2: `src/hooks/admin/listings/use-robust-listing-creation.ts`

**Line 242-244**: Same fix — if somehow a website value from the source gets passed through, the robust creation hook should still guarantee uniqueness:

```typescript
website: sanitizeStringField((listing as Record<string, unknown>).website) 
  && !String((listing as Record<string, unknown>).website).endsWith('.placeholder')
  ? `${sanitizeStringField((listing as Record<string, unknown>).website)}-${crypto.randomUUID().slice(0, 8)}`
  : `listing-${crypto.randomUUID().slice(0, 8)}.placeholder`,
```

This appends a UUID suffix to real website values to avoid collisions, and uses a full placeholder for empty/placeholder values.

### No other files changed.

## AI Content Generation Error
The `generate-marketplace-listing` edge function appears to time out (logs show it starts but never completes). This is a separate issue — the current fallback ("fill in content manually") works. Can be investigated separately if needed.

