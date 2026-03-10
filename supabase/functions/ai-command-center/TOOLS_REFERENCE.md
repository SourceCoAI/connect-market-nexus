# AI Command Center — Tools Reference

> Complete reference for all tools available to the AI Command Center.
> Last updated: February 2026

---

## Architecture Overview

The AI Command Center uses a **tool-based architecture** where Claude is given access to
a curated set of tools based on the user's intent category. Tools are organized into
modules, each handling a specific domain (deals, buyers, transcripts, etc.).

**Flow:**

1. User sends a message via the floating chat panel
2. The edge function routes the message to Claude with page context
3. Claude selects and executes tools from the category toolset
4. Results stream back via SSE (Server-Sent Events)
5. Tool status badges show progress in real-time

**Key Files:**

- `tools/index.ts` — Central registry, category mapping, and executor routing
- `system-prompt.ts` — Dynamic system prompt builder per category
- Each `tools/*-tools.ts` — Module with tool definitions and implementations

---

## Tool Modules

### 1. Deal Tools (`deal-tools.ts`)

| Tool                   | Description                                                                  | Requires Confirmation |
| ---------------------- | ---------------------------------------------------------------------------- | --------------------- |
| `query_deals`          | Search and filter deals/listings by industry, state, revenue, status, source | No                    |
| `get_deal_details`     | Get full details for a specific deal by ID                                   | No                    |
| `get_deal_activities`  | Get recent activity log for a deal                                           | No                    |
| `get_pipeline_summary` | Pipeline metrics with group_by breakdowns                                    | No                    |

**Use cases:** "Show me HVAC deals in Texas", "Pipeline summary by industry", "Deal details for [ID]"

---

### 2. Buyer Tools (`buyer-tools.ts`)

| Tool                      | Description                                                    | Requires Confirmation |
| ------------------------- | -------------------------------------------------------------- | --------------------- |
| `search_buyers`           | Search buyers by name, industry, state, type, score            | No                    |
| `get_buyer_profile`       | Deep-dive buyer profile with top 10 scored deals               | No                    |
| `get_score_breakdown`     | Per-dimension score breakdown (geography, size, service, etc.) | No                    |
| `get_top_buyers_for_deal` | Scored buyers for a specific deal, with state filter           | No                    |

**Use cases:** "Find PE firms targeting HVAC", "Buyer profile for Acme Corp", "Top buyers for this deal in OK"

---

### 3. Recommended Buyer Tools (`recommended-buyer-tools.ts`) — Feature 1

| Tool                       | Description                                                                                                            | Requires Confirmation |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `get_recommended_buyers`   | AI-ranked buyer shortlist for a deal with composite scoring, tier classification, fit signals, and engagement tracking | No                    |
| `generate_buyer_narrative` | Written strategy narrative with deal framing, per-buyer rationale, tier summary, and recommended actions               | No                    |

**Scoring dimensions:** Geography (0-100), Size (0-100), Service/Sector (0-100), Owner Goals (0-100) → Composite Fit Score

**Tier classification:**

- **Move Now** (80+ score, active mandate or fee agreement)
- **Strong Candidate** (60-79 score)
- **Speculative** (below 60)

**Fit signals** (top 3 shown per buyer):

- Geographic footprint overlap
- EBITDA/revenue within target range
- Core service/sector alignment
- Active acquisition mandate
- Fee agreement signed
- Prior acquisition track record

**Use cases:** "Who should we target for this deal?", "Write a buyer strategy", "Recommended buyers for [deal]"

---

### 4. Proactive Alert Tools (`alert-tools.ts`) — Feature 2

| Tool                   | Description                                                                                                                                            | Requires Confirmation |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| `get_proactive_alerts` | Surface actionable alerts across the pipeline: stale deals, cold buyers, overdue tasks, unprocessed transcripts, unsigned agreements, critical signals | No                    |
| `dismiss_alert`        | Mark an alert as dismissed permanently                                                                                                                 | Yes                   |
| `snooze_alert`         | Snooze an alert for 1-30 days                                                                                                                          | Yes                   |

