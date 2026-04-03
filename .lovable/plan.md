

# Email Catalog Preview Overhaul

## Problem

The 33 production edge functions are clean. But the **EmailCatalog.tsx preview HTML** (what you see in the dashboard) still has ~60 violations of the design spec. The previews do not match what the actual emails look like.

## Issues Found (all in `src/components/admin/emails/EmailCatalog.tsx`)

### Em dashes in subjects and preview copy (~15 instances)
- Line 72: `Email Verified Successfully — What's Next`
- Line 90: `Reset Your Password — SourceCo`
- Line 104: `here's a quick look` / `Hi there —`
- Line 113: `Don't miss out —`
- Line 122: `Project [Name] — Investment Opportunity`
- Line 149: `Introduction request received — [Deal]`
- Line 169: `New Connection Request: [Deal] — [Buyer]`
- Line 179: `New deal — matches your mandate.`
- Line 193: `Take a look at this — right in your sweet spot.`
- Line 213: `One more step —`
- Line 242: `Data room open — Project [Name]`
- Line 265: emoji subjects `🔄`, `📌`
- Line 324: `New Buyer Message: [Deal] — [Buyer]`
- Line 348: `Email confirmed —`
- Line 457: `Hi there —`

### Emojis in subjects and preview HTML (~8 instances)
- Line 256: `✨ New Deal Assigned`
- Line 265: `🔄` and `📌` in reassignment subject
- Line 283: `🏢 New Owner Inquiry`
- Line 288: `🏢` in preview heading
- Line 292: `🤝 Owner Intro Requested`
- Line 297: `🤝` in preview heading
- Line 306: `📎` paperclip icon
- Line 402: `${priorityEmoji}` in subject
- Line 448: `ℹ️` in preview heading
- Line 491: `⚠️` in broken notice

### Blue left-borders (not in the design spec) (~2 instances)
- Line 320: `border-left: 4px solid #3b82f6` on message quote
- Line 407: `border-left: 4px solid #3b82f6` on feedback message

### `<strong>` bold labels (~20 instances)
- Lines 175, 228, 238, 261, 279, 288, 297, 306, 384, 398, 407, 425: `<strong>Deal:</strong>`, `<strong>Company:</strong>`, etc.

### Wrong colors (Tailwind/Slate instead of brand palette)
- `#1e293b`, `#475569`, `#64748b`, `#0f172a`, `#334155`, `#94a3b8` used everywhere instead of `#1A1A1A` (primary) and `#6B6B6B` (secondary)
- `#f8fafc` used instead of `#F7F6F3` for info boxes
- `#e2e8f0` borders instead of no borders

### Borders that should not exist
- Line 184: `border: 1px solid #e2e8f0` on deal card
- Line 193: `border: 1px solid #e2e8f0` and `border-left: 2px solid`
- Line 261: `border: 1px solid #e2e8f0` on deal info card
- Line 261: `border: 1px solid #fde68a` yellow warning box
- Line 306: `border: 1px solid #e2e8f0` on memo card
- Line 329: `border: 1px solid #e2e8f0` on message card
- Line 491: `border: 1px solid #fecaca` on broken notice

### Yellow/amber warning box in new deal owner preview
- Line 261: `#fffbeb` background, `#92400e` text, `#78350f` list items

### `font-weight: 600` in preview tables
- Lines 127, 270: bold values in data tables

## Plan

### Single file change: `src/components/admin/emails/EmailCatalog.tsx`

Rewrite all 42 `previewHtml` strings and all `subject` strings to:

1. **Remove every em dash** (`—`, `–`). Replace with periods or restructured sentences.
2. **Remove every emoji** (`✨`, `🏢`, `🤝`, `📎`, `ℹ️`, `⚠️`, `🔄`, `📌`, `${priorityEmoji}`).
3. **Remove all `<strong>` / `<b>` tags**. Use `color: #6B6B6B` for labels instead.
4. **Replace all Tailwind/Slate colors** with brand palette: `#1A1A1A` (primary text), `#6B6B6B` (secondary/labels), `#9B9B9B` (muted), `#F7F6F3` (info box bg).
5. **Remove all `border:`, `border-left:`, `border-top:`** from preview inline styles. Only `border-radius: 6px` on CTAs.
6. **Remove yellow/amber warning boxes** and colored accent backgrounds.
7. **Remove `font-weight: 600`** from data values in tables.
8. **Ensure subjects match production** edge function subjects exactly (no em dashes, no emojis).

No edge function files need changes. Only `EmailCatalog.tsx`.
