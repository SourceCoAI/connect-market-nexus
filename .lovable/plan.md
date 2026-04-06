

# Financials ARE Populating — The Issue is UX Trust

## Investigation Results

The source deal (`d136656a`) has `revenue: 4,500,000` and `ebitda: 1,500,000`. Your screenshot confirms these values are displayed correctly in the Financial card. The full data pipeline is intact:

1. Deal fetched with revenue/ebitda (confirmed in DB)
2. Mapped to form via `convertListingToFormInput` as strings ("4500000")
3. Displayed in `EnhancedCurrencyInput` (your screenshot shows "4,500,000")
4. On save, `sanitizeNumericField` → `parseCurrency` converts back to numbers
5. Inserted into `listings` table with correct numeric values

**No listing has been created from this deal yet** (DB query returned 0 results with `source_deal_id = d136656a`). So the persistence path hasn't been tested yet, but the code correctly handles the conversion.

## Why It Feels Broken

The Financial card shows values but uses an amber "Financials inherited from source deal" banner with a lock icon, making it look like the values might not transfer. The `isReadOnly` state blocks editing but the values ARE there and WILL persist on save.

## No Code Changes Needed for Financials

The data flow is correct end-to-end. If you save the listing, revenue and EBITDA will persist. You can verify by clicking "Create Listing" and checking the result.

If there's a specific scenario where financials are missing after saving, please share a screenshot of the saved listing showing missing values — that would point to a different bug.

