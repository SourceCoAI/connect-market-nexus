

# Email Preview Modal for Connection Request Approve/Reject

## Summary

Replace the current `ConnectionRequestDialog` (simple confirm + comment box) with a new `ConnectionRequestEmailDialog` that shows the exact email the buyer will receive before the admin clicks send -- same pattern as `ApprovalEmailDialog` for marketplace user approvals.

Since `sourcecodeals.com` is already domain-verified in Brevo, any `@sourcecodeals.com` email address can be used as a sender immediately with no additional setup.

## Plan

### 1. Create `ConnectionRequestEmailDialog` component
New file: `src/components/admin/ConnectionRequestEmailDialog.tsx`

Modeled after `ApprovalEmailDialog.tsx`, this dialog will show:

**For approvals:**
- Recipient info (buyer name, email, company)
- Listing title
- From: `noreply@sourcecodeals.com` (current sender for approval emails)
- Subject preview: "Introduction approved: [Deal Title]"
- Body summary bullets (introduction approved, next steps, exclusive intro language, "View Messages" CTA)
- Optional admin comment field

**For rejections:**
- Same recipient/listing info
- From: `support@sourcecodeals.com`
- Subject preview: "Introduction update: [Deal Title]"
- Body summary (request not selected, encouragement to keep browsing)
- Optional rejection reason field (included in email)

Action button: "Approve & Send Email" / "Reject & Send Email"

### 2. Replace `ConnectionRequestDialog` usage in `AdminRequests.tsx`
- Remove the old `ConnectionRequestDialog` import
- Use the new `ConnectionRequestEmailDialog` instead
- Keep the same `handleAction` / `confirmAction` logic (status update + email send)

### 3. Replace in `MobileConnectionRequests.tsx`
- Same swap for mobile view

### 4. Optional: Add deal owner reply-to
Since the domain is verified, we can set `replyTo` to the deal owner's email (Bill, Aliya, Brandon) so buyer replies go directly to the right person. This requires looking up the deal owner from the listing in the edge function. We can do this as a follow-up if you want.

## Sender Setup -- No Action Needed

Since `sourcecodeals.com` is fully authenticated in Brevo:
- Any `@sourcecodeals.com` address works as `From` or `Reply-To` immediately
- No need to verify individual emails for Bill, Aliya, or Brandon
- If you want emails to come *from* a specific person (e.g., `bill.martin@sourcecodeals.com`), we just update `senderEmail` in the edge function -- no Brevo changes needed
- For now, the preview will show the current senders (`noreply@` for approvals, `support@` for admin notifications)

## Files Changed

| File | Change |
|------|--------|
| `src/components/admin/ConnectionRequestEmailDialog.tsx` | New -- email preview dialog |
| `src/pages/admin/AdminRequests.tsx` | Swap dialog component |
| `src/components/admin/MobileConnectionRequests.tsx` | Swap dialog component |

