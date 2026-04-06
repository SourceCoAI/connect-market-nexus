

# Show Data Room Documents in My Deals Card

## Problem

The `DealDocumentsCard` on My Deals shows "No documents shared yet" even when the buyer has full access. Two bugs:

1. **No dual-ID fallback** on the access query (line 57), doc count query (line 74), and memo count query (line 88) — all query by `listing_id` but documents live on the `source_deal_id`
2. **No inline document list** — even when counts work, the card only shows "X documents available" with a link to open the listing page. The user wants actual documents shown here with the same premium vault aesthetic.

## Plan

### File: `src/components/deals/DealDocumentsCard.tsx`

**Fix dual-ID on all 3 queries:**
- Access query: add fallback to check `source_deal_id` (same pattern as `BuyerDataRoom.tsx` lines 65-83)
- Doc count query: if primary returns 0, check `source_deal_id`
- Memo count query: same fallback

**Replace "X documents available" text with actual document rows:**
- Fetch full document list (not just count) + published memos, with dual-ID fallback
- Render each document as a compact row matching the vault aesthetic: monochrome icon, file name, file size, and a View/Download action
- Use the same `getFileIcon` and `formatFileSize` helpers from `BuyerDataRoom.tsx` (extract to shared util or inline)
- Clicking View/Download calls the `data-room-download` edge function (same as `BuyerDataRoom`)
- Keep the card compact — show up to ~5 docs with a "View all in Data Room" link if more exist

**Maintain the locked state UI** — no changes to the locked/gated view, only enhance the unlocked view.

### Aesthetic

- Same premium feel: subtle hover states, monochrome file icons, ghost pill buttons
- Document rows: `text-[13px]` file name, `text-[10px]` file size in muted, small View button on hover
- Keep within the existing card border/padding structure
- No dark vault header here (that's for the full modal) — just clean document rows

### Files Changed

| File | Change |
|------|--------|
| `src/components/deals/DealDocumentsCard.tsx` | Add dual-ID fallback to all queries, replace count-only display with inline document list, add view/download handlers |

One file change. No database or edge function changes needed.

