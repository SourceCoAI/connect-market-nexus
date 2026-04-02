

# Agreement Emails — Already Working via Brevo

## Current State (Verified)

The agreement emails are **already fully set up and sending via Brevo**. Here's the proof from the database:

- `adambhaile00@gmail.com` — 3 NDA requests and 1 Fee Agreement request, all with `status: email_sent`
- `dustin@critical-services-group.com` — 1 NDA request with `status: email_sent`
- `firm_agreements` table correctly updated to `nda_status: sent` with timestamps

The `request-agreement-email` edge function is deployed, uses `sendViaBervo()` (shared Brevo sender with retry logic), and the `BREVO_API_KEY` secret is configured.

## What's Already Working

| Component | Status |
|-----------|--------|
| Edge function `request-agreement-email` | Deployed, functional |
| Brevo API integration via `sendViaBervo()` | Working (retries, error handling) |
| Sender: `support@sourcecodeals.com` | Configured |
| Reply-to: `support@sourcecodeals.com` | Configured |
| DOCX attachments in storage bucket | Uploaded (NDA.docx, FeeAgreement.docx) |
| Download links in email body | Working |
| `document_requests` tracking | Recording all requests |
| `firm_agreements` status sync | Updating to "sent" on success |
| Admin notifications on request | Working |

## Two Emails Defined

### 1. NDA Email
- **Subject**: "Your NDA (Non-Disclosure Agreement) from SourceCo"
- **From**: SourceCo `<support@sourcecodeals.com>`
- **Reply-to**: SourceCo Support `<support@sourcecodeals.com>`
- **Body**: Greeting, download button (links to NDA.docx in storage), 3-step signing instructions (review → sign → reply with signed copy), footer
- **Trigger**: Buyer clicks "Request NDA" in AgreementSigningModal, NdaGateModal, or admin sends from UsersTable/Document Tracking

### 2. Fee Agreement Email
- **Subject**: "Your Fee Agreement from SourceCo"
- **From**: SourceCo `<support@sourcecodeals.com>`
- **Reply-to**: SourceCo Support `<support@sourcecodeals.com>`
- **Body**: Same structure as NDA but with Fee Agreement document
- **Trigger**: Buyer clicks "Request Fee Agreement" in AgreementSigningModal, FeeAgreementGate, or admin sends

## Possible Issue: Email Deliverability

If emails aren't arriving in inboxes despite successful Brevo API calls, the likely cause is:

1. **`support@sourcecodeals.com` not verified as a sender in Brevo** — Brevo requires senders to be verified in their dashboard (Settings → Senders). The API call succeeds (returns 200 + messageId) but Brevo may silently drop or flag the email if the sender isn't verified.

2. **SPF/DKIM/DMARC not configured** for `sourcecodeals.com` pointing to Brevo's sending infrastructure.

## What You Need to Do in Brevo Dashboard

1. Go to **Brevo → Settings → Senders & IP → Senders** and verify `support@sourcecodeals.com` is listed as a verified sender
2. Go to **Brevo → Settings → Senders & IP → Domains** and verify `sourcecodeals.com` has SPF and DKIM records configured
3. Check **Brevo → Transactional → Email Logs** to see if the emails appear there and what their delivery status is (delivered, bounced, blocked)

These are Brevo dashboard actions — no code changes needed. The platform code is complete and working correctly.

