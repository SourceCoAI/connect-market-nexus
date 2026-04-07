

# Add Document Preview to Listing Editor

## Summary
Make each document row in `EditorDocumentsSection` clickable so admins can preview/download documents directly from the listing editor.

## Changes

| File | Change |
|------|--------|
| `src/components/admin/editor-sections/EditorDocumentsSection.tsx` | Add `storage_path` to the query SELECT; add a preview button (Eye icon) and download button per document row; use `data-room-download` edge function with the admin's session token to generate signed URLs and open in new tab |

### Implementation Details
- Fetch `storage_path` alongside existing fields in the documents query
- Add an `Eye` (preview) icon button on each document row that calls the `data-room-download` edge function with `action=view`, opens the returned signed URL in a new tab
- Add a `Download` icon button that calls with `action=download`
- Use `supabase.auth.getSession()` for the auth token, same pattern as `use-data-room-mutations.ts`
- Show a loading spinner on the clicked button while the URL is being fetched
- No new files or edge function changes needed -- the existing `data-room-download` function already supports admin access

