

# Remove Main Contact Email as a Hard Requirement for Listing Creation

## Problem
Saks Metering has a primary contact (Alec Almond, phone: 845-536-3392) but no email address. The quality gate blocks listing creation because `main_contact_email` is a mandatory check. The user considers name + phone sufficient.

## Change
Relax the gate: require `main_contact_name` but make `main_contact_email` optional (remove it from the gaps check). The contact email check will be removed from all three places that enforce it:

| File | Line | Change |
|------|------|--------|
| `src/pages/admin/MarketplaceQueue.tsx` | 145 | Remove `main_contact_email` gap check |
| `src/pages/admin/remarketing/ReMarketingDealDetail/WebsiteActionsCard.tsx` | 303 | Remove `main_contact_email` gap check |
| `src/pages/admin/listing-pipeline/runPipelineChecks.ts` | 67 | Remove `main_contact_email` pipeline check |

No other files enforce this as a blocker. The field will still exist and be editable — it just won't block publishing.

