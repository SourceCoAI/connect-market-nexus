
Root cause is now clear: this is not a failed save, it is a bad reload path.

What I verified:
- The browser logs show no submit/runtime error.
- Supabase shows the latest edited listing did save successfully:
  - `description` contains the flattened plain-text version
  - `description_html` contains the rich HTML version
- The garbled text in your last screenshot matches the saved plain-text `description`, not the saved `description_html`.

Why it happens:
1. The admin list query in `src/hooks/admin/listings/use-listings-by-type.ts` only fetches a summary row:
   - it includes `description`
   - it does not include `description_html`, `description_json`, `hero_description`, and many other editor fields
2. Clicking Edit in `src/components/admin/ListingsManagementTabs.tsx` passes that summary object directly into `ImprovedListingEditor`
3. In `convertListingToFormInput()` inside `src/components/admin/ImprovedListingEditor.tsx`, the editor falls back to:
   - `description_html` if present
   - otherwise `description`
4. Because the list row has no `description_html`, the editor rehydrates from plain text, so headings/lists are lost and you see the smashed-together content from the screenshot

Deep issue beyond the screenshot:
- This means the editor is being opened with an incomplete listing object
- So saving from this screen can also wipe other fields that were never loaded into the form, not just rich text formatting

Fix plan:
1. Add a dedicated admin listing detail fetch
   - Create a full-record query by listing ID for edit mode
   - Fetch all fields the editor needs, including `description_html`, `description_json`, hero/internal/contact/visibility fields, etc.
   - Keep the existing list query lightweight for the cards/table

2. Change edit flow to load the full listing before rendering the editor
   - In `ListingsManagementTabs.tsx`, store the selected listing ID
   - When Edit is clicked, fetch the full listing row
   - Render `ListingForm` only after the detail query resolves
   - Show a loading state while the full record is being fetched

3. Stop using summary rows as the source of truth for editing
   - The list result should only power the grid/table
   - The editor should only receive the full listing record

4. Harden post-save behavior
   - Invalidate/refetch the new detail query after update
   - Also keep the existing list invalidation so the cards refresh
   - This ensures reopening the same listing shows the saved HTML immediately

5. Improve plain-text fallback quality
   - Update `stripHtml` usage or add a richer HTML-to-text helper so block elements preserve spacing/newlines
   - This is secondary, but it prevents ugly concatenated text anywhere the plain `description` is used as fallback

Expected result after fix:
- AI-generated and manually edited rich text will reopen exactly as formatted
- “Update Listing” will continue succeeding
- Reopening a listing will no longer degrade the description into flattened text
- Other edit-only fields will stop being silently cleared by partial list data

Files I expect to touch:
- `src/components/admin/ListingsManagementTabs.tsx`
- `src/hooks/admin/listings/use-listings-by-type.ts` or a new dedicated admin detail hook file
- `src/components/admin/ImprovedListingEditor.tsx`
- `src/lib/sanitize.ts` or a new helper for better HTML-to-plain-text conversion

Technical note:
The evidence points to a rehydration bug, not a persistence bug. The DB already contains the rich HTML for the listing you just saved; the admin editor simply is not loading that rich field when you come back in through the listings grid.
