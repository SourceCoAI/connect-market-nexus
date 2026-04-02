

# Fix Listing Card Agreement Section — Single CTA with Listing Access

## Problem
The listing card shows two redundant elements when no agreement is signed: an informational banner ("Sign an agreement to request access") and a "Sign Agreement" button. The user wants:
1. Remove the redundant info banner
2. Still allow navigation to the listing detail page
3. Make it clear they need to sign before requesting access

## Solution
Replace both elements with a single section that has:
- A "View Listing" button that links to the listing detail (so users can still browse)
- A subtle "Sign Agreement" link/button underneath that opens the signing modal
- A small muted note indicating signing is required before requesting access

## Changes

### `src/components/listing/ListingCardActions.tsx` (lines 172-202)
Replace the current no-agreement block with:
- **Primary CTA**: "View Listing" — links to `/listing/{id}` (same as approved state but styled as outline)
- **Secondary CTA**: "Sign Agreement to Request Access" — opens signing modal, styled as a subtle text button with Shield icon
- Remove the static info banner entirely

This keeps the card functional (users can explore listings) while clearly communicating the signing requirement.

