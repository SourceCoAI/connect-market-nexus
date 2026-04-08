

# Clean Up Marketplace Approval Badges + Tooltips

## Problem

The current "Mkt. Approved" / "Mkt. Not Approved" badges are too small (`text-[10px]`), use `cursor-help` which is subtle, and have no visual hint that a tooltip exists. The tooltip itself just appears on hover with no affordance.

## Design

Replace the current tiny badge with a cleaner, more prominent inline pill that includes a subtle dotted underline and an `Info` icon to signal "more info on hover." Keep it minimal and premium per design standards.

**Approved state:**
- Emerald dot + "Marketplace Approved" text + small `Info` icon (h-3 w-3, muted)
- Dotted bottom border as tooltip affordance
- Tooltip: "This user has been approved to use the SourceCo Marketplace."

**Not Approved state:**
- Amber dot + "Marketplace Pending" text + small `Info` icon
- Same dotted underline treatment
- Tooltip: "This user has a marketplace account but has not yet been approved."

**Rejected state:**
- Red dot + "Marketplace Rejected" text + small `Info` icon
- Tooltip: "This user's marketplace account application was rejected."

Use a status dot (colored circle) instead of the `User` icon for a cleaner, more intuitive look. Increase text to `text-xs`. Add `border-b border-dotted` to signal interactivity.

## Changes

| File | Change |
|------|--------|
| `src/components/admin/ConnectionRequestRow.tsx` (~line 545-566) | Replace badge with clean pill: status dot + full label + Info icon + dotted underline, wrapped in tooltip |
| `src/components/admin/WebflowLeadDetail.tsx` (~line 240-261) | Same treatment |

