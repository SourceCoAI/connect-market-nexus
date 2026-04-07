

# Fix Overpromising Deal Materials Copy

## Problem
The buyer-facing "My Deals" page shows three hardcoded locked document placeholders ("Confidential Company Profile", "Deal Memorandum / CIM", "Detailed Financial Statements") that may not actually exist for every deal. The progress section also promises "access to deal materials and the data room" which overpromises.

## Changes

| File | Change |
|------|--------|
| `src/components/deals/DealDocumentsCard.tsx` (lines 329-352) | Replace the three hardcoded locked document rows with a single generic locked message: "Additional deal materials may be shared at the advisor's discretion once your request is approved." Remove specific document names that imply guaranteed access. |
| `src/components/deals/DealStatusSection.tsx` (line 48) | Change "you will receive access to deal materials and the data room" to "your interest will be presented to the owner and our team will follow up with next steps" |
| `src/components/deals/DealActionCard.tsx` (lines 103-107) | Review and soften any overpromising copy in the "Under Review" description |

### What stays the same
- The NDA/Fee Agreement section is accurate and stays as-is
- The "Data Room" section header stays — when docs ARE unlocked, they show correctly
- The deal progress stages stay — they reflect actual workflow

