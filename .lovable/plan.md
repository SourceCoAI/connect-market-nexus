

# Plan: Smartlead Responses Inbox (under Messages subtab)

## Overview

Add an AI-powered email reply inbox that receives SmartLead reply webhooks, classifies them with AI, and displays them in a filterable dashboard. Placed as a subtab within the existing Messages page.

---

## 1. Database: `smartlead_reply_inbox` table

Migration to create table with all specified columns (campaign info, email content, AI classification fields, manual override fields, status for bulk actions). Key details:

- **Indexes**: `message_id`, `from_email`, `time_replied`, `ai_category`, `ai_sentiment`
- **Manual override columns**: `manual_category`, `manual_sentiment`, `recategorized_by` (uuid), `recategorized_at`
- **Status column**: `status` text default `'new'` (values: new, reviewed, archived, needs_followup)
- **Deal link column**: `linked_deal_id` (uuid, nullable) for manual "Add to Deal" 
- **RLS**: Authenticated SELECT; UPDATE restricted to override/status fields only; no client INSERT/DELETE
- **Realtime**: Enable on this table

## 2. Edge Function: `smartlead-inbox-webhook`

New function at `supabase/functions/smartlead-inbox-webhook/index.ts`:

- `verify_jwt = false` in config.toml (external webhook source)
- Validates `SMARTLEAD_WEBHOOK_SECRET` via header or query param (reuses existing `timingSafeEqual` from `_shared/security.ts`)
- **Idempotency**: Check `message_id` exists; fallback check `from_email` + `event_timestamp`
- **AI Classification**: Calls Lovable AI (`google/gemini-3-flash-preview`) via tool-calling to classify reply into one of 10 categories + sentiment. Strips HTML, truncates to 5000 chars before sending.
- Inserts into `smartlead_reply_inbox` with service role key
- Returns `{ success, id, classification }`

Webhook URL: `https://vhzipqarkmmfuqadefep.supabase.co/functions/v1/smartlead-inbox-webhook`

## 3. Routing: Messages subtab structure

Change `App.tsx` line 377 from a flat route to nested routes:

```
marketplace/messages → MessagesLayout (tab bar: Conversations | Smartlead Responses)
  index              → MessageCenter (existing, no changes)
  smartlead          → SmartleadResponsesList (new)
  smartlead/:inboxId → SmartleadResponseDetail (new)
```

Update `UnifiedAdminSidebar.tsx` line 517: change `isActive` from `===` to `startsWith` so the sidebar highlights correctly on subtabs.

## 4. MessagesLayout wrapper

New `src/pages/admin/MessagesLayout.tsx`:
- Two tabs at top using shadcn Tabs: "Conversations" and "Smartlead Responses" (with unread/new count badge)
- `<Outlet />` renders the active sub-page
- Tab navigation via `useNavigate`

## 5. SmartleadResponsesList page

`src/pages/admin/SmartleadResponsesList.tsx`:

- **6 filter stat cards**: Total, Meetings, Interested, Positive, Negative, Neutral — clickable with counts
- **Search bar**: filters across reply content, email, campaign name (client-side for now)
- **Reply list** (ScrollArea): Each card shows lead name/email, sentiment badge, category badge with emoji, campaign name, sequence step, subject, 2-line preview, relative time, "View in SmartLead" link
- **Bulk actions**: Select multiple → Mark reviewed / archived / needs follow-up
- **Export CSV** button
- **Realtime**: Supabase channel subscription on INSERT → auto-refresh
- Click navigates to detail page

## 6. SmartleadResponseDetail page

`src/pages/admin/SmartleadResponseDetail.tsx`:

3-column layout (2:1):

**Left**: Reply card, original outbound message, email thread (from `lead_correspondence` JSON), AI analysis (category/sentiment badges, reasoning, confidence bar)

**Right sidebar**: Contact info, campaign info, timeline, identifiers, manual re-classification dropdowns (category + sentiment), **"Add to Deal"** button (dialog with deal picker → saves `linked_deal_id`)

## 7. Hooks

New `src/hooks/smartlead/use-smartlead-inbox.ts`:
- `useSmartleadInbox(filter, search)` — query with filters
- `useSmartleadInboxItem(id)` — single item
- `useSmartleadInboxStats()` — counts by category/sentiment
- `useUpdateInboxStatus()` — bulk status mutation
- `useRecategorizeInbox()` — manual override mutation
- `useLinkInboxToDeal()` — link to deal mutation
- Realtime subscription hook

Export from `src/hooks/smartlead/index.ts`.

## 8. Build error fixes

- `ValuationLeads/index.tsx` line 113-114: prefix `isPushEnriching` and `isReEnriching` with `_`
- `useValuationLeadsMutations.ts` line 52: prefix `setIsDeleting` with `_`

## File Summary

| File | Action |
|---|---|
| Migration SQL | Create `smartlead_reply_inbox` table + indexes + RLS + realtime |
| `supabase/functions/smartlead-inbox-webhook/index.ts` | New edge function |
| `supabase/config.toml` | Add `[functions.smartlead-inbox-webhook]` verify_jwt = false |
| `src/pages/admin/MessagesLayout.tsx` | New tab wrapper |
| `src/pages/admin/SmartleadResponsesList.tsx` | New list page |
| `src/pages/admin/SmartleadResponseDetail.tsx` | New detail page |
| `src/hooks/smartlead/use-smartlead-inbox.ts` | New hooks |
| `src/hooks/smartlead/index.ts` | Add exports |
| `src/App.tsx` | Nest messages routes under MessagesLayout |
| `src/components/admin/UnifiedAdminSidebar.tsx` | Fix isActive to use startsWith |
| `src/integrations/supabase/types.ts` | Auto-updated after migration |
| `src/pages/admin/remarketing/ValuationLeads/index.tsx` | Fix unused vars |
| `src/pages/admin/remarketing/ValuationLeads/useValuationLeadsMutations.ts` | Fix unused var |