**Alert types and severity:**

| Alert Type               | Severity                                   | Trigger                                       |
| ------------------------ | ------------------------------------------ | --------------------------------------------- |
| `stale_deal`             | Critical (30+ days) / Warning (14+ days)   | No activity on active deal                    |
| `overdue_tasks`          | Critical (7+ days) / Warning (1+ day)      | Tasks past due date                           |
| `cold_buyer`             | Critical (score 85+) / Warning (score 70+) | High-scoring buyer, no engagement in 90+ days |
| `unprocessed_transcript` | Info                                       | Fireflies recording not yet summarized        |
| `unsigned_agreement`     | Warning (score 85+) / Info (score 75+)     | High-scoring buyer without fee agreement      |
| `critical_signal`        | Critical / Warning                         | Unacknowledged deal signal                    |

**Dismissal/snooze state** is stored in `admin_notifications` table with `notification_type = 'proactive_alert'`.

**Use cases:** "Any alerts?", "What needs attention?", "Dismiss this alert", "Snooze for 3 days"

---

### 5. Fireflies Summary Tools (`fireflies-summary-tools.ts`) — Feature 3

| Tool                            | Description                                                                                                                                                              | Requires Confirmation |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| `summarize_transcript_to_notes` | Process a transcript into a structured deal note: executive summary, key signals (positive/negative), action items with checkboxes, notable quotes, participant analysis | Yes                   |
| `get_unprocessed_transcripts`   | Find deal_transcripts with content that haven't been summarized yet                                                                                                      | No                    |

**Summary structure** (saved as deal_comment):

1. **Header** — Meeting title, date, duration
2. **Participants** — Attendee list from metadata
3. **Executive Summary** — Key points from transcript
4. **Key Signals** — Positive/negative indicators extracted from text
5. **Action Items** — Actionable follow-ups with assignee hints
6. **Notable Quotes** — Significant statements from speakers

**Auto-task creation:** When `auto_create_tasks=true`, action items become `daily_standup_tasks` with status `pending_approval`.

**Processing tracking:** Summarized transcripts are marked with `extracted_data.ai_summarized_at` timestamp to prevent re-processing.

**Frontend rendering:** AI-generated notes are rendered with the `AIGeneratedNoteRenderer` component, which provides special formatting for signals, action items, and quotes.

**Use cases:** "Summarize this transcript", "Any new recordings to process?", "Create notes from the Fireflies meeting"

---

### 6. Task Tools (`task-tools.ts`)

| Tool                       | Description                                                                                                                                               | Requires Confirmation |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `get_task_inbox`           | User's task list filtered by status, entity, priority                                                                                                     | No                    |
| `get_daily_briefing`       | Comprehensive daily briefing: overdue, due today, due this week, AI tasks, signals, recent leads, connections. Day-of-week aware (Monday/Friday variants) | No                    |
| `get_overdue_tasks`        | Aging analysis with tiers: recent, aging, critical, abandoned                                                                                             | No                    |
| `get_buyer_spotlight`      | Buyers overdue for contact by cadence schedule                                                                                                            | No                    |
| `get_deal_signals_summary` | Unacknowledged critical/warning deal signals                                                                                                              | No                    |
| `snooze_task`              | Defer a task for 1-30 days                                                                                                                                | Yes                   |
| `create_task`              | Create a new task linked to an entity (pending approval)                                                                                                  | Yes                   |
| `confirm_ai_task`          | Accept an AI-suggested task                                                                                                                               | No                    |
| `dismiss_ai_task`          | Reject an AI-suggested task                                                                                                                               | No                    |
| `add_task_comment`         | Add a comment to a task                                                                                                                                   | No                    |
| `bulk_reassign_tasks`      | Reassign all open tasks from one user to another                                                                                                          | Yes                   |

