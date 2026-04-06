

# Fix Metrics: Smart Defaults, AI Generation, and Editor Visibility

## Problems

1. **"Team Size: 0"** — The default metric 3 shows `Team Size` with value `0` and subtitle `0 FT, 0 PT` when no employee data exists. This looks terrible.
2. **"Profitability metric"** — The default metric 4 subtitle is a hardcoded placeholder string `'Profitability metric'`. Useless.
3. **Metrics 3 and 4 are not editable in the editor** — `EditorFinancialCard.tsx` only has Revenue and EBITDA fields. There is no UI to configure metric 3 (Team Size or custom) or metric 4 (EBITDA Margin or custom), their labels, values, or subtitles.
4. **AI generation does not populate metrics** — The `generate-listing-content` edge function only generates title, hero, and body description. It does not set `metric_3_*`, `metric_4_*`, `revenue_metric_subtitle`, or `ebitda_metric_subtitle`.

## Solution

### 1. Add Metrics 3 and 4 to Editor (`EditorFinancialCard.tsx`)

Below Revenue and EBITDA, add two configurable metric slots:

**Metric 3**: Toggle between "Team Size" (auto-calculated from `full_time_employees` + `part_time_employees` fields) and "Custom" (free-text label/value/subtitle). Include FT/PT employee inputs when in Team Size mode.

**Metric 4**: Toggle between "EBITDA Margin" (auto-calculated) and "Custom" (free-text). When in EBITDA Margin mode, show the auto-calculated value with an editable subtitle field (replacing the hardcoded "Profitability metric").

Each metric slot: a small toggle (Team Size / Custom or EBITDA Margin / Custom), then the relevant inputs.

### 2. Fix Default Display When Data is Missing (`ListingDetail.tsx` + `ListingPreview.tsx`)

**Metric 3 (Team Size default)**: If `full_time_employees + part_time_employees === 0`, hide this metric entirely or show em-dash instead of "0". Change subtitle from "0 FT, 0 PT" to nothing.

**Metric 4 (EBITDA Margin default)**: Change subtitle from `'Profitability metric'` to something computed like the category name, or just remove the subtitle entirely.

### 3. AI Generate Populates Metric Subtitles (`generate-listing-content`)

When generating content, also return and save:
- `revenue_metric_subtitle`: Use the primary category/industry (e.g., "Restoration", "HVAC")
- `ebitda_metric_subtitle`: Use a computed string like `~33.3% margin profile` (already used as fallback, just save it explicitly)
- `metric_3_type`: If deal has employee data, keep as `employees`. Otherwise set to `custom` with a relevant metric from the deal (e.g., "Locations" if `number_of_locations` exists, or "Years in Business" if `founded_year` exists)
- `metric_4_custom_subtitle`: Remove hardcoded "Profitability metric", use category or empty

The AI function will intelligently pick the best metric 3 and 4 based on available deal data:
- Has employees? -> Team Size with FT/PT breakdown
- Has locations? -> Custom "Locations" metric
- Has years? -> Custom "Years Established"
- Otherwise -> hide metric 3 (set to custom with empty values)

### 4. Update Live Preview (`EditorLivePreview.tsx`)

Update the preview's financial grid (lines 320-348) to match the same logic: use form values for metric 3/4, show smart defaults, hide empty metrics.

## Files Changed

| File | Change |
|------|--------|
| `src/components/admin/editor-sections/EditorFinancialCard.tsx` | Add metric 3 and 4 configuration UI with toggles, employee inputs, custom fields |
| `src/pages/ListingDetail.tsx` | Fix Team Size 0 display, remove "Profitability metric" hardcode |
| `src/pages/ListingPreview.tsx` | Same fixes as ListingDetail |
| `src/components/admin/editor-sections/EditorLivePreview.tsx` | Update preview financial grid to use form metric values |
| `supabase/functions/generate-listing-content/index.ts` | Generate and save metric subtitles and smart metric 3/4 values |

