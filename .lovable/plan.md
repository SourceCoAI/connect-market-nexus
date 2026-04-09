
# Fix wrong deal owner in Connection Requests

## What I found

The current implementation is still reading the owner from the marketplace listing row itself (`listings.deal_owner_id` / `primary_owner_id`).

For Saks, that row has no owner set. The real owner is on the linked Active Deals source record:

```text
connection_requests.listing_id
  -> listings.id = a6e20e...
  -> source_deal_id = cf6937...
  -> linked listing has deal_owner_id = Bill Martin
```

So the UI is looking at the wrong row.

## Correct approach

Resolve the owner from the Active Deals chain in this order:

1. Current listing `deal_owner_id`
2. Current listing `primary_owner_id`
3. If empty, follow `source_deal_id` to the source Active Deal listing
4. Use source listing `deal_owner_id`
5. Fallback to source listing `primary_owner_id`

That will make Saks show Bill Martin.

## UI behavior

Keep the owner inline to the right of the company name, but make the tooltip more explicit and more honest about the source.

Example:
```text
Municipal Meter Installation & Services - Mid Atlantic / Saks Metering · Bill Martin ⓘ
```

Tooltip:
- If owner came from current listing: `Deal Owner — from this Active Deal`
- If owner came via `source_deal_id`: `Deal Owner — inherited from linked Active Deal`
- Keep dotted underline + Info icon so it’s obvious the text is hoverable

## Files to update

| File | Change |
|------|--------|
| `src/hooks/admin/requests/use-connection-requests-query.ts` | Expand listing fetch to include `source_deal_id`. Batch-fetch any referenced source listings. Resolve owner from the full fallback chain above instead of only checking the current row. Also attach a small metadata field like `owner_source_label` / `owner_source_type` for the tooltip text. |
| `src/components/admin/ConnectionRequestRow.tsx` | Update `formatEnhancedCompanyName` to accept tooltip/source metadata in addition to `ownerName`. Keep the inline owner display, but show dynamic tooltip copy based on where the owner was resolved from. Preserve visible affordance: dotted underline, muted styling, Info icon. |
| `src/types/admin.ts` and/or `src/types/index.ts` | Extend the listing shape with optional owner-source metadata so the tooltip text is typed cleanly. |

## Why this is the right fix

- It matches the actual Active Deals relationship in the data
- It fixes cases like Saks where the marketplace listing is a child/derived record
- It avoids showing blank or misleading owners
- The tooltip explains the provenance, so admins understand why the name appears there

## Validation after implementation

Check these cases in Connection Requests:
1. A listing with `deal_owner_id` directly set
2. A listing like Saks where owner only exists on `source_deal_id`
3. A listing with no owner anywhere
4. Hover state confirms tooltip is visibly discoverable and wording matches the source used
