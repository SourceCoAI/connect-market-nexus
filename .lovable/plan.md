

# Fix Remaining Memo Quality Issues

## Problems Found

### 1. Omission language still leaking
The bullet "Offices are located in Sebring and South Daytona, FL; **owned vs. leased status has not been established**" survived post-processing because `has not been established` isn't in the OMISSION_PATTERNS list (line 801 only covers stated/provided/confirmed/discussed).

### 2. Third-party context presented as company initiative
The bullet "The company has been in discussions regarding integration into a broader roofing platform with centralized back-office support while maintaining operational independence" describes the Latite Roofing / Sun Capital conversation — not a SourceCo deal or the company's own strategy. This is misleading for investors who would assume it's the seller's stated plan.

### 3. Missing high-value data points
The database has information that would make the memo stronger but isn't surfacing:
- **Google Reviews**: 4.7 rating, 46 reviews — strong social proof for a local services business
- **Certified business valuation**: `general_notes` says "Owner Austin Hedrick already has business valuation done by certified appraiser, Documents ready to go" — material for investors
- **Growth drivers**: Geographic expansion within FL, increase commercial contracts, Directorii partnership
- **Google Maps listing**: Confirmed and active

### 4. EBITDA margin not shown
The EBITDA margin (10.8%) is in the database but not in the Financial Snapshot. For an investor, showing the margin alongside the absolute figure is standard.

## Changes

### File: `supabase/functions/generate-lead-memo/index.ts`

**1. Expand OMISSION_PATTERNS** (line 801)
Add `established` to the `has not been` pattern:
```
/\bhas\s*not\s*been\s*(stated|provided|confirmed|discussed|established|specified|disclosed|determined)\b/i
```

**2. Strip omission fragments from non-bullet lines too**
Currently only bullet lines are filtered (line 816). But omission language also appears in semicolon-joined phrases within bullets. Add logic: if a bullet contains a semicolon and one half matches an omission pattern, keep only the factual half.

**3. Add `general_notes` and `google_rating`/`google_review_count` to `buildDataContext`**
These fields are already fetched (select *) but not included in the enrichment fields list that gets formatted into the prompt context. Add:
- `general_notes` (contains valuation info, deal readiness)
- `google_rating` + `google_review_count` (social proof)
- `growth_drivers` (array)

**4. Update prompt to use new fields**
- **Company Overview**: "If Google reviews are available (rating, count), include as a reputation indicator."
- **Financial Snapshot**: "Include EBITDA margin if available."
- **Ownership & Transaction**: "If general notes mention a completed business valuation, state it as a fact (e.g., 'A certified business valuation has been completed')."
- **Third-party context rule** (new): "Do not describe third-party acquisition platforms, competing buyers, or external deal discussions. The memo should only reflect the seller's business and their willingness to transact — not the strategies of other acquirers."

**5. Add third-party context patterns to strip logic**
Add to SOURCE_CONTRAST_PATTERNS:
```
/\bbroader.*platform\b/i
/\bintegrat(e|ion|ing)\s*into\b/i
/\bback-office\s*(support|integration)\b/i
```
These phrases originate from the Latite Roofing meeting context and should not appear in the investor memo.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/generate-lead-memo/index.ts` | Expand omission patterns; handle semicolon-split bullets; add general_notes/google/growth_drivers to context; add third-party platform stripping; update prompt for EBITDA margin and valuation |

## Post-Change
Redeploy edge function. Regenerate Quality Roofing memo to verify all five issues are resolved.

