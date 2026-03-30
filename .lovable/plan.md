

# Phase 99: Soften Rejection Copy — Final Remaining Item

## Status of All Phases

| Phase | Status |
|-------|--------|
| 93 — Bulk action emails/notifications | ✅ Done |
| 94 — Undo system message | ✅ Done |
| 95 — On Hold button | ✅ Done |
| 96 — config.toml for notify-buyer-rejection | ✅ Already existed |
| 97 — Accept/Decline on on_hold banner | ✅ Done |
| 98 — Re-request verification | ✅ No change needed |
| **99 — Soften rejection copy** | **Remaining** |

## Phase 99: What Changes

Three locations use misleading "owner selected another buyer" language. Rejections happen for many reasons — bad fit, incomplete profile, timing. The copy should be neutral.

### Changes

**1. `ConnectionButton.tsx` (lines 205-209)**
- Current: "Owner selected another buyer" / "The business owner has moved forward with another buyer"
- New: "This opportunity is no longer available" / "This listing is no longer available for introduction requests. Browse other deals — our team sources new opportunities regularly."

**2. `DealStatusSection.tsx` (line 43)**
- Current: "The owner selected another buyer for this opportunity."
- New: "This opportunity is no longer available at this time."

**3. `notify-buyer-rejection/index.ts` (lines 43, 74)**
- Current: "The seller has elected to move forward with another buyer at this stage."
- New: "After careful review, this opportunity is no longer available for your profile at this time. We are intentional about limiting buyer introductions so that every connection made is a genuine fit for both sides — and we've noted your interest should anything change."

All three files updated, edge function redeployed. This is the last item from the Phase 93-99 plan.

