

# Simplify Pending Approval: Single "Request Documents" Button + Unified Copy

## Problem

1. Two separate buttons ("Request NDA via Email" / "Request Fee Agreement via Email") confuse users. Clicking one doesn't send the other, and can falsely imply the other was already sent.
2. Two info boxes ("What your agreement unlocks" / "What you're agreeing to") are redundant and verbose.

## Changes

### 1. `src/pages/PendingApproval.tsx` (lines 253-300)

**Merge two info boxes into one:**
Replace the two `bg-muted/40` boxes with a single concise block:
- Title: "Your agreements unlock full deal access"
- Body: "Every deal on SourceCo is live, real, and confidential. You'll sign two standard documents: an NDA to protect deal details, and a Fee Agreement that applies only if you close a deal sourced through our platform. One set of signatures covers every deal, now and in the future."

**Replace two buttons with one:**
Remove both the NDA and Fee Agreement buttons. Replace with a single button:
- Label: "Request Documents via Email"
- Icon: `Mail`
- Style: Primary (`className="w-full"`)
- On click: calls a new handler `handleRequestBothDocuments` that sends both emails in parallel

**New handler** `handleRequestBothDocuments`:
- Sets a loading state
- Calls `sendAgreementEmail({ documentType: 'nda' })` and `sendAgreementEmail({ documentType: 'fee_agreement' })` via `Promise.all`
- Shows a single success toast: "Documents sent to your email"
- On error, shows a toast with the first error message
- No modal needed — just inline toast feedback + loading spinner on the button

**Remove** the `signingOpen`/`signingType` state and `AgreementSigningModal` import since the pending approval page won't use the modal anymore. The modal is still used elsewhere (listing cards, deal pages).

### 2. No other files changed

The `AgreementSigningModal` component stays as-is for use in listing sidebars and deal pages. Only the pending approval screen gets simplified.

### Summary
- Two info boxes become one
- Two buttons become one "Request Documents via Email" that sends both NDA + Fee Agreement in parallel
- No modal popup needed — single click sends both, toast confirms

