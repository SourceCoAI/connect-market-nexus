

# Make Buyer Profile Panel Discoverable

## Problem

The context panel toggle exists (the `PanelRightOpen` icon) but it's a tiny 28px ghost button that blends in with other action icons. Users can't tell it toggles the buyer profile sidebar.

## Fix

Two changes to make it obvious:

### 1. Default `showContext` back to `true`
- Line 108: Change `useState(false)` → `useState(true)` so the buyer profile is visible when you open a conversation (the original behavior before the layout fix)

### 2. Make the toggle button more visible
- Line 251-258: Change from a tiny ghost icon to a labeled button with text: "Buyer Profile" with the panel icon, using `variant="outline"` and proper sizing so it's clearly clickable

### File changed
- `src/pages/admin/message-center/ThreadView.tsx` — restore default showContext to true, improve toggle button visibility

