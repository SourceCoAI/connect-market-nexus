

# Fix PDF Preview — Show Inline Instead of New Tab

## Problem

`handlePreviewPdf` calls `window.open(data.url, '_blank')` which navigates to a raw Supabase storage URL. Ad blockers (and some browser security settings) block this as a third-party redirect, causing `ERR_BLOCKED_BY_CLIENT`.

## Solution

Fetch the signed URL as a blob, create a local object URL, and display the PDF in a dialog with an `<iframe>`. This keeps the PDF on the same origin and bypasses ad blocker restrictions.

## Changes — `src/components/admin/data-room/MemosTab.tsx`

1. Add state for the PDF preview: `pdfPreviewUrl: string | null`
2. Modify `handlePreviewPdf`:
   - Still call `documentUrl.mutate` to get the signed URL
   - In `onSuccess`: `fetch(data.url)` → `.blob()` → `URL.createObjectURL(blob)` → set `pdfPreviewUrl`
3. Add a new `Dialog` for the PDF viewer:
   - Full-width (`max-w-4xl`, `max-h-[85vh]`)
   - `<iframe src={pdfPreviewUrl} />` with `width="100%" height="100%"`
   - Clean up with `URL.revokeObjectURL` on close
4. No changes to the Download button — downloads still work via direct URL (browsers handle download links differently from navigation)

## No other files change

The edge function, mutations hook, and storage setup remain the same. This is purely a frontend display change.

