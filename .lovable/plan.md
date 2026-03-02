

## Buyer Messages Screen -- Premium Minimal Redesign

### Current Issues (from screenshot)
- Heavy 2px gray border around the main container feels dated
- Agreement banner has cluttered row-by-row borders and dense chip layout
- Conversation list items are visually noisy (colored dots, status chips, category text all competing)
- Message area background (#FCF9F0 gold tint) makes the whole right panel feel heavy
- "Enter to send" helper text below compose bar is unnecessary visual noise
- Thread headers repeat information already visible in the sidebar
- Inconsistent spacing and alignment throughout
- Unread badge (dark red circle) clashes with the premium palette

### Design Direction
Refined, quiet luxury aesthetic aligned with SourceCo brand -- white-dominant with gold accents used sparingly, generous whitespace, hairline dividers, and typography-driven hierarchy instead of colored badges.

### Changes by Component

**1. Page Header (`index.tsx`)**
- Remove the subtitle line ("2 unread messages" / "Conversations with...")
- Move unread count into the "Messages" title as a subtle parenthetical: `Messages (2)`
- Make "New Message" button outline-style with gold accent instead of solid black
- Add a thin bottom border instead of relying on spacing alone

**2. Agreement Banner (`AgreementSection.tsx`)**
- Remove the bordered card container entirely
- Replace with a single-line horizontal strip per document, no enclosing box
- Use a minimal left-accent gold bar (2px) for pending items only
- Remove "ACTION REQUIRED" header -- the gold accent communicates urgency
- Status chips: use text-only labels (no background pill) -- "Signed" in muted green text, "Pending" in gold text
- Collapse signed documents into a single summary line: "NDA Signed -- Fee Agreement Pending"
- When all signed, show nothing (remove the section entirely for clean state)

**3. Conversation List (`ConversationList.tsx`)**
- Remove the colored unread dot indicator -- use font weight alone (bold = unread)
- Remove status badge chips (Connected, Under Review) from thread items
- Show only: deal title (bold if unread), time, and one-line preview
- Unread count badge: switch from dark red to a subtle gold circle
- Search input: remove gold background tint, use plain white with hairline border
- General Inquiry item: remove the gold icon, use plain text with a subtle "General" label
- Selected state: use a 2px gold left border instead of gray background highlight
- Reduce padding for tighter, more editorial feel

**4. Thread Header (`MessageThread.tsx` + `GeneralChatView.tsx`)**
- Simplify to just the title + "View deal" link on the right
- Remove status badge from header (redundant with sidebar)
- Remove "SourceCo Team" subtitle -- implied by context
- Clean hairline bottom border

**5. Message Bubbles (`MessageList.tsx` + `MessageBody.tsx`)**
- Change message area background from #FCF9F0 to pure white (#FFFFFF)
- Buyer messages: keep dark (#0E101A) but soften border radius to 16px with 12px on the tail corner
- Admin messages: use #F8F8F6 (very light warm gray) instead of pure white with border
- Remove shadow-sm from message bubbles -- flat design
- Remove the border on admin messages -- background contrast is sufficient
- Sender name + time: consolidate into a single line above the bubble, outside the bubble
- Read receipts: make more subtle -- just a small double-check icon, no "Read"/"Delivered" text

**6. Compose Bar (`MessageInput.tsx`)**
- Remove the outer border container -- use a single input field with integrated send button
- Remove "Enter to send" text
- Send button: icon-only (no text), circular, gold background on hover
- Attachment button: more subtle, just the icon with no visible button chrome
- Overall: thinner, more like iMessage/WhatsApp compose bar

**7. Empty/Loading States**
- Skeleton: match the new minimal layout (thinner lines, no heavy borders)
- Empty state: smaller icon, lighter text, more whitespace

### Technical Scope

| File | Changes |
|------|---------|
| `src/pages/BuyerMessages/index.tsx` | Simplify header, remove subtitle, refine container border, adjust spacing |
| `src/pages/BuyerMessages/AgreementSection.tsx` | Redesign to minimal inline strip with gold accent bars, remove card wrapper |
| `src/pages/BuyerMessages/ConversationList.tsx` | Remove status chips/dots, gold left-border selection, tighten spacing |
| `src/pages/BuyerMessages/MessageThread.tsx` | Simplify thread header, clean skeleton |
| `src/pages/BuyerMessages/GeneralChatView.tsx` | Match simplified header pattern, white message background |
| `src/pages/BuyerMessages/MessageList.tsx` | White background, remove bubble borders/shadows, external sender labels |
| `src/pages/BuyerMessages/MessageInput.tsx` | Minimal compose bar, icon-only send, remove helper text |
| `src/pages/BuyerMessages/MessageBody.tsx` | No structural changes, just inherits new bubble styling |

### Visual Summary

```text
Before:                          After:
+--[2px border]-------------+   +--[hairline]----------------+
| ACTION REQUIRED            |   |  NDA Signed                |
| [icon] NDA [Signed] [PDF]  |   |  Fee Agreement  Sign Now > |
| [icon] Fee [Pending] [Sign]|   +-----------------------------+
+----------------------------+   |                             |
| [Search...........]        |   | Search...                   |
| * General Inquiry          |   | | General                   |
| * Deal Title  [Connected]  |   | | Deal Title        2m ago  |
|   Category   2m     (2)    |   | |   Last message...         |
|   Last message preview...  |   |                             |
+----------------------------+   +-----------------------------+
```

### Design Principles Applied
- White-dominant with gold as accent only
- Typography-driven hierarchy (weight, size) over colored badges
- Hairline dividers (1px #F0EDE6) instead of heavy borders
- Generous whitespace signals premium
- Flat design -- no shadows on message bubbles
- Information density reduced to essentials only
