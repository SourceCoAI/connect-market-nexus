

# Make Document Request Prominent, Direct, and Cooldown-Protected

## Changes

### 1. `ListingSidebarActions.tsx` — Prominent request button + direct send + cooldown

**More prominent request button:**
- Replace the subtle "Request documents →" text link with a proper styled button — dark background, full-width within the documents section, clear CTA copy like "Request Documents"
- When only one document needs requesting, button says "Request Fee Agreement" or "Request NDA"

**No modal — direct send:**
- Instead of opening `AgreementSigningModal`, clicking the button directly calls `sendAgreementEmail()` for each unsigned document
- If both are unsigned: fire two parallel `sendAgreementEmail` calls (one for `nda`, one for `fee_agreement`)
- If only one is unsigned: fire one call for that type
- Show loading spinner on button while sending
- On success: show toast "Documents sent to your email"

**Post-request state + 1-minute cooldown:**
- After successful send, update the document labels from "Not requested" to "Requested" with a subtle timestamp
- Store `lastRequestedAt` in component state (initialized from `agreementStatus.nda_requested_at` / `fee_agreement_requested_at` if available)
- Disable the button for 60 seconds after a successful send, showing countdown text like "Request again in 48s"
- After cooldown expires, button re-enables with text "Resend documents"

**Remove `AgreementSigningModal` import** — no longer needed in this component.

### 2. `AgreementSigningModal.tsx` — Fix copy

- Remove "You only need one to access deals" (no longer accurate since Fee Agreement is required)
- This modal is still used elsewhere (e.g., marketplace card buttons), so keep it functional but update the misleading copy

### Files changed
- `src/components/listing-detail/ListingSidebarActions.tsx` — prominent button, direct send, cooldown
- `src/components/pandadoc/AgreementSigningModal.tsx` — fix "only need one" copy

