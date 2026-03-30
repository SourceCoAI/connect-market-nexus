

# Add "Copy Deal Info" Button to Deal Detail Page

## What It Does

Adds a clipboard button to the deal detail header that copies **all deal information** as structured plain text — ready to paste into ChatGPT, another Lovable project, email, or any text field.

## Output Format

```text
DEAL: Saks Metering
=====================================

COMPANY OVERVIEW
Company Name: Saks Metering
Website: saksmetering.com
Industry: Meter Installation Services
Category: Energy services
Headquarters: Maspeth, NY
Address: Maspeth, NY, United States
Founded: —
Status: Active

EMPLOYEES
Full-Time: 34
Part-Time: —
LinkedIn Employees: 34
Employee Range: 11-50

FINANCIALS
Revenue: $X.XM
EBITDA: $X.XM
EBITDA Margin: XX.X%
Quality Score: 87/100

ONLINE PRESENCE
LinkedIn: saksmetering
Google Rating: 4.1 (17 reviews)
Google Maps: [url]

CONTACT
Name: [main_contact_name]
Email: [main_contact_email]
Phone: [main_contact_phone]

EXECUTIVE SUMMARY
[full executive_summary text]

DESCRIPTION
[full description text]

SERVICES & BUSINESS MODEL
[service_mix]

GEOGRAPHIC COVERAGE
States: [geographic_states joined]

CUSTOMER INFO
Types: [customer_types]
Concentration: [customer_concentration]
Geography: [customer_geography]

OWNER INFO
Goals: [owner_goals]
Ownership Structure: [ownership_structure]
Special Requirements: [special_requirements]
Owner Response: [owner_response]

ADDITIONAL DETAILS
Key Risks: [key_risks]
Technology: [technology_systems]
Real Estate: [real_estate_info]
Growth: [growth_trajectory]

INTERNAL NOTES
[internal_notes]
[general_notes]
[owner_notes]
```

## Implementation

### File 1: `src/pages/admin/remarketing/ReMarketingDealDetail/CopyDealInfoButton.tsx` (NEW)

- A button component that takes the `deal` object
- Builds the structured text string from all available fields, skipping nulls
- Uses `navigator.clipboard.writeText()` + sonner toast confirmation
- Icon: `Copy` from lucide-react, small outline button style

### File 2: `src/pages/admin/remarketing/ReMarketingDealDetail/DealHeader.tsx`

- Import and render `CopyDealInfoButton` next to the existing "Mark Not a Fit" / "New Task" buttons in the header
- Pass the `deal` object through

### File 3: `src/pages/admin/MarketplaceQueue.tsx`

- Add the same copy button as an icon button on each queue card row (next to the external link / remove buttons), so you can copy deal info directly from the queue without opening the deal

### Technical Details

- Helper function `formatDealAsText(deal)` in the new component handles all field mapping
- Uses the existing `formatCurrency` helper for financial values
- Skips any field that is null/undefined/empty — no "undefined" in output
- No new dependencies needed

