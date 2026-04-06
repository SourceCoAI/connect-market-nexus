

# Add "Download as PDF" to Memo Drafts + Access Logic Summary

## Problem
The AI-generated drafts (Anonymous Teaser and Full Lead Memo) can only be downloaded as `.docx`. You want to download them as PDF so you can immediately upload them as the "Final PDF" without leaving the platform.

## Access Logic (How Buyers See These Documents)

| Document | When Buyer Gets Access | Gating Requirement |
|----------|----------------------|-------------------|
| **Anonymous Teaser** | Admin approves connection request and toggles `can_view_teaser` ON in the Access Matrix. This is the first document shared — no NDA or Fee Agreement required. | Connection approved + teaser toggle ON |
| **Full Lead Memo** | Admin toggles `can_view_full_memo` ON in the Access Matrix. This toggle is **blocked unless** the buyer has a signed Fee Agreement (or admin provides an override reason). | Connection approved + Fee Agreement signed + memo toggle ON |
| **Data Room** | Admin toggles `can_view_data_room` ON. Same Fee Agreement gate as Full Memo. | Connection approved + Fee Agreement signed + data room toggle ON |

The toggles are independent — an admin manually controls what each buyer can see at each stage. The teaser is the "free look"; the memo and data room require the Fee Agreement.

## Changes — Single File

### `src/components/admin/data-room/MemosTab.tsx`

**Add a "Download PDF" button** next to the existing "Download .docx" button:

- Add a new `handleDownloadPdf` function that:
  1. Calls the same `generateMemoDocx` logic but instead of using `file-saver` to save a `.docx`, converts to PDF client-side
  2. Since client-side DOCX-to-PDF is complex, the simpler approach: use the browser's `window.print()` on the existing preview content, or generate a PDF directly from the memo sections using a lightweight approach

**Recommended approach**: Generate a styled HTML document from the memo sections and use `window.print()` / browser PDF export. This avoids adding heavy dependencies.

Implementation:
- Create a `handleDownloadPdf` function that:
  1. Opens a new window with the memo content rendered as styled HTML (same content as the preview)
  2. Triggers `window.print()` which allows "Save as PDF"
  
  OR (better UX — no print dialog):
  
  1. Use the existing `generateMemoDocx` to create the DOCX blob
  2. Then use a library like `html2pdf.js` or render the preview HTML and convert

**Simplest reliable approach**: Render the memo sections into a clean HTML page in a new window and call `window.print()`. The user selects "Save as PDF" from the print dialog. This requires zero new dependencies.

- Add button between "Download .docx" and "Regenerate":
  ```
  Download PDF
  ```
  Uses `FileDown` icon to differentiate from `.docx` download.

### Button layout change
Current: `[Preview] [Download .docx] [Regenerate]`
New: `[Preview] [Download .docx] [Download PDF] [Regenerate]`

### No other files changed.