**Daily Briefing enhancements (Feature 4):**

- Day-of-week awareness: Monday briefings look back over the weekend, Friday briefings emphasize wrapping up
- Includes recent new leads and connection requests since last briefing
- Auto-launched on first daily visit via `useDailyBriefingAutoLaunch` hook

**Use cases:** "Daily briefing", "What's overdue?", "Create a task to follow up with Acme"

---

### 7. Transcript Tools (`transcript-tools.ts`)

| Tool                       | Description                                                                               | Requires Confirmation |
| -------------------------- | ----------------------------------------------------------------------------------------- | --------------------- |
| `search_transcripts`       | Unified search across call_transcripts, buyer_transcripts, and Fireflies deal_transcripts | No                    |
| `get_meeting_action_items` | Extract action items from recent deal transcripts                                         | No                    |

**Use cases:** "Find calls about revenue growth", "What was discussed in the HVAC meeting?"

---

### 8. Scoring & Explanation Tools (`scoring-explain-tools.ts`)

| Tool                  | Description                                                              | Requires Confirmation |
| --------------------- | ------------------------------------------------------------------------ | --------------------- |
| `explain_buyer_score` | Human-readable explanation of a buyer's score with data source citations | No                    |
| `get_buyer_signals`   | Engagement signals, buyer decisions, interest signals                    | No                    |
| `get_buyer_history`   | Score snapshots and learning history over time                           | No                    |

**Use cases:** "Why does this buyer score 87?", "What signals has this buyer shown?"

---

### 9. Action Tools (`action-tools.ts`)

| Tool                       | Description                                      | Requires Confirmation |
| -------------------------- | ------------------------------------------------ | --------------------- |
| `create_deal_task`         | Legacy task creation (prefer `create_task`)      | Yes                   |
| `complete_deal_task`       | Mark a task as completed                         | No                    |
| `add_deal_note`            | Add a note to deal activity log                  | No                    |
| `log_deal_activity`        | Log activity (call, meeting, outreach, etc.)     | No                    |
| `update_deal_stage`        | Update deal pipeline stage                       | Yes                   |
| `reassign_deal_task`       | Reassign a task to another team member           | Yes                   |
| `convert_to_pipeline_deal` | Convert remarketing buyer match to pipeline deal | Yes                   |
| `grant_data_room_access`   | Grant buyer access to a deal's data room         | Yes                   |

**Use cases:** "Update deal stage to LOI", "Add a note about today's call", "Grant data room access"

---

### 10. Outreach Tools (`outreach-tools.ts`)

| Tool                   | Description                                      | Requires Confirmation |
| ---------------------- | ------------------------------------------------ | --------------------- |
| `get_outreach_records` | Search outreach records and remarketing outreach | No                    |
| `get_outreach_status`  | Outreach pipeline metrics                        | No                    |
| `draft_outreach_email` | Generate personalized outreach email             | No                    |

**Use cases:** "Draft an email to Summit Capital about this deal", "Show outreach status"

---

### 11. Analytics Tools (`analytics-tools.ts`)

| Tool                    | Description                                                                                                                                                              | Requires Confirmation |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| `get_analytics`         | Comprehensive analytics with cross-deal analysis types: universe_comparison, deal_comparison, buyer_type_analysis, source_analysis, conversion_funnel, geography_heatmap | No                    |
| `get_enrichment_status` | Contact/buyer enrichment pipeline status                                                                                                                                 | No                    |

**Use cases:** "Compare buyer types across deals", "Conversion funnel analysis"

---

### 12. Proactive Operations Tools (`proactive-tools.ts`)

| Tool                      | Description                                                       | Requires Confirmation |
| ------------------------- | ----------------------------------------------------------------- | --------------------- |
| `get_data_quality_report` | Data quality analysis across buyers, deals, contacts, transcripts | No                    |
| `detect_buyer_conflicts`  | Find buyers active on multiple deals in same industry/geography   | No                    |
| `get_deal_health`         | Active deal health by stage duration, activity velocity           | No                    |
| `match_leads_to_deals`    | Match inbound/valuation leads against active deals                | No                    |

