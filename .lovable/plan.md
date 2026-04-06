

# Fix Editor Organization: Separate Admin vs. Buyer Fields + Merge Long-Text Business Details into Description

## Problems

### 1. "Company Overview" mixes admin-only and buyer-facing fields with no distinction
The `EditorInternalCard` contains both:
- **Admin-only**: Company name, Deal Owner, Company URL, Salesforce URL
- **Buyer-facing**: Title, Geography, Type, Industry, Status, Tag, Visible To

These are in one card labeled "Company Overview" with no separation. The admin cannot tell what buyers will see.

### 2. Business Details card uses single-line inputs for paragraph-length content
The screenshot shows fields like "Services", "Customer Types", "Business Model", "Growth Trajectory" containing full sentences that get truncated in small `<Input>` elements. These are not short tag-like values — they are AI-generated paragraphs.

### 3. Long business detail text should merge into the description
Fields like `customer_types: "The customer base is heavily influenced..."` and `business_model: "Emergency restoration services, p..."` are full narrative text. They belong in the body description, not in separate metadata inputs. The structured Business Details card should only contain short, scannable values (comma-separated tags, numbers, short labels).

### 4. Financials ARE populating
The screenshots confirm revenue (4,500,000) and EBITDA (1,500,000) are present. The "not populating" concern may stem from the confusing layout where admin-only and buyer-facing fields blur together, making it hard to trust what's actually going through.

## Changes

### File 1: `src/components/admin/editor-sections/EditorInternalCard.tsx`
**Split into two clearly labeled sections within the same card:**

**Section A: "Internal (Admin Only)"** with a subtle lock icon or "(admin only)" label
- Company name
- Deal Owner
- Company URL
- Salesforce URL

**Section B: "Marketplace Listing (Visible to Buyers)"** with an eye icon
- Title + AI Generate
- Geography + Type
- Industry
- Status + Tag
- Visible To (buyer type filters)

This is a visual reorganization within the same component — add a divider and two distinct sub-headers with visibility labels.

### File 2: `src/components/admin/editor-sections/EditorBusinessDetailsCard.tsx`
**Convert long-text fields to `<Textarea>` and keep short fields as `<Input>`:**

Short fields (keep as `<Input>`):
- States Served (comma-separated abbreviations)
- Number of Locations (number)
- Revenue Model (short label like "Recurring contracts, Project-based")
- Growth Trajectory (short label like "Growing 10-15% YoY")

Long fields (change to `<Textarea>` with 3-row minimum):
- Services (can be long descriptions from AI)
- Customer Types (can be paragraph-length)
- Business Model (can be paragraph-length)

Also add a note: "Keep entries concise. Long descriptions belong in the body description below."

### File 3: `src/components/admin/editor-sections/EditorVisibilityPanel.tsx`
No changes needed — already clear.

### No data flow changes
The financial population, persistence, and buyer isolation all work correctly. This is purely a UI organization fix.

## Summary
- Split "Company Overview" into "Internal (Admin Only)" and "Marketplace Listing (Visible to Buyers)" sub-sections
- Convert truncated business detail inputs to textareas where content is paragraph-length
- Add clear visibility labels so the admin always knows what buyers see

