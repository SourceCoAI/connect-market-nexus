

# Fix: Documents Showing as Missing for Queue-Pushed Listings

## Root Cause

The `useListingsByType` hook does NOT include `source_deal_id` in its SELECT query. When a listing card is opened for editing, the listing object passed to `ImprovedListingEditor` has no `source_deal_id` field.

The editor then falls back to using the listing's own ID for document queries. Since documents are stored against the source deal (the original remarketing deal), the editor finds 0 documents and shows "No Teaser / No Memo".

## Fix

**Single change in one file**: Add `source_deal_id` to the SELECT columns in `use-listings-by-type.ts`.

| File | Change |
|------|--------|
| `src/hooks/admin/listings/use-listings-by-type.ts` (line 47) | Add `source_deal_id` to the select string |

### Current (line 47):
```
'id, title, description, category, categories, status, revenue, ebitda, image_url, is_internal_deal, created_at, updated_at, location, internal_company_name, deal_owner_id, published_at'
```

### Fixed:
```
'id, title, description, category, categories, status, revenue, ebitda, image_url, is_internal_deal, created_at, updated_at, location, internal_company_name, deal_owner_id, published_at, source_deal_id'
```

This single addition means:
- `listing.source_deal_id` will be populated (e.g., `9f08d1a8-...` for Clear Choice)
- `effectiveDealId` in the editor will resolve to the source deal ID
- `EditorDocumentsSection` will query documents from the source deal
- Teaser and Memo badges will show green checkmarks

No other files need changes. The editor, documents section, and all downstream logic already handle `source_deal_id` correctly -- they just never receive it because the query doesn't fetch it.