**Use cases:** "Data quality report", "Any buyer conflicts?", "Match new leads to deals"

---

### 13. Integration Tools

| Tool                      | Description                                     | Module                      | Requires Confirmation |
| ------------------------- | ----------------------------------------------- | --------------------------- | --------------------- |
| `enrich_contact`          | Enrich contact via LinkedIn/Prospeo             | integration-action-tools.ts | No                    |
| `find_contact`            | Discover contacts by name, company, or LinkedIn | integration-action-tools.ts | No                    |
| `google_search_companies` | Web search for company intelligence             | integration-action-tools.ts | No                    |
| `push_to_phoneburner`     | Push contact to PhoneBurner dialer              | integration-action-tools.ts | Yes                   |
| `push_to_smartlead`       | Push to Smartlead email campaigns               | smartlead-tools.ts          | Yes                   |
| `send_document`           | Send NDA/fee agreement via PandaDoc             | action-tools.ts             | Yes                   |
| `save_contacts_to_crm`    | Batch save contacts                             | integration-action-tools.ts | Yes                   |

---

### 14. UI Action Tools (`ui-action-tools.ts`)

| Tool                  | Description                             | Requires Confirmation |
| --------------------- | --------------------------------------- | --------------------- |
| `select_table_rows`   | Select rows in the visible table by IDs | No                    |
| `apply_table_filter`  | Apply a filter to the visible table     | No                    |
| `sort_table_column`   | Sort a table column                     | No                    |
| `trigger_page_action` | Trigger a page-specific action          | No                    |
| `navigate_to_page`    | Navigate to a different page            | No                    |

**Use cases:** "Select all buyers in Texas", "Filter to PE firms", "Navigate to pipeline"

---

### 15. Other Tools

| Tool                         | Description                            | Module                     |
| ---------------------------- | -------------------------------------- | -------------------------- |
| `get_current_user_context`   | Current user's role, permissions, team | user-tools.ts              |
| `search_contacts`            | Search unified contacts table          | contact-tools.ts           |
| `search_pe_contacts`         | Search buyer-type contacts             | contact-tools.ts           |
| `get_connection_requests`    | Buyer intake pipeline                  | connection-tools.ts        |
| `get_connection_messages`    | Message threads                        | connection-tools.ts        |
| `retrieve_knowledge`         | Platform knowledge base retrieval      | knowledge-tools.ts         |
| `research_industry`          | Industry research with M&A guides      | industry-research-tools.ts |
| `semantic_transcript_search` | Natural language transcript search     | semantic-search-tools.ts   |
| `generate_meeting_prep`      | Meeting preparation briefing           | content-tools.ts           |
| `generate_eod_recap`         | End-of-day/week summary                | content-tools.ts           |
| `generate_pipeline_report`   | Structured pipeline report             | content-tools.ts           |

---

## Tool Categories

Categories determine which tools Claude receives for a given user intent.
The intent router selects a category based on the user's message and page context.

