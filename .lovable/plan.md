
# Redesign Profile Completeness Banner with Jump Links

## Problem
The current banner uses amber/yellow background tints, colored text, and dot-list formatting that clashes with the platform's quiet luxury aesthetic. Missing fields are listed passively with no way to jump to them.

## Changes — Single File

### `src/pages/Profile/ProfileForm.tsx` (lines 52-74)

**Redesign the banner:**
- Remove `bg-amber-50 border-amber-200` yellow box. Replace with a clean white/transparent container using only a subtle `border border-[#E5E5E5]` and `rounded-lg`.
- Remove the `AlertCircle` icon with amber coloring. Use a minimal thin progress indicator instead.
- Header: `text-sm font-medium text-[#0E101A]` — "{completionPct}% complete"
- Subtext: `text-xs text-[#6B6B6B]` — "Fill in the remaining fields to request introductions."
- Progress bar: Replace the amber-tinted `<Progress>` with a thin `h-1` bar using `bg-[#E5E5E5]` track and `bg-[#0E101A]` fill (matching the platform's dark minimal style).

**Make missing fields clickable jump links:**
- Replace the passive `<ul>` dot-list with inline clickable items.
- Each missing field becomes a `<button>` styled as a subtle pill/link: `text-xs text-[#0E101A] font-medium underline-offset-2 hover:underline cursor-pointer`.
- On click, scroll to the corresponding form field using `document.getElementById(fieldKey)?.scrollIntoView({ behavior: 'smooth', block: 'center' })` and optionally `focus()` the input.
- This works because form fields already have `id` attributes matching the field keys (e.g., `id="first_name"`, `id="phone_number"`, `id="fund_size"`).

**Add `getMissingRequiredFields` import** from `@/lib/profile-completeness` (already exports it) to get both the raw keys (for scrolling) and labels (for display), pairing them together.

### Layout
```text
┌──────────────────────────────────────────────┐
│  88% complete                                │
│  Fill in the remaining fields below.         │
│  ████████████████████████░░░░  (thin bar)    │
│                                              │
│  Readiness Window · Equity Source             │
│  (clickable, scrolls to field)               │
└──────────────────────────────────────────────┘
```

No color tints, no icons, no amber. Just typography, spacing, and a dark progress bar. Missing field items separated by `·` or displayed as minimal inline links.

### No other files changed.
