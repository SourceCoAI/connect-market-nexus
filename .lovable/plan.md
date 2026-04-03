
# Listing Sidebar: Action Rows + Deal Inquiry Messaging

## What We're Building

Redesign the listing detail sidebar to include structured action rows (inspired by the reference screenshots), alongside the existing connection request flow:

1. **Explore Data Room** -- navigates to the data room section on the page. Enabled only when fee agreement is signed AND connection is approved.
2. **Ask a Question** -- opens an inline chat/message panel. Enabled when fee agreement is signed (no connection required).
3. **Tooltips on disabled rows** explaining what the buyer needs to do.
4. **"Viewed" timestamp** on data room row if they've accessed it before.
5. **Full messaging system** for questions: messages routed to admin Message Center, history preserved on both sides.

## Architecture Decision: Reuse connection_messages

Rather than creating a new table, we reuse the existing `connection_messages` + `connection_requests` infrastructure. When a buyer "asks a question" on a listing without a connection request, we auto-create a connection request with `source = 'inquiry'`. This means:
- Admin Message Center picks it up automatically
- Realtime subscriptions, email notifications, and read receipts all work out of the box
- No new tables or edge functions needed

## Sidebar Layout

```text
┌──────────────────────────────────┐
│  Request Access to This Deal     │
│  (existing description copy)     │
│                                  │
│  ┌────────────────────────────┐  │
│  │ ◇ Explore data room     > │  │  (greyed + tooltip if locked)
│  │   Viewed Nov 19, 2025      │  │  (if viewed before)
│  ├────────────────────────────┤  │
│  │ ? Ask a question        > │  │  (greyed + tooltip if no fee)
│  ├────────────────────────────┤  │
│  │ [ConnectionButton]         │  │  (existing component)
│  ├────────────────────────────┤  │
│  │ [Save] [Share]             │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
```

## Gating Rules

- **Explore Data Room**: Fee agreement signed + connection approved. Tooltip if locked explains the missing step.
- **Ask a Question**: Fee agreement signed only. No connection required. Opens inline chat.
- **Request Connection**: Existing ConnectionButton logic (fee agreement gate).

## Tooltip Text (when disabled)

- Data Room (no fee): "Sign your Fee Agreement to unlock the data room."
- Data Room (fee signed, no approved connection): "Request a connection to access the data room."
- Ask a Question (no fee): "Sign your Fee Agreement to ask questions about this deal."

## Technical Details

### New Files
- `src/components/listing-detail/ListingSidebarActions.tsx` -- action rows with gating, tooltips, inline question chat
- `src/hooks/marketplace/use-deal-inquiry.ts` -- find or create inquiry connection_request for messaging

### Modified Files
- `src/pages/ListingDetail.tsx` -- replace sidebar card content with new component

### How "Ask a Question" Works
1. Hook `useDealInquiry(listingId)` checks for an existing connection_request for this user+listing. If none exists, creates one with `source = 'inquiry'` on first message send.
2. Messages sent via existing `useSendMessage` hook with `sender_role: 'buyer'`.
3. Thread appears in admin Message Center automatically (existing infrastructure).
4. Buyer sees message history inline in the sidebar panel.
5. Email notifications fire automatically (existing `notify-admin-new-message` edge function).

### No database changes needed
`connection_requests.source` is a free-text column -- we use value `'inquiry'` to distinguish question-only threads from full connection requests.
