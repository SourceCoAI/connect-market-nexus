

# Overhaul Listing Editor and Detail Page

## What's Wrong

**Editor**: Scattered layout with a 2-column grid (internal card left, financials/image/business details right), then hero and body description below. The "Business Details" card (services, customer types, revenue model, growth trajectory, etc.) creates separate structured fields that render as ugly, raw data dumps on the listing detail page. The editor flow does not match how the listing actually displays.

**Listing Detail Page**: Shows a "Business Details" grid with raw AI-generated text dumped into small badge/chip fields (services showing full paragraphs as chips, customer types as wall-of-text). Then below that, a "Business Overview" section with `description_html`, then `custom_sections` (Deal Snapshot, Key Facts, Growth Context, Owner Objectives) as separate cards. The result is repetitive, disorganized, and unprofessional.

**Reference (good listing)**: The Pacific Northwest Window listing shows a clean flow: Image, Title, Hero text, Financial metrics, then rich content cards with proper H2 headings (investment thesis cards), then service lines/customer profile in a clean 2-column layout at the bottom. All content lives in the body description as formatted rich text.

## Plan

### Phase 1: Restructure the Editor Layout

**File: `src/components/admin/ImprovedListingEditor.tsx`**

Change the layout from the current 2-column grid to a single-column cascading flow that mirrors the listing detail page:

```text
1. [Publish Status Banner]
2. [Featured Image upload]
3. [Title + AI Generate] + [Geography] + [Industry] + [Type] - single row
4. [Hero Description] (short pitch textarea)
5. [Financial Metrics] (Revenue, EBITDA, Custom metrics, subtitles)
6. [Body Description] (rich text editor - THE main content area)
7. [Internal Admin Fields] (collapsed section: company name, deal owner, CRM links, status, tags, buyer visibility)
8. [Featured Deals]
9. [Save button]
```

Remove `EditorBusinessDetailsCard` from the layout entirely. All business detail content (services, customer types, revenue model, business model, growth trajectory) should be written into the body description as formatted rich text, not as separate database fields.

Remove the `EditorBusinessDetailsCard` import and rendering.

Remove `EditorVisibilityPanel` (it's redundant - buyer visibility is already in InternalCard).

### Phase 2: Remove Business Details from Listing Detail Page

**File: `src/pages/ListingDetail.tsx`**

Remove the `<BusinessDetailsGrid>` component rendering (lines 257-265). All that information now lives in the body description as rich text content.

Remove the separate `custom_sections` rendering (lines 289-301). These sections should be part of the body description HTML instead of separate cards.

The detail page flow becomes:
```text
1. ListingHeader (image, title, location, categories, hero text)
2. Financial Grid (revenue, EBITDA, custom metrics)
3. Body Description (rich HTML with H2/H3 sections, bullet points, everything)
4. Similar Listings
5. Financial Teaser / Data Room
```

### Phase 3: Refactor EditorInternalCard

**File: `src/components/admin/editor-sections/EditorInternalCard.tsx`**

Split this into two distinct concerns:
- **Top-level marketplace fields** (title, geography, industry, type) - these get extracted OUT of the card and placed directly in the main editor flow
- **Internal admin section** (company name, deal owner, CRM links, status, status tag, buyer visibility) - stays as a collapsible card at the bottom

Create a new lightweight component `EditorMarketplaceFields.tsx` that contains:
- Title with AI Generate
- Geography (location select)
- Industry (category select)  
- Type (platform/add-on toggle)

The remaining `EditorInternalCard` becomes purely admin-only fields.

### Phase 4: Clean Up Schema

**File: `src/components/admin/ImprovedListingEditor.tsx`** (schema section)

Remove `services`, `geographic_states`, `number_of_locations`, `customer_types`, `revenue_model`, `business_model`, `growth_trajectory` from the form schema. These fields still exist in the DB but are no longer edited via separate form fields. All that content goes into the rich text body.

### Phase 5: Merge custom_sections into description_html

**File: `src/components/admin/editor-sections/EditorDescriptionSection.tsx`**

When loading a listing that has `custom_sections` but no `description_html`, auto-convert the custom_sections array into HTML content and inject it into the rich text editor. This way existing AI-generated content gets merged into the single body editor.

Update the section template to match the good listing pattern:
```html
<h2>Business Overview</h2><p></p>
<h2>Financial Highlights</h2><ul><li></li></ul>
<h2>Market Position</h2><p></p>
<h2>Growth Opportunities</h2><ul><li></li></ul>
<h2>Transaction Overview</h2><p></p>
```

### Files Changed Summary

| File | Change |
|------|--------|
| `ImprovedListingEditor.tsx` | Restructure to single-column cascading layout, remove BusinessDetailsCard and VisibilityPanel |
| `EditorInternalCard.tsx` | Extract marketplace fields, keep only admin-only fields |
| New: `EditorMarketplaceFields.tsx` | Title, geography, industry, type in a compact row |
| `EditorBusinessDetailsCard.tsx` | Delete file (no longer used) |
| `EditorVisibilityPanel.tsx` | Delete file (redundant) |
| `EditorDescriptionSection.tsx` | Add custom_sections-to-HTML merge logic on load |
| `ListingDetail.tsx` | Remove BusinessDetailsGrid and custom_sections rendering |
| `EditorHeroDescriptionSection.tsx` | No structural changes, just reposition in layout |
| `EditorFinancialCard.tsx` | No structural changes, just reposition in layout |

### What stays the same
- Rich text editor (PremiumRichTextEditor) with full H1/H2/H3, bold, italic, lists, etc.
- AI generation buttons (regenerate with AI for hero + body)
- Financial metrics with custom metric support
- All admin-only internal fields
- Publish/unpublish flow
- Featured deals section
- Live preview section
- The form schema for core fields (title, description, revenue, ebitda, etc.)

