

# Fix: Listing Edit Changes Not Saving

## Root Cause

The `ImprovedListingEditor` form submit handler (line 436) manually calls `form.trigger()` for validation, then `form.getValues()` to get form data. The problem: **`getValues()` returns raw input values** (pre-zod-transform), so:

- `revenue` goes to the DB as a formatted string like `"5,000,000"` instead of the number `5000000`
- `ebitda` same issue
- `location` goes as `["South Central"]` (array) instead of `"South Central"` (string)

The DB columns `revenue` and `ebitda` are `numeric`, so PostgREST rejects the comma-formatted strings, causing a silent update failure.

The location is manually handled (lines 461-463), but revenue/ebitda are not.

## Fix

**File: `src/components/admin/ImprovedListingEditor.tsx`**

Replace the manual `trigger()` + `getValues()` approach in `handleFormSubmit` with React Hook Form's built-in `form.handleSubmit()`, which runs zod transforms and returns properly typed output values (numbers for revenue/ebitda, string for location).

Specifically, change lines 436-476 from the manual validation pattern to:

```typescript
const handleFormSubmit = form.handleSubmit(async (formData) => {
  await handleSubmit(formData);
}, (errors) => {
  const errorFields = Object.keys(errors)
    .map((key) => `${key}: ${errors[key]?.message || 'Invalid'}`)
    .join(', ');
  toast({
    variant: 'destructive',
    title: 'Please fix the following errors',
    description: errorFields || 'Form validation failed',
  });
});
```

And remove the manual location transform in `handleSubmit` since zod already transforms `location` from array to string.

This is a one-file change that ensures revenue/ebitda are parsed to numbers and location is transformed to a string before hitting the database.

