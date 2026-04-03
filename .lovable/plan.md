

# Restructure Admin Message Center Layout

## Problem

The three-column layout (380px thread list + chat + 280px context panel) totals 660px of fixed widths plus 48px of horizontal margin (`mx-6`), leaving only ~543px for the chat area in a 1251px viewport. The right context panel clips off-screen with no way to scroll to it.

## Solution

Restructure the layout to use the full viewport width and better proportions:

### Layout Changes

**`src/pages/admin/MessageCenter.tsx`**
- Remove `mx-6 mb-6 rounded-xl` from the main content container -- use full bleed layout
- Reduce thread list from `w-[380px]` to `w-[320px]`
- Move header into a tighter top bar with less padding

**`src/pages/admin/message-center/ThreadContextPanel.tsx`**
- Reduce width from `w-[280px]` to `w-[260px]`
- Add `hidden lg:flex` so it auto-hides on smaller screens (only shows on lg+)

**`src/pages/admin/message-center/ThreadView.tsx`**
- Default `showContext` to `false` so the chat gets full width on load
- Context panel only appears when toggled, preventing the cramped 3-column default

### Result
- No conversation selected: 320px list + empty state fills remaining space
- Conversation selected (context hidden): 320px list + full chat area (~930px)
- Conversation selected (context shown): 320px list + chat (~670px) + 260px context
- Full width usage -- no wasted margin on a tool screen

### Files changed
- `src/pages/admin/MessageCenter.tsx` -- remove margins, reduce list width
- `src/pages/admin/message-center/ThreadView.tsx` -- default showContext to false
- `src/pages/admin/message-center/ThreadContextPanel.tsx` -- reduce width, responsive hide

