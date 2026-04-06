

# Fix Misnamed "Marketplace Approval" Email + Correct Catalog

## The Core Confusion

There are two completely different concepts being conflated:

1. **Deal Access Approval** (what `approve-marketplace-buyer` actually does): Admin approves a buyer's request for a *specific deal* and sends them a tracked anonymous teaser link. This is a per-deal action, not a signup action.

2. **Marketplace Signup Approval** (what the user expected "Marketplace Approval" to mean): When a buyer signs up and gets approved to browse the marketplace. This is handled by `user-journey-notifications` (the "Profile Approved" event at line 50 of AdminEmailRouting.tsx).

The catalog entry at line 125 of `EmailCatalog.tsx` is named "Marketplace Approval" but actually represents the deal-level anonymous teaser release. The name, subject, and description all need to accurately reflect what the edge function does.

## Changes

### 1. `src/components/admin/emails/EmailCatalog.tsx`

**Rename the existing entry** (line 125-133):
- **name**: "Marketplace Approval" → "Anonymous Teaser Release"
- **subject**: Keep `Project [Name]: Investment Opportunity` (this is correct for the actual email)
- **trigger**: "Admin approves buyer's deal access request from the marketplace approval queue"
- **designNotes**: Update to mention it sends the anonymous teaser tracked link
- Keep the current `previewHtml` (the anonymous teaser content we fixed last time is correct for this entry)

**Add a NEW entry** in the "Buyer Lifecycle" category for the actual marketplace signup approval:
- **name**: "Marketplace Signup Approved"
- **subject**: "Welcome to the SourceCo Marketplace"
- **recipient**: Buyer
- **trigger**: "Admin approves buyer's marketplace profile/signup"
- **edgeFunction**: "user-journey-notifications" (variant: profile_approved)
- **designNotes**: "Branded wrapper, welcome message, brief explanation of marketplace, CTA to browse deals"
- **previewHtml**: Content explaining they've been approved to browse the marketplace, what the marketplace is (curated platform for off-market deal flow), how it works (browse listings, request introductions, receive teasers), and a CTA to "Browse Deals"

### 2. `src/components/admin/emails/AdminEmailRouting.tsx`

**Rename** line 58:
- "Marketplace Buyer Approved" → "Anonymous Teaser Release" to match the catalog

No other files or edge functions change. This is purely a catalog/labeling fix to accurately represent what each email does.

## Summary of email naming after fix

| Catalog Name | Edge Function | What It Actually Does |
|---|---|---|
| Marketplace Signup Approved | user-journey-notifications | Buyer's profile approved, welcome to marketplace |
| Anonymous Teaser Release | approve-marketplace-buyer | Buyer approved for specific deal, sends teaser link |
| Connection Approval | send-connection-notification | Connection request approved for a deal |

