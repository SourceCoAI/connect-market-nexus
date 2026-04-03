

# Streamline Document Request Flow in Sidebar

## Problem

When both documents are unsigned and show "Not requested," the user has to scroll down to the ConnectionButton area, click "Request Agreement via Email," then go through the modal to pick which document. The flow should be simpler: click a "Request" link right next to the document status, and if both are unsigned, one click sends both.

## Changes

### 1. `ListingSidebarActions.tsx` — Add inline request action in Documents section

**When both documents are "Not requested":**
- Show a single "Request documents" text button below the document rows (subtle, text-only link style)
- Clicking it opens the `AgreementSigningModal` (or directly fires `sendAgreementEmail` for both types)
- After sending, status updates to "Sent" automatically via query invalidation

**When only one is "Not requested":**
- Show "Request" as a small clickable text next to that specific document's "Not requested" label
- Fires request for just that document type

**When both are sent/signed:**
- No request action shown

This replaces the need for the big "Sign Your Fee Agreement" card in the ConnectionButton unsigned block.

### 2. `ConnectionButton.tsx` — Simplify unsigned block

Remove the "Sign Your Fee Agreement" card with its description and "Request Agreement via Email" button (lines 200-225). Replace with a simple one-liner: "Sign your documents to unlock the data room and request introductions." No card border, no CTA button — the request action now lives in the Documents section above.

Keep the `anyPending` message ("Once your Fee Agreement is processed...") as-is.

### 3. Copy update

- "Sign Your Fee Agreement" → "Sign your documents" (since we send both)
- The header intro text already says "Request a connection to unlock the data room" — this stays

### Files changed
- `src/components/listing-detail/ListingSidebarActions.tsx` — add request links in Documents section, import AgreementSigningModal or sendAgreementEmail
- `src/components/listing-detail/ConnectionButton.tsx` — remove the big card, replace with simple text

