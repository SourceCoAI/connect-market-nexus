

# Fix: Currency Input Placeholders Look Like Real Values

## Problem

The `EnhancedCurrencyInput` placeholder text (e.g., "250-1,000 (millions)") looks like an actual filled-in value because it uses the same text color as real input. Users skip the field thinking it's already populated.

## Changes

### File 1: `src/components/ui/enhanced-currency-input.tsx`

- Change placeholders from numeric-looking ranges to clear instructional text:
  - `fund`: `"e.g. 500"` 
  - `aum`: `"e.g. 1000"`
  - `revenue`: `"e.g. 25"`
  - `dealSize`: `"e.g. 10"`
  - `general`: `"Enter amount"`

- Add explicit `placeholder:text-muted-foreground/50` class to the Input to make placeholder visually distinct (lighter) from real values.

### File 2: `src/pages/Profile/ProfileForm.tsx`

- Compute completeness banner from merged `formData` + `user` so it updates live as fields are filled (not just after save + refresh).

Two files. The core fix is making placeholders obviously not real data.

