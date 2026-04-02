

# Redesign Sidebar Agreement Status — Show Both Documents + Re-Request

## Problem

The sidebar currently only shows ONE pending document (NDA takes priority via `pendingType`), even when the user requested BOTH an NDA and a Fee Agreement. From the screenshot, Adam Haile has 3 NDA requests and 1 Fee Agreement request — but the sidebar only says "NDA Sent." There's also no way to re-request or request the other document type from the listing detail sidebar without opening the full modal.

## Solution

Replace the single-status card (lines 182-197 in ConnectionButton.tsx) with a per-document status display that shows:

1. **Each requested document independently** — if NDA is sent AND Fee Agreement is sent, show both
2. **Each document's state** — not requested / sent (pending) / signed
3. **Re-request button per document** — small "Resend" link next to each pending document
4. **Request missing documents** — if only NDA was requested, show option to also request Fee Agreement
5. **Open AgreementSigningModal as fallback** — "Request Agreement" button when nothing has been sent yet (existing behavior preserved)

### Sidebar card layout when documents are pending:

```text
┌─────────────────────────────────────┐
│  Documents                          │
│                                     │
│ ┌─ blue left border ──────────────┐ │
│ │ NDA                    Sent ✓   │ │
│ │ Sent to your email. Review,     │ │
│ │ sign, reply to support@...      │ │
│ │                      [Resend]   │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─ blue left border ──────────────┐ │
│ │ Fee Agreement          Sent ✓   │ │
│ │ Sent to your email. Review,     │ │
│ │ sign, reply to support@...      │ │
│ │                      [Resend]   │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Once processed, you'll be able to   │
│ request introductions.              │
│                                     │
│ [Request Another Agreement]         │
│  (only if one type is still         │
│   not requested)                    │
└─────────────────────────────────────┘
```

When signed, the row shows a green checkmark instead.

### Design tokens (Quiet Luxury)
- White background, `border-slate-200/60` hairline border
- `border-l-2 border-blue-400` for pending, `border-l-2 border-emerald-400` for signed
- `text-muted-foreground` for body copy, `text-foreground` for labels
- Resend link: `text-xs text-blue-600 hover:underline`

## Files Changed

- **`src/components/listing-detail/ConnectionButton.tsx`** — Replace lines 176-225 (the agreement gate block). Instead of checking `hasPending` as a single boolean, enumerate both NDA and Fee Agreement statuses from `coverage`. Show per-document rows. Add inline re-request logic (calls `supabase.functions.invoke('request-agreement-email')` directly with a loading state, same as AgreementSigningModal). Keep the AgreementSigningModal available for the "Request Agreement" button when nothing is sent yet.

