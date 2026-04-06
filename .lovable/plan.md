

# End-to-End Email Audit: Findings and Fixes

## Methodology

I cross-referenced three sources:
1. **AdminEmailRouting.tsx** (35 email entries across 8 categories)
2. **EmailCatalog.tsx** (43 email entries across 7 categories)
3. **Actual edge functions** in `supabase/functions/`

## Issues Found

### Issue 1: EmailCatalog references non-existent edge function
The "Enhanced Admin Notification" entry in EmailCatalog (line 409) references `send-enhanced-admin-notification`, but the actual function is named `enhanced-admin-notification` (no `send-` prefix). The AdminEmailRouting correctly uses `enhanced-admin-notification`.

**Fix**: Change `edgeFunction` from `send-enhanced-admin-notification` to `enhanced-admin-notification` in EmailCatalog.tsx line 409.

### Issue 2: Missing emails in EmailCatalog (present in AdminEmailRouting but not in Catalog)
These emails exist in AdminEmailRouting and have working edge functions, but are missing from the EmailCatalog with previews:

- **New Buyer Message to Support** (`notify-support-inbox`) — When a buyer sends a message, support gets notified
- **Admin Reply Copy to Support** (`notify-support-inbox`, variant: admin_reply) — When admin replies, support inbox gets a copy
- **Document Request to Support** (`notify-support-inbox`, variant: document_request) — Document request notification
- **Inquiry Confirmation to Buyer** (`notify-buyer-inquiry-received`) — Confirmation email when buyer asks a question
- **Marketplace Signup Approved** — Present in EmailCatalog's Buyer Lifecycle section but missing from AdminEmailRouting (already fixed in last change)

**Fix**: Add these 4 missing emails to EmailCatalog with proper previews matching their actual edge function output.

### Issue 3: Missing emails in AdminEmailRouting (present in Catalog but not in Routing)
These emails have catalog entries and working edge functions but are missing from AdminEmailRouting:

- **Buyer Rejection** (`notify-buyer-rejection`)
- **Deal Reassignment** (`notify-deal-reassignment`) 
- **New Deal Owner** (`notify-new-deal-owner`)
- **Marketplace Signup Approved** (`user-journey-notifications`, variant: `profile_approved`) — The new entry we just added to the catalog

**Fix**: Add these 4 entries to the correct categories in AdminEmailRouting.

### Issue 4: Verified working — no issues
These emails are correctly cataloged, correctly routed, and have working edge functions:
- All Buyer Lifecycle emails (welcome, verification, approval, anonymous teaser release, invitation, connection request/approval)
- All Agreement emails (NDA, Fee Agreement, Agreement Confirmed)
- All Deal Flow emails (deal alert, deal referral, memo, data room access)
- Messaging: buyer new message, admin new message
- User Journey Notifications (all 4 variants)
- All onboarding emails (day 2, day 7)
- Password reset, verification fix, feedback, task notification, etc.

### Issue 5: Admin Digest correctly flagged as broken
The `admin-digest` function calls a deleted `enhanced-email-delivery` dependency. It is correctly flagged as "broken" in the catalog. No action needed now.

## Changes — 2 Files

### 1. `src/components/admin/emails/EmailCatalog.tsx`

- **Fix edge function name**: Line 409, change `send-enhanced-admin-notification` to `enhanced-admin-notification`
- **Add 4 missing entries**:
  - In "Messaging" category: add "Support Inbox: New Message", "Support Inbox: Admin Reply", "Support Inbox: Document Request" (all `notify-support-inbox` with different variants), and "Inquiry Confirmation" (`notify-buyer-inquiry-received`)

### 2. `src/components/admin/emails/AdminEmailRouting.tsx`

- **Add to Buyer Lifecycle**: "Marketplace Signup Approved" (`user-journey-notifications`, Profile Approved variant)
- **Add to Buyer Lifecycle**: "Buyer Rejection" (`notify-buyer-rejection`)
- **Add to Deal Flow**: "Deal Reassignment" (`notify-deal-reassignment`) and "New Deal Owner Assigned" (`notify-new-deal-owner`)

## Summary

| Check | Result |
|---|---|
| All edge functions exist on disk | Pass (except `admin-digest` dependency, already flagged) |
| Catalog edge function names match actual | 1 fix needed (`send-enhanced-admin-notification` typo) |
| All emails in Routing also in Catalog | 4 missing, will add |
| All emails in Catalog also in Routing | 4 missing, will add |
| Sender identity correct | Pass (all use `support@`, except Anonymous Teaser uses `adam.haile@`) |
| Preview HTML matches actual email content | Pass (all previews accurately represent edge function output) |
| `senderEmail` override works for marketplace approval | Pass (verified in `email-sender.ts` and `approve-marketplace-buyer`) |

No edge function code changes needed. This is purely a catalog/routing dashboard sync.

