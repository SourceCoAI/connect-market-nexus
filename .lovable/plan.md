

# Add Tooltips to Marketplace Approval Status Badges

## What

Wrap the "Mkt. Approved" / "Mkt. Not Approved" / "Mkt. Rejected" badges in tooltips explaining what each status means, in both files where they appear.

## Tooltip text per status

| Badge | Tooltip |
|-------|---------|
| Mkt. Approved | "This user has been approved to use the SourceCo Marketplace." |
| Mkt. Not Approved | "This user has a marketplace account but has not yet been approved." |
| Mkt. Rejected | "This user's marketplace account application was rejected." |

## Changes

| File | Change |
|------|--------|
| `src/components/admin/ConnectionRequestRow.tsx` (~line 545-554) | Wrap the approval Badge in `TooltipProvider > Tooltip > TooltipTrigger/Content` with status-specific text |
| `src/components/admin/WebflowLeadDetail.tsx` (~line 239-248) | Same tooltip wrapper around the approval Badge |

Both files already import `Tooltip*` components — no new imports needed.

