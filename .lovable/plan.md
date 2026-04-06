

# Redesign Connection Request Dialog — Premium Minimal

## Current Issues
- Blue info box with colored background clashes with the platform's "quiet luxury" white-dominant aesthetic
- Bold colored accents and tinted backgrounds feel generic
- Layout is functional but not refined

## Changes — Single File

### `src/components/connection/ConnectionRequestDialog.tsx`

**Dialog container**: Keep `sm:max-w-2xl`, add `p-8` for more breathing room.

**Header**: Remove `DialogDescription` wrapper — render the intro text as a plain `<p>` with `text-sm text-[#6B6B6B]` (platform secondary color). Keep the bold listing title. Increase spacing below header.

**Textarea**: Style with `border border-[#E5E5E5] focus:border-[#0E101A] focus:ring-0 rounded-lg bg-white text-sm` — clean single-border input, no colored focus ring. Keep placeholder, rows, min/max length.

**Helper text row**: Keep both strings, style `text-xs text-[#9A9A9A]` — lighter, more receded.

**Info box ("How to get selected")**: Replace blue tinted box with a borderless section using only typography and spacing: a `text-xs font-medium text-[#6B6B6B] uppercase tracking-wide` label, followed by `text-sm text-[#6B6B6B]` body text. No background, no border — separation via spacing only (consistent with quiet luxury principles).

**Footer buttons**: 
- Cancel: `variant="outline"` with `border-[#E5E5E5] text-[#6B6B6B] hover:bg-[#F5F5F5]`
- Send Request: `bg-[#0E101A] text-white hover:bg-[#1a1d2e]` — dark, minimal, no colored brand button. Remove `font-semibold`, use `font-medium`.
- Add `gap-3` between buttons.

**Spacing**: Use `space-y-6` for main content sections instead of `space-y-4`.

No copy or functionality changes. Same character counter, same validation, same placeholder.

