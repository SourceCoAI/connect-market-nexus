

# Fix GP Partner Email Activity + Add Response Categorization Settings

## Problem 1: Email Activity Tab Shows Error

**Root cause**: The `DealEmailActivity` component queries an `email_messages` table that does not exist. The actual Smartlead reply data lives in `smartlead_reply_inbox`. When the component runs `.from('email_messages').select('*').eq('deal_id', dealId)`, it fails because the table is missing entirely.

GP Partner deals already have Smartlead replies linked via `smartlead_reply_inbox.linked_deal_id`, but the Email Activity tab never reads from that table.

**Fix**: Create a new `SmartleadEmailActivity` component (or modify `DealEmailActivity`) that queries `smartlead_reply_inbox` where `linked_deal_id = dealId` OR where the lead email matches the deal's `main_contact_email`. This surfaces sent messages, replies, and their AI classifications directly in the Email Activity tab.

### Files to change
- **`src/hooks/email/useEmailMessages.ts`** — Update `useDealEmailActivity` to query `smartlead_reply_inbox` (by `linked_deal_id`) as a fallback/additional source when `email_messages` returns nothing or errors. Since `email_messages` doesn't exist, rewrite the hook to query `smartlead_reply_inbox` directly.
- **`src/components/email/DealEmailActivity.tsx`** — Adapt the display to handle `smartlead_reply_inbox` fields (`from_email`, `reply_body`, `sent_message_body`, `ai_category`, `campaign_name`, `time_replied`, etc.) instead of the non-existent `EmailMessage` type.

## Problem 2: Activity Tab Not Updating

The `UnifiedDealTimeline` merges `deal_activities` + `contact_activities`. Smartlead email replies are stored in `smartlead_reply_inbox`, not in either of those tables. When a GP deal is created from a Smartlead reply, no corresponding `deal_activity` or `contact_activity` record is written for the email exchange itself.

**Fix**: In the `UnifiedDealTimeline`, add a third data source — fetch `smartlead_reply_inbox` records where `linked_deal_id = dealId` and merge them into the timeline as email-type entries.

### Files to change
- **`src/components/remarketing/deal-detail/UnifiedDealTimeline.tsx`** — Add a query for `smartlead_reply_inbox` by `linked_deal_id`, map results to `UnifiedTimelineEntry` with source `'email'` and category `'emails'`, merge into the combined timeline.

## Problem 3: Response Categorization Settings Page

Build a new section on the existing Smartlead Settings page (`SmartleadSettingsPage.tsx`) with two parts:

### A. Classification Prompt Editor
- Show the current AI classification prompt (the system prompt from `smartlead-inbox-webhook`)
- Store it in `app_settings` with key `smartlead_classification_prompt`
- Allow editing and saving, with a "Reset to Default" option
- Update the edge function to read the prompt from `app_settings` if present, falling back to the hardcoded default

### B. Response Categorization Matrix
- Query `smartlead_reply_inbox` to build an aggregated matrix showing:
  - Category breakdown (meeting_request, interested, question, referral, not_now, not_interested, unsubscribe, out_of_office, negative_hostile, neutral) with counts, percentages
  - Sentiment distribution per category
  - Confidence distribution (avg confidence per category)
  - Recent examples for each category (expandable)
  - Manual override stats (how many were recategorized)
- This mirrors the call disposition tracking pattern but for email responses

### Files to create/change
- **`src/pages/admin/settings/SmartleadSettingsPage.tsx`** — Add two new card sections: "Response Classification Prompt" and "Response Categorization Matrix"
- **`src/hooks/smartlead/use-smartlead-categorization.ts`** (new) — Hook to fetch categorization stats from `smartlead_reply_inbox` grouped by `ai_category`, `ai_sentiment`, with counts and examples
- **`supabase/functions/smartlead-inbox-webhook/index.ts`** — Read classification prompt from `app_settings` table instead of hardcoding it, falling back to the current default

## Implementation order

1. Fix `useDealEmailActivity` to query `smartlead_reply_inbox`
2. Update `DealEmailActivity` component to render Smartlead reply data
3. Add Smartlead replies as a data source in `UnifiedDealTimeline`
4. Create categorization stats hook
5. Build prompt editor + matrix UI on SmartleadSettingsPage
6. Update edge function to use configurable prompt

## Technical details

Current live data in `smartlead_reply_inbox`:
- 269 total replies across 10 categories
- 63 not_interested, 37 out_of_office, 34 meeting_request, 34 neutral, 30 unsubscribe, 25 question, 16 interested, 15 not_now, 9 referral, 6 negative_hostile
- Many have `linked_deal_id` set (GP deals created from automation)
- Fields available: `from_email`, `to_email`, `subject`, `reply_body`, `sent_message_body`, `ai_category`, `ai_sentiment`, `ai_confidence`, `ai_reasoning`, `campaign_name`, `time_replied`, `manual_category`, `recategorized_by`

The `app_settings` table already exists with `key`/`value` text columns — same pattern used by the outreach template editor.

