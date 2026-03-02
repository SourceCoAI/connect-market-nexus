

## Admin Inbox -- Premium Minimal Redesign

### Overview

Align the admin Message Center with the "quiet luxury" design language: white-dominant, hairline dividers, gold as accent only, typography-driven hierarchy, flat design. Remove visual noise (heavy borders, gold backgrounds, colored dots, excessive badges) in favor of clarity.

### Changes by File

#### 1. `MessageCenter.tsx` -- Page Shell + Header + Thread List

**Header:**
- Title: "Inbox" with unread count inline -- e.g. "Inbox (3)" when unread > 0, just "Inbox" otherwise
- Remove subtitle paragraph ("X unread conversations" / "All caught up")
- View mode toggle: white background with hairline border (#F0EDE6) instead of gold (#F7F4DD)
- Filter tabs: active state uses underline + bold text instead of solid black pill; inactive uses plain text; count badges use subtle gray (#F0EDE6) instead of dark red (#8B0000) for non-urgent filters

**Container:**
- Replace `border: 2px solid #CBCBCB` with `border: 1px solid #F0EDE6`
- White background (already `#FFFFFF`, keep it)

**Search:**
- White background instead of `#FCF9F0`
- Border: `1px solid #F0EDE6` instead of `#CBCBCB`
- Remove gold-tinted background

**Thread list dividers:**
- Replace `divide-border/40` with explicit `border-bottom: 1px solid #F0EDE6`

#### 2. `ThreadListItem.tsx` -- Sidebar Thread Rows

**Simplify each row:**
- Remove colored state dots (Circle, Clock, User, CheckCheck icons at left)
- Remove agreement micro-badges (NDA/Fee status pills) -- this info belongs in context panel
- Remove Pipeline badge and Claimed badge
- Keep only: buyer name, time, request status (as minimal text), one-line preview
- Unread: bold font-weight only (no gold background `#FFFDF5`)
- Selected: 2px gold left border (`#DEC76B`) + very light background (`#FAFAF8`) instead of `bg-accent`
- Unread badge: subtle gold circle (`#DEC76B` bg, `#0E101A` text) instead of dark red (`#8B0000`)
- Tighter padding for editorial feel

#### 3. `DealGroupSection.tsx` -- Deal Group Headers

- Remove `FileText` icon with gold tint
- Text-only header: deal title + thread count
- Unread badge: gold (`#DEC76B`) instead of dark red
- Lighter chevron color
- Remove gold background on unread groups (`#FFFDF5`)

#### 4. `ThreadView.tsx` -- Header + Messages + Compose

**Header:**
- Simplify: buyer name + deal on one line with dot separator (plain text, no icons for Building2/FileText)
- Remove conversation state badge pill (redundant -- visible in sidebar filter)
- Keep action buttons (context toggle, pipeline, claim, close) but use hairline bottom border `#F0EDE6`

**Messages area:**
- Background: pure white `#FFFFFF` instead of `#FCF9F0`
- Admin bubbles: `#F8F8F6` background, no border, no shadow
- Buyer bubbles: white with `1px solid #F0EDE6`, no shadow
- Remove `shadow-sm` from all bubbles
- Move sender + time labels outside/above the bubble as a standalone line
- Keep `MessageBody` for reference chip rendering (already integrated)
- System messages: lighter styling, `#F8F8F6` background

**Compose bar:**
- Already minimal (text input + send button) -- just update border to `#F0EDE6`
- Keep reference picker, keep hint text

#### 5. `ThreadContextPanel.tsx` -- Right Sidebar

- Background: white `#FFFFFF` instead of `#FCF9F0`
- Border: `1px solid #F0EDE6` instead of `#E5DDD0`
- Remove bordered card containers for NDA/Fee rows -- use flat layout with hairline dividers
- Agreement status: use text-only labels (green text "Signed", gold text "Pending") instead of `Badge` components with colored backgrounds
- Timeline vertical line: `#F0EDE6` instead of `#E5DDD0`
- Timeline icon circles: white background instead of `#FCF9F0`
- Thread cards: remove borders, use hairline bottom dividers
- Section headers: lighter weight, keep uppercase but use `#CBCBCB` instead of `#9A9A9A`

#### 6. `MessageCenterShells.tsx` -- Loading + Empty States

- Container: `1px solid #F0EDE6` instead of `2px solid #CBCBCB`
- Background: white instead of `#FCF9F0`
- Skeleton colors: `#F0EDE6` instead of `#E5DDD0`
- Empty state icon: lighter, smaller

### Design Principles Applied

- White-dominant with gold (#DEC76B) as accent only
- Typography-driven hierarchy: weight and size differentiate, not colored badges
- Hairline dividers (1px #F0EDE6) replacing all heavy borders
- Flat design: no shadows on message bubbles
- Reduced information density in thread list; detail lives in context panel
- Consistent with buyer-side "quiet luxury" aesthetic

### Files Modified

| File | Summary |
|------|---------|
| `src/pages/admin/MessageCenter.tsx` | White search, hairline container, simplified header, underline filters |
| `src/pages/admin/message-center/ThreadListItem.tsx` | Remove state dots/badges, font-weight unread, gold left-border selection |
| `src/pages/admin/message-center/DealGroupSection.tsx` | Minimal text header, gold unread badge |
| `src/pages/admin/message-center/ThreadView.tsx` | White message bg, flat bubbles, external sender labels, hairline borders |
| `src/pages/admin/message-center/ThreadContextPanel.tsx` | White bg, flat agreement rows, text status, lighter timeline |
| `src/pages/admin/message-center/MessageCenterShells.tsx` | Hairline borders, white bg, lighter skeletons |

