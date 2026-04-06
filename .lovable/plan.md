
# Fix Marketplace Queue Listing Creation Properly

## What is actually broken

This is not just a copy issue.

### 1. Some fields populate into memory but never make it through the actual listing flow
The queue-to-listing page fetches a fairly rich deal payload, but several fields are either:
- not passed into the form
- not editable anywhere
- not persisted on create/update
- not rendered in the preview or buyer view

That creates the feeling that data is “not populating” even when parts of it were fetched earlier.

### 2. Financials are creating confusion in two different ways
- In the current create-from-deal editor, revenue and EBITDA are intentionally locked when the listing comes from a deal.
- They do populate, but the UI does not clearly explain the source of truth.
- The admin preview currently shows buyer-facing financial blocks even though actual buyers only see full financials after approval. So the preview is misleading.

### 3. Admin-only vs buyer-visible is not organized clearly
The code enforces privacy reasonably well through `MARKETPLACE_SAFE_COLUMNS`, but the admin creation flow does not explain:
- what stays internal
- what becomes buyer-visible before approval
- what only appears after connection approval
- what never leaves admin view

### 4. The editor and preview are incomplete relative to the available data
Right now the listing editor focuses on:
- title
- categories
- location
- revenue / EBITDA
- description
- image
- some internal metadata

But important marketplace-facing structured fields already exist and are allowed for buyers:
- `services`
- `geographic_states`
- `number_of_locations`
- `customer_types`
- `revenue_model`
- `business_model`
- `growth_trajectory`

Several of these are either not populated end to end or not shown anywhere meaningful.

### 5. Copy still needs a full standards pass
There are still em dashes and vague copy in related admin surfaces, especially:
- editor title generator and placeholder text
- preview text
- some financial / listing labels

## Root causes I found

### A. The create-from-deal mapper is incomplete
`CreateListingFromDeal.tsx` fetches more than the editor fully uses. Some fields are carried in `prefilled`, but not all are represented in the editing UI or preview.

### B. The editor form schema is too narrow for the marketplace listing model
`ImprovedListingEditor.tsx` does not expose several buyer-visible structured fields, so they cannot be reviewed or corrected before publish.

### C. The preview is not a faithful representation of the buyer journey
`EditorLivePreview` currently hardcodes some fields to `null` and shows buyer-facing financial blocks more openly than the real marketplace flow. That creates false confidence.

### D. Title-generation copy still contains banned punctuation
`EditorInternalCard.tsx` still uses em dashes in generated titles and placeholders.

## What to build

### Phase 1. Fix data mapping and source-of-truth rules
Update the create-from-deal flow so every intended field has a clear path:

```text
Queue deal
  -> fetched from source deal
  -> mapped into prefilled listing
  -> editable or locked in editor
  -> saved to listing
  -> shown in preview
  -> shown to buyers only if allowed
```

Concretely:
- audit and complete the mapping for all listing-relevant fields
- keep revenue / EBITDA locked for deal-sourced listings
- add plain language source-of-truth copy:
  - financials come from the source deal
  - edit them in the deal, not the listing
- make sure fields like `number_of_locations` and `growth_trajectory` are not silently dropped

### Phase 2. Reorganize the editor into clean sections
Split the editor into clearer groups:

1. Internal Only
   - real company name
   - owner
   - CRM links
   - internal notes
   - contact info

2. Marketplace Basics
   - public title
   - geography
   - industry
   - acquisition type
   - featured image
   - hero description

3. Financial Snapshot
   - revenue
   - EBITDA
   - subtitles
   - team size / metric fields
   - source-of-truth notice

4. Buyer-Facing Business Details
   - services
   - states served
   - number of locations
   - customer types
   - revenue model
   - business model
   - growth trajectory

5. Buyer Visibility Controls
   - visible buyer types
   - publish state
   - what is public vs gated

This makes the admin mental model much clearer.

### Phase 3. Add an explicit visibility model in the UI
Add a compact “Visibility” panel that explains:

#### Admin only
- `internal_company_name`
- `internal_salesforce_link`
- `internal_deal_memo_link`
- `internal_contact_info`
- `internal_notes`
- contact PII
- owner assignments
- source linkage fields

#### Visible to approved marketplace users browsing listings
- title
- image
- description
- hero description
- categories
- location / geography
- selected structured business details
- buyer-type restrictions

#### Visible only after connection approval
- financial grid
- teaser / memo / data room based on access toggles

This should reflect actual platform behavior, not a rough guess.

### Phase 4. Make preview match reality
Refactor the admin preview so it has distinct modes:

- Public / browsing view
- Approved buyer view
- Admin view

This solves the current mismatch where admins think buyers see more than they actually do.

Also stop nulling out structured fields in preview when form data exists.

### Phase 5. Tighten buyer-facing rendering
Expand buyer-facing detail components so the populated fields are actually used:
- geography
- services
- number of locations
- customer types
- revenue model
- business model
- growth trajectory

Right now the marketplace detail page underuses the safe fields already allowed.

### Phase 6. Full copy cleanup
Apply the platform style rules everywhere touched by this flow:
- no em dashes
- no en dashes
- no filler
- no soft / vague language
- no “AI magic” phrasing

Examples:
- “AI is generating listing content...” -> “Generating listing content.”
- “Placeholder description...” -> direct, operational warning
- title placeholders and generated title logic should use `|` or plain punctuation only

## Technical details

### Files that need updates
- `src/pages/admin/CreateListingFromDeal.tsx`
- `src/components/admin/ImprovedListingEditor.tsx`
- `src/components/admin/editor-sections/EditorInternalCard.tsx`
- `src/components/admin/editor-sections/EditorFinancialCard.tsx`
- `src/components/admin/editor-sections/EditorLivePreview.tsx`
- `src/pages/ListingPreview.tsx`
- `src/pages/ListingDetail.tsx`
- `src/components/listing-detail/BusinessDetailsGrid.tsx`
- possibly a new buyer-facing details section component for structured listing metadata
- possibly shared constants for visibility labels / field groups

### Important implementation decisions
- Do not make financials editable in deal-sourced listings.
- Do not expand buyer-facing queries beyond `MARKETPLACE_SAFE_COLUMNS`.
- Do not expose internal fields in preview modes meant to simulate buyers.
- Do make the preview mirror actual gating behavior.

## Expected outcome

After this:
- all intended marketplace fields populate consistently
- admins know exactly what is internal vs buyer-visible
- financials are clearly sourced and no longer confusing
- the create-from-queue flow feels organized and deliberate
- previews match real user experience
- copy is clean, concrete, and on-brand
