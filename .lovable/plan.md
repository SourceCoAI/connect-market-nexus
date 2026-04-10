

# Elevate ConnectionRequestEmailDialog to Apple/Stripe-Level Design

## Current State

All logic is correct and working:
- Auto-sender selection, editable body, edge function forwarding -- all wired
- Copy is updated (no "introduction", no "do not reply")
- Edge function matches dialog preview

The modal needs a design elevation pass to match premium standards.

## Design Changes

### 1. Widen modal to `sm:max-w-3xl` (from `sm:max-w-2xl`)

More breathing room for the email preview card.

### 2. Refined header section

- Larger, bolder title with tighter tracking
- Subtle status icon (green checkmark for approve, muted X for decline) inline with title
- Description text with more refined color and spacing
- Recipient/Deal info in a clean two-column layout with subtle separator, not just flex justify-between

### 3. Sender selector refinement

- Cleaner label styling
- Sender dropdown with slightly taller height (h-11) and refined border

### 4. Email preview card elevation

- Remove the gray #FAFAFA header background -- use pure white with just the bottom border
- Increase padding inside the email body
- Use proper em-dashes in the copy (not hyphens): "including the real company name" with proper dashes
- Tighter, more refined typography in the email body (14px not 13px)
- "What to expect" as a slightly bolder, well-spaced section
- Better bullet spacing
- "View Deal" button with slightly more padding and subtle hover feel
- Add subtle top-border separator before the exclusive opportunity paragraph

### 5. Admin note section

- More spacious textarea
- Refined placeholder text

### 6. Footer actions

- Buttons with more padding (h-11)
- Slightly rounded corners
- Better spacing between cancel and confirm

### 7. Copy refinements

- Use proper punctuation throughout (em-dashes not hyphens in "including the real company name")
- Ensure "SourceCo Support" in the second bullet reads as the selected sender's name (already does, just verify visually)

## Files Changed

| File | Change |
|------|--------|
| `src/components/admin/ConnectionRequestEmailDialog.tsx` | Design elevation -- wider modal, refined typography, cleaner email card, better spacing |

No logic changes. No edge function changes. Pure design pass.

