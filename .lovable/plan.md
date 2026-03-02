

## Buyer Messages -- Fix "General Inquiry" Ghost Deal + Premium Redesign

### Problems Identified

1. **"General Inquiry" appears as a real deal** -- The internal listing (`00000000-0000-0000-0000-000000000001`) leaks into the thread list, showing up as a deal called "General Inquiry" in both the conversation sidebar and the Reference Panel (under "Your Deals" and "Your Requests"). This confuses users since it's not a real deal.

2. **Duplicate conversation entries** -- The General Inquiry thread appears twice: once as the hardcoded "General Inquiry" button at the top of the list, and again as a regular thread item below it (from the `useBuyerThreads` query).

3. **Layout and polish issues** -- Spacing is inconsistent, the agreement banner floats awkwardly between header and content, and the overall composition lacks the Apple/Stripe-level clarity requested.

### Solution

#### Data Layer Fix

**`useMessagesData.ts`** -- Filter the internal listing from `useBuyerThreads` results:
- Add a constant `GENERAL_INQUIRY_LISTING_ID = '00000000-0000-0000-0000-000000000001'`
- Filter threads where `listing_id === GENERAL_INQUIRY_LISTING_ID` out of the returned array
- This prevents the ghost deal from appearing anywhere in the UI
- The General Chat still works separately via `useResolvedThreadId`

Also export the constant so other components can use it if needed.

#### Reference Panel Fix

**`ReferencePanel.tsx`** -- Filter out internal listing threads:
- Import the `GENERAL_INQUIRY_LISTING_ID` constant
- In "Your Deals" and "Your Requests" sections, filter out threads with the internal listing ID
- Show "No deals yet" / "No requests yet" when only the internal thread exists

#### Conversation List Fix

**`ConversationList.tsx`** -- Since the data layer now filters out the internal listing, the duplicate is eliminated automatically. The hardcoded "General Inquiry" button remains as the only entry point for general messages. Rename it to "SourceCo Team" for clarity.

#### Design Overhaul (All Files)

**`index.tsx`** -- Streamlined page layout:
- Move the agreement banner inside the three-column container as a top-bar spanning all columns, not floating above
- Cleaner header: remove the border-bottom, use spacing only
- Full-height layout with no outer padding gaps

**`ConversationList.tsx`** -- Refined sidebar:
- Rename "General Inquiry" to "SourceCo Team" with subtitle "Ask us anything"
- Tighter thread items with better typography hierarchy
- Remove redundant empty states

**`GeneralChatView.tsx`** -- Update header from "General Inquiry" to "SourceCo Team"

**`MessageThread.tsx`** -- Polish the thread view header:
- Cleaner alignment and spacing
- Consistent with the rest of the layout

**`ReferencePanel.tsx`** -- Visual refinement:
- Cleaner section spacing
- Better empty state messaging

**`AgreementSection.tsx`** -- Integrated banner:
- Horizontal inline layout that fits inside the three-column container top bar
- More compact rows

### Files Changed

| File | Change |
|------|--------|
| `src/pages/BuyerMessages/useMessagesData.ts` | Filter out internal listing from `useBuyerThreads`, export constant |
| `src/pages/BuyerMessages/index.tsx` | Move agreement banner inside content area, cleaner layout |
| `src/pages/BuyerMessages/ConversationList.tsx` | Rename "General Inquiry" to "SourceCo Team", polish |
| `src/pages/BuyerMessages/GeneralChatView.tsx` | Rename header to "SourceCo Team" |
| `src/pages/BuyerMessages/ReferencePanel.tsx` | Filter out internal listing threads |
| `src/pages/BuyerMessages/AgreementSection.tsx` | More compact integrated banner |

