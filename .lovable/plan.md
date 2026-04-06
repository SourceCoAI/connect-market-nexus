

# Fix Email Catalog: "Marketplace Approval" Preview Is Inaccurate

## Problem

The "Marketplace Approval" entry in the Email Catalog (`EmailCatalog.tsx`, line 125) shows a preview with:
- "You have been approved to view this investment opportunity"
- A table with Company name, Revenue, EBITDA
- A "View Deal Details" CTA

But the **actual email** sent by `approve-marketplace-buyer` contains:
- "We are pleased to share the Anonymous Teaser for Project [Name]"
- A "View Investment Teaser" button (tracked link to anonymous teaser)
- A confidentiality notice
- No company name, no revenue, no EBITDA — it is an **anonymous** teaser release

The preview is completely misrepresenting what the email actually sends.

## Changes — Single File

### `src/components/admin/emails/EmailCatalog.tsx` (lines 124-131)

Update the "Marketplace Approval" entry to match the real email:

- **name**: Keep "Marketplace Approval" (or rename to "Anonymous Teaser Release" for clarity)
- **subject**: `Project [Name]: Investment Opportunity` (correct, keep)
- **trigger**: `Admin approves buyer from marketplace approval queue`
- **designNotes**: `Branded wrapper, anonymous teaser link, confidentiality notice, CTA to view teaser`
- **previewHtml**: Replace the company/revenue/EBITDA table with content matching the actual email:
  - "Thank you for your interest in this investment opportunity. We are pleased to share the Anonymous Teaser for Project [Name] with you."
  - CTA button: "View Investment Teaser"
  - Confidentiality notice: "This is a private, tracked link generated exclusively for you. Do not share or forward this link."
- **from**: Add `adam.haile@sourcecodeals.com` if there's a from field, to reflect the actual sender

