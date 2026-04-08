

## Problem

Several fields that users can edit in their profile form are **not displayed** in the admin dashboard's user profile view because they're missing from the field mappings and labels in `buyer-type-fields.ts`.

### Missing Fields

| Field | Where it's editable | Where it's missing |
|-------|--------------------|--------------------|
| `bio` | All buyer types (ProfileForm line 498) | Not in any field category or FIELD_LABELS |
| `deal_structure_preference` | Independent Sponsor (ProfileSettings line 153) | Not in `independentSponsor` mapping |
| `target_deal_size_min` | Independent Sponsor (ProfileSettings line 157) | Not in `independentSponsor` mapping |
| `target_deal_size_max` | Independent Sponsor (ProfileSettings line 157) | Not in `independentSponsor` mapping |

The save pipeline itself is correct — all fields are persisted to the DB via `supabase.from('profiles').update(dbPayload)` with no field filtering. The issue is purely on the **admin display side**.

### Fix

**Single file: `src/lib/buyer-type-fields.ts`**

1. Add `bio` to the `profile` array (shared across all buyer types) so it appears in the "Business Profile" section for every user.

2. Add `deal_structure_preference`, `target_deal_size_min`, `target_deal_size_max` to the `independentSponsor` array.

3. Add labels to `FIELD_LABELS`:
   - `bio` → `"About Me"`
   - (the other three already have labels)

No other files need changes — `UserDetails.tsx` already has rendering logic for `target_deal_size_min`/`target_deal_size_max` and a default handler for text fields like `bio` and `deal_structure_preference`.

