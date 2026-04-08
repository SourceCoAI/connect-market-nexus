

# Webflow Lead Detail View — Source-Aware Layout

## Approach

Route expanded content based on `request.source === 'webflow'` to a new `WebflowLeadDetail` component. This component handles **both** cases — matched marketplace user and guest lead — with a unified layout that makes it clear this is a website form submission, not a conversation.

## Routing Logic (ConnectionRequestRow.tsx)

```text
request.source === 'webflow'?
  YES → WebflowLeadDetail (new component, handles both user & guest)
  NO  → existing logic (user ? ConnectionRequestActions : LeadRequestActions)
```

## New Component: `WebflowLeadDetail.tsx`

### For ALL Webflow leads (common sections)
- **Webflow Source Banner** — blue accent card at top showing: form name, page URL, submission timestamp, Webflow badge
- **Form Submission Card** — read-only display of the message/fields submitted (NOT a conversation thread, NOT a chat bubble). Label: "Form Submission" not "Conversation Thread"
- **Lead Agreement Toggles** — NDA sent/signed, Fee Agreement sent/signed (reuse from `LeadRequestActions`)
- **Follow-up Toggles** — positive/negative follow-up tracking
- **Requested Deal Card** — matched listing info

### When lead IS a marketplace user (`request.user` exists)
- **Marketplace Profile Badge** — prominent green indicator: "This lead has a marketplace profile" with link to their profile
- **Suggestion**: "You can proceed through the marketplace workflow for this user"
- Show the user's company, buyer type, tier info from their profile
- Do NOT show the conversation thread or reply composer

### When lead is NOT a marketplace user (guest)
- **Lead Info Card** — name, email, phone, company, role (from `lead_*` fields and `source_metadata`)
- All form fields from `source_metadata.raw_payload.payload.data` displayed in a clean grid

## Changes

| File | Change |
|------|--------|
| `src/components/admin/WebflowLeadDetail.tsx` | New component — two-mode layout for Webflow leads |
| `src/components/admin/ConnectionRequestRow.tsx` | Lines 604-618: Add `request.source === 'webflow'` check before existing `request.user` branch |

