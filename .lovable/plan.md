

# Data Room: Premium Modal Experience

## Changes

### 1. Remove "256-bit encrypted" claim
The `VaultHeader` component (line 427 in `BuyerDataRoom.tsx`) displays "256-bit encrypted" which is not accurate. Replace with "Confidential" or remove entirely.

### 2. Move Data Room into a Dialog modal
Currently, clicking "Explore data room" in the sidebar scrolls to a `<div ref={dataRoomRef}>` at the bottom of the page. Instead, it should open a full-screen or large modal that feels like entering a vault.

**Files to change:**

| File | Change |
|------|--------|
| `src/pages/ListingDetail.tsx` | Replace inline `<BuyerDataRoom>` with a Dialog. Add `dataRoomOpen` state. Pass `setDataRoomOpen(true)` to sidebar instead of scroll function. |
| `src/components/marketplace/BuyerDataRoom.tsx` | Remove "256-bit encrypted". Wrap content in Dialog when `isModal` prop is true, or extract content so it works inside a Dialog. Adjust layout for modal context (full height, centered, wider max-width ~3xl). |
| `src/components/listing-detail/ListingSidebarActions.tsx` | No changes needed. `onExploreDataRoom` callback already exists, just needs to open the modal instead of scrolling. |

### 3. Modal design spec

- `DialogContent` with `max-w-3xl` and no default padding (custom padding inside)
- Dark vault header spans full width of modal top
- Replace "256-bit encrypted" with "Confidential" in muted white text
- Document list fills remaining modal body with scroll
- Security footer pinned at bottom
- Feels like opening a vault: the modal IS the data room, not a preview of it

### Implementation flow

1. Add `dataRoomOpen` boolean state to `ListingDetail.tsx`
2. Replace `dataRoomRef` scroll with `setDataRoomOpen(true)`
3. Wrap `BuyerDataRoom` content in a `Dialog` controlled by parent
4. Remove the inline render at page bottom
5. Remove "256-bit encrypted" from vault header

