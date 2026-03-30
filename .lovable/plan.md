

# Add Missing Company Fields to Copy Deal Info

## What's Missing

The current `formatDealAsText` already covers the basics but is missing these **company-specific** fields that exist in the `remarketing_deal_pipeline` table:

| Section | Missing Fields |
|---------|---------------|
| Company Overview | `founded_year`, `address_zip`, `address_country`, `street_address` |
| Online Presence | `linkedin_url`, `google_maps_url`, `fireflies_url` |
| Financials | `scoring_notes`, `revenue_source_quote`, `ebitda_source_quote`, `financial_notes` |
| Business Model | `customer_concentration`, `customer_geography`, `competitive_position` |
| Owner/Seller | `seller_motivation`, `management_depth`, `growth_drivers` (safeJoin), `timeline_preference`, `transition_preferences`, `seller_involvement_preference`, `timeline_notes` |
| Notes | `notes`, `captarget_call_notes` |

**Not including** buyer universe, end market, investment thesis, key quotes, or financial follow-up questions — per your direction, only company info.

## Changes — Single File

**`CopyDealInfoButton.tsx`** — expand `formatDealAsText` to add the ~20 missing company fields into their respective sections. No new sections needed, just additional `line()` calls in existing sections plus a couple new lines in NOTES.