| Category             | Primary Tools                                                  | When Used                  |
| -------------------- | -------------------------------------------------------------- | -------------------------- |
| `DEAL_STATUS`        | query_deals, get_deal_details, get_deal_activities             | "Tell me about this deal"  |
| `BUYER_SEARCH`       | search_buyers, query_deals, search_lead_sources                | "Find HVAC buyers in TX"   |
| `BUYER_ANALYSIS`     | get_buyer_profile, get_score_breakdown, get_recommended_buyers | "Analyze this buyer's fit" |
| `RECOMMENDED_BUYERS` | get_recommended_buyers, generate_buyer_narrative               | "Who should we target?"    |
| `MEETING_INTEL`      | search_transcripts, summarize_transcript_to_notes              | "What was discussed?"      |
| `TRANSCRIPT_SUMMARY` | summarize_transcript_to_notes, get_unprocessed_transcripts     | "Summarize this recording" |
| `DAILY_BRIEFING`     | get_daily_briefing, get_proactive_alerts                       | "Morning briefing"         |
| `ALERTS`             | get_proactive_alerts, dismiss_alert, snooze_alert              | "Any alerts?"              |
| `TASK_INBOX`         | get_task_inbox, create_task, snooze_task                       | "What's on my plate?"      |
| `PIPELINE_ANALYTICS` | get_pipeline_summary, get_analytics                            | "Pipeline metrics"         |
| `ACTION`             | create_task, update_deal_stage, add_deal_note                  | "Update this deal"         |
| `PROACTIVE`          | get_data_quality_report, get_deal_health, get_proactive_alerts | "Health check"             |

---

## Frontend Integration

### Hooks

| Hook                         | Purpose                                                        | File                                        |
| ---------------------------- | -------------------------------------------------------------- | ------------------------------------------- |
| `useAICommandCenter`         | Main hook: SSE streaming, messages, tool status, confirmations | `src/hooks/useAICommandCenter.ts`           |
| `useRecommendedBuyers`       | Fetch ranked buyer list for a deal (4h cache)                  | `src/hooks/admin/use-recommended-buyers.ts` |
| `useProactiveAlerts`         | Alert badge counts (5min poll)                                 | `src/hooks/useProactiveAlerts.ts`           |
| `useDailyBriefingAutoLaunch` | Auto-open panel with briefing on first daily visit             | `src/hooks/useDailyBriefingAutoLaunch.ts`   |

### Components

| Component                         | Purpose                                       | File                                                                                |
| --------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------- |
| `AICommandCenterPanel`            | Floating chat panel with streaming UI         | `src/components/ai-command-center/AICommandCenterPanel.tsx`                         |
| `AICommandCenterProvider`         | App-level context provider                    | `src/components/ai-command-center/AICommandCenterProvider.tsx`                      |
| `BuyerRecommendationCard`         | Individual ranked buyer card                  | `src/components/admin/pipeline/tabs/recommended-buyers/BuyerRecommendationCard.tsx` |
| `BuyerNarrativePanel`             | AI narrative generation panel                 | `src/components/admin/pipeline/tabs/recommended-buyers/BuyerNarrativePanel.tsx`     |
| `PipelineDetailRecommendedBuyers` | Recommended buyers tab in pipeline detail     | `src/components/admin/pipeline/tabs/PipelineDetailRecommendedBuyers.tsx`            |
| `AIGeneratedNoteRenderer`         | Renders AI-generated transcript summary notes | `src/components/admin/pipeline/tabs/AIGeneratedNoteRenderer.tsx`                    |

### Custom Events

| Event                    | Purpose                                     | Payload                                                 |
| ------------------------ | ------------------------------------------- | ------------------------------------------------------- |
| `ai-command-center:open` | Open AI panel and optionally send a message | `{ query?: string, source?: string, context?: object }` |

Used by: Daily Briefing Auto-Launch, Draft Outreach button, and other integrations.

---

## Confirmation Flow

Tools in the `CONFIRMATION_REQUIRED` set trigger a confirmation dialog before execution:

1. Claude calls a write tool
2. The edge function emits a `confirmation_required` SSE event
3. The panel shows a confirmation dialog with before/after details
4. User confirms → tool executes → result streams back
5. User denies → tool is skipped → Claude acknowledges

**Current confirmation-required tools:**
`update_deal_stage`, `grant_data_room_access`, `send_document`, `push_to_phoneburner`,
`push_to_smartlead`, `save_contacts_to_crm`, `reassign_deal_task`, `convert_to_pipeline_deal`,
`create_deal_task`, `create_task`, `snooze_task`, `bulk_reassign_tasks`,
`summarize_transcript_to_notes`, `dismiss_alert`, `snooze_alert`
