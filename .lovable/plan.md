

## Overview

The buyer Messages page has a solid foundation but is missing a critical piece: **the admin thread view has zero visibility into the buyer's agreement status** (NDA/Fee Agreement). Additionally, the buyer-side agreement banner needs robustness across all states, and document actions (download, sign, question) need to work reliably regardless of whether the buyer has a firm record or not.

This plan addresses all states, tracking surfaces, and edge cases comprehensively.

---

## All Agreement States to Handle

Each agreement (NDA and Fee Agreement) can be in one of these states:

| State | Condition | Buyer sees | Admin sees |
|-------|-----------|------------|------------|
| **No Firm** | No `firm_members` record exists | Nothing (no banner) | "No firm linked" warning |
| **Not Sent** | Firm exists, `docuseal_status` is null, not signed | Nothing (no banner) | "Not Sent" badge + Send button |
| **Sent** | `docuseal_status = 'sent'` | "Ready to Sign" + Sign Now / Download Draft / Questions | "Sent" badge + Resend button |
| **Viewed** | `docuseal_status = 'viewed'` | "Ready to Sign" (same as sent) | "Viewed" badge |
| **Signed** | `nda_signed = true` or `fee_agreement_signed = true` | "Signed" + Download PDF / Questions | "Signed" badge + Download link |
| **Declined** | `docuseal_status = 'declined'` | "Declined -- contact us" | "Declined" badge + Resend button |

---

## What Needs to Change

### 1. Add Agreement Context Panel to Admin Thread View

**Problem**: When an admin opens a message thread, they have no idea whether the buyer has signed their NDA or Fee Agreement. They can't send agreements from the message thread either.

**Solution**: Add a collapsible context sidebar/panel to the right of the message thread in `ThreadView.tsx` that shows:

- Buyer's firm name and agreement statuses (using the existing `useUserFirm` hook + firm agreement data)
- NDA status badge (Not Sent / Sent / Viewed / Signed / Declined)
- Fee Agreement status badge (same states)
- "Send NDA" / "Send Fee Agreement" buttons when not signed (reuses existing `SendAgreementDialog`)
- Download links for signed documents
- Quick link to the full buyer profile / firm detail page

**Implementation**:
- Create `src/pages/admin/message-center/ThreadContextPanel.tsx` -- a new component
- Fetch buyer's firm via `user_id` from the thread's connection request, look up `firm_members` -> `firm_agreements`
- Use existing `DocuSealStatusBadge` and `SendAgreementDialog` components
- Integrate into `ThreadView.tsx` as a right-side panel (collapsible via a toggle button)

### 2. Store `user_id` on InboxThread type for firm lookups

**Problem**: The admin `InboxThread` type doesn't carry `user_id`, which is needed to look up the buyer's firm and agreements.

**Solution**: 
- Add `user_id: string` to the `InboxThread` type in `src/pages/admin/message-center/types.ts`
- Update `useInboxThreads()` in `MessageCenter.tsx` to include `user_id` in the mapped thread data (it's already selected from the query)

### 3. Make buyer-side AgreementSection handle all edge cases

**Problem**: The `PendingAgreementBanner` only shows items when there's a notification or docuseal status. If the firm exists but no submission has been created yet, the buyer sees nothing.

**Solution**: Update `AgreementSection.tsx` to always show agreement rows when a firm exists:
- **Firm exists + not signed + no submission**: Show "Pending -- your NDA/Fee Agreement will be sent shortly"
- **Firm exists + declined**: Show "Declined" state with "Contact Us" action
- **No firm**: Show nothing (current behavior, correct)

### 4. Improve download reliability for all states

**Problem**: Download may fail if there's no submission and no template configured.

**Solution**: Update `AgreementSection.tsx` download button to:
- When `documentUrl` or `draftUrl` is available (from firm record), open directly (current behavior, works)
- When neither is available, disable the download button with a tooltip "Document not yet available"
- This avoids calling the edge function when we already know it will fail

### 5. Tag document-related messages visually in admin thread view

**Problem**: When a buyer sends a question about NDA/Fee Agreement via `DocumentDialog`, the message appears in the thread as a normal message. Admins can't quickly identify agreement-related messages.

**Solution**: In `ThreadView.tsx`, detect messages that start with the document emoji prefix (`\u{1F4C4} Question about`) and render a small colored tag (e.g., "NDA Question" or "Fee Agreement Question") next to the message, similar to the existing "Initial Inquiry" tag.

---

## Files to Change

| File | Change |
|------|--------|
| `src/pages/admin/message-center/types.ts` | Add `user_id: string` to `InboxThread` |
| `src/pages/admin/MessageCenter.tsx` | Map `user_id` from request data into thread object |
| `src/pages/admin/message-center/ThreadContextPanel.tsx` | **New file** -- buyer agreement context panel with firm status, badges, send/download actions |
| `src/pages/admin/message-center/ThreadView.tsx` | (1) Add collapsible context panel toggle. (2) Detect and tag document-question messages with colored labels |
| `src/pages/BuyerMessages/AgreementSection.tsx` | Handle "not sent" and "declined" states; disable download when no URL available |

## Technical Details

**ThreadContextPanel data flow**:
1. Receives `userId` from the selected thread
2. Queries `firm_members` for the user's `firm_id`
3. Queries `firm_agreements` for agreement statuses
4. Renders `DocuSealStatusBadge` for each agreement type
5. Renders `SendAgreementDialog` for sending unsigned agreements
6. Shows buyer email and profile link for quick access

**Message tagging logic** (in ThreadView):
- Check if `msg.body.startsWith('\u{1F4C4} Question about NDA')` -> render `[NDA Question]` tag
- Check if `msg.body.startsWith('\u{1F4C4} Question about Fee Agreement')` -> render `[Fee Agreement]` tag
- Uses the same tag styling as the existing "Initial Inquiry" badge

**AgreementSection state matrix**:
- `firmStatus === null` -> render nothing (no firm)
- `firmStatus.nda_signed === true` -> render signed row
- `firmStatus.nda_docuseal_status === 'declined'` -> render declined row with Contact Us
- `firmStatus.nda_docuseal_status` is `'sent'` or `'viewed'` -> render pending row with Sign Now
- Firm exists but no docuseal status and not signed -> render "awaiting" row (informational only)

