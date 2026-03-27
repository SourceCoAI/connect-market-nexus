# AI Command Center & Platform Integration — Full System Audit

**Date:** 2026-02-24 (Updated: 2026-02-24)
**Scope:** Database schema, AI tools, orchestration, external integrations, data flow

---

## 1. Executive Summary

The SourceCo Connect Market Nexus platform is an M&A deal management system with:

- **~90+ database tables** across deals, buyers, contacts, transcripts, enrichment, remarketing, and admin domains
- **60+ AI tools** organized into 18 tool files and 22 intent categories
- **6 external integrations** (Fireflies.ai, Apify, Prospeo, PandaDoc, PhoneBurner, SmartLead)
- **Two-stage router** (regex bypass → Haiku LLM fallback) classifying queries into tool subsets
- **SSE-streaming orchestrator** with 5-round tool-calling loop and 15s per-tool timeouts

### Key Findings

| Area                                                  | Status  | Severity |
| ----------------------------------------------------- | ------- | -------- |
| Router bypass rules cover most queries                | Working | —        |
| Router LLM fallback defaults to GENERAL on failure    | Risk    | Medium   |
| GENERAL category now has useful tools                 | Fixed   | —        |
| Tool category restrictions can block needed tools     | Risk    | High     |
| Client-side array filtering fragile on mixed types    | Fixed   | —        |
| PhoneBurner call history tool (get_call_history)      | Fixed   | —        |
| No AI tool for PandaDoc NDA sending                   | Gap     | Low      |
| SmartLead has zero implementation                     | Gap     | Info     |
| Enrichment pipeline (Apify+Prospeo) not exposed to AI | Gap     | Medium   |
| Semantic search via pgvector is functional            | Working | —        |

---

## 2. Architecture Overview

```
User Query (from chat widget)
       │
       ▼
┌─────────────────────────────┐
│  ai-command-center/index.ts │  ← Edge Function entry point
│  (Auth, rate limit, SSE)    │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│       router.ts             │  ← Intent classification
│  1. Regex bypass (30 rules) │
│  2. Haiku LLM fallback      │
│  3. GENERAL default          │
└──────────┬──────────────────┘
           │ { category, tier, tools, confidence }
           ▼
┌─────────────────────────────┐
│     orchestrator.ts         │  ← Tool-calling loop
│  - Builds system prompt     │
│  - Gets tools for category  │
│  - Streams Claude response  │
│  - Executes tool calls      │
│  - Feeds results back (SSE) │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│   tools/*.ts (18 files)     │  ← 60+ individual tools
│  - Queries Supabase DB      │
│  - Returns { data, error }  │
└─────────────────────────────┘
```

### Model Selection by Tier

| Tier     | Model  | Max Tokens | When Used                        |
| -------- | ------ | ---------- | -------------------------------- |
| QUICK    | Haiku  | 2048       | Simple lookups, single tool      |
| STANDARD | Sonnet | 2048       | Multi-tool queries               |
| DEEP     | Sonnet | 4096       | Content generation, meeting prep |

### Key Constants

- **MAX_TOOL_ROUNDS**: 5
- **Tool timeout**: 15s per tool
- **Router timeout**: 3s (Haiku)
- **Conversation history**: Last 10 messages
- **Confirmation required**: `update_deal_stage`, `grant_data_room_access`

---

## 3. Database Schema Map

~90+ tables organized into these domain groups:

### 3.1 Deal Pipeline

| Table                      | Purpose               | Key Columns                                                                                             |
| -------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------- |
| `deals`                    | Core deal records     | id, title, stage, status, revenue, ebitda, asking_price, industry, state, city, owner_name, lead_source |
| `deal_stages`              | Stage history         | deal_id, stage, changed_at, changed_by                                                                  |
| `deal_activities`          | Activity log          | deal_id, activity_type, description, created_by                                                         |
| `deal_contacts`            | Deal↔contact links    | deal_id, contact_id, role                                                                               |
| `deal_tasks`               | Task tracking         | deal_id, title, status, assigned_to, due_date                                                           |
| `deal_task_reviewers`      | Review assignments    | task_id, reviewer_id                                                                                    |
| `deal_comments`            | Internal comments     | deal_id, comment, user_id                                                                               |
| `deal_documents`           | Document metadata     | deal_id, file_name, file_url, document_type                                                             |
| `deal_transcripts`         | Meeting transcripts   | deal_id, transcript_text, fireflies_transcript_id, has_content                                          |
| `deal_alerts`              | Alert rules           | deal_id, alert_type, threshold                                                                          |
| `deal_referrals`           | Referral tracking     | deal_id, referrer_email, status                                                                         |
| `deal_scoring_adjustments` | Custom scoring rules  | deal_id, adjustment_type, weight                                                                        |
| `deal_ranking_history`     | Historical rankings   | deal_id, buyer_id, rank, score                                                                          |
| `deal_data_room_access`    | Data room permissions | deal_id, buyer_id, status, granted_at                                                                   |
| `data_room_documents`      | Data room files       | deal_id, file_name, storage_path, category                                                              |
| `data_room_access`         | Access control        | document_id, buyer_id, access_level                                                                     |
| `data_room_audit_log`      | Access audit trail    | document_id, user_id, action                                                                            |
| `deal_sourcing_requests`   | Sourcing requests     | deal_id, status, criteria                                                                               |

### 3.2 Buyers

| Table                        | Purpose                 | Key Columns                                                                                                                                                                       |
| ---------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buyers`                     | Core buyer profiles     | id, company_name, hq_state, buyer_type, geographic_footprint, services_offered, target_industries, target_services, website_url, min_revenue, max_revenue, min_ebitda, max_ebitda |
| `buyer_deal_scores`          | Scored buyer↔deal fits  | buyer_id, deal_id, total_score, industry_score, geo_score, size_score                                                                                                             |
| `buyer_contacts`             | Buyer contact records   | buyer_id, name, email, phone, title                                                                                                                                               |
| `buyer_approve_decisions`    | Approved decisions      | buyer_id, deal_id, decision_date                                                                                                                                                  |
| `buyer_pass_decisions`       | Pass decisions          | buyer_id, deal_id, pass_reason, pass_category                                                                                                                                     |
| `buyer_transcripts`          | Buyer transcripts       | buyer_id, transcript_text                                                                                                                                                         |
| `buyer_criteria_extractions` | AI-extracted criteria   | buyer_id, extracted_criteria, source                                                                                                                                              |
| `buyer_enrichment_queue`     | Enrichment queue        | buyer_id, status, enrichment_type                                                                                                                                                 |
| `buyer_learning_history`     | Learning from decisions | buyer_id, event_type, details                                                                                                                                                     |

### 3.3 Contacts & Enrichment

| Table                  | Purpose                   | Key Columns                                                           |
| ---------------------- | ------------------------- | --------------------------------------------------------------------- |
| `contacts`             | Unified contact directory | id, first_name, last_name, email, phone, title, company, linkedin_url |
| `enriched_contacts`    | Apify/Prospeo enriched    | email, phone, title, linkedin_url, confidence, source                 |
| `contact_activities`   | Call/outreach log         | activity_type, call_duration_seconds, disposition_code, recording_url |
| `contact_search_cache` | 7-day search cache        | search_key, results, cached_at                                        |
| `contact_search_log`   | Search audit              | query, results_count, source                                          |

### 3.4 Remarketing & Universes

| Table                                | Purpose                   |
| ------------------------------------ | ------------------------- |
| `remarketing_buyers`                 | Remarketing buyer records |
| `remarketing_buyer_contacts`         | RM contact info           |
| `remarketing_buyer_universes`        | Universe groupings        |
| `remarketing_universe_deals`         | Universe↔deal links       |
| `remarketing_outreach`               | Outreach tracking         |
| `remarketing_scores`                 | RM scoring                |
| `remarketing_scoring_queue`          | Scoring queue             |
| `remarketing_guide_generation_state` | Guide gen state           |

### 3.5 Agreements & Signatures

| Table                  | Purpose                                                                          |
| ---------------------- | -------------------------------------------------------------------------------- |
| `firm_agreements`      | NDA & fee agreement status (nda_signed, fee_agreement_signed, pandadoc statuses) |
| `firm_members`         | Firm↔user links                                                                  |
| `firm_domain_aliases`  | Domain mapping                                                                   |
| `agreement_audit_log`  | Change log                                                                       |
| `nda_logs`             | NDA events                                                                       |
| `fee_agreement_logs`   | Fee events                                                                       |
| `pandadoc_webhook_log` | Webhook events (submission_id, event_type, raw_payload)                          |

### 3.6 Transcripts & Chat

| Table                | Purpose                                            |
| -------------------- | -------------------------------------------------- |
| `deal_transcripts`   | Transcripts with cached text and vector embeddings |
| `buyer_transcripts`  | Buyer-linked transcripts                           |
| `call_intelligence`  | AI-extracted call insights                         |
| `chat_conversations` | Chat session records                               |
| `chat_analytics`     | Chat usage metrics                                 |
| `chat_feedback`      | User feedback on AI                                |

### 3.7 Leads & Referrals

| Table                  | Purpose                    |
| ---------------------- | -------------------------- |
| `inbound_leads`        | Website/form leads         |
| `valuation_leads`      | Valuation calculator leads |
| `referral_partners`    | Partner registry           |
| `referral_submissions` | Partner submissions        |
| `lead_memos`           | Lead memos                 |
| `lead_memo_versions`   | Memo versions              |

### 3.8 PhoneBurner

| Table                      | Purpose                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `phoneburner_sessions`     | Dialing sessions (total_dials, connection_rate)                |
| `phoneburner_webhooks_log` | Raw webhook events                                             |
| `phoneburner_oauth_tokens` | OAuth tokens per user                                          |
| `disposition_mappings`     | Disposition→status maps (mark_do_not_call, mark_phone_invalid) |

### 3.9 Users & Auth

| Table                | Purpose                                    |
| -------------------- | ------------------------------------------ |
| `profiles`           | User profiles (id, full_name, email, role) |
| `user_roles`         | Role assignments                           |
| `user_sessions`      | Session tracking                           |
| `user_activity`      | Activity log                               |
| `user_events`        | Event tracking                             |
| `user_notes`         | User notes                                 |
| `user_notifications` | Notification inbox                         |
| `user_journeys`      | Onboarding journeys                        |

### 3.10 Analytics & Admin

| Table                 | Purpose                |
| --------------------- | ---------------------- |
| `admin_notifications` | Admin alert inbox      |
| `daily_metrics`       | Daily platform metrics |
| `page_views`          | Page view tracking     |
| `listing_analytics`   | Listing performance    |
| `search_analytics`    | Search usage           |
| `score_snapshots`     | Point-in-time scores   |
| `engagement_scores`   | Buyer engagement       |

### 3.11 Other Tables

`categories`, `collections`, `collection_items`, `listings`, `marketplace_approval_queue`, `industry_classifications`, `industry_trackers`, `filter_presets`, `saved_listings`, `outreach_records`, `connection_requests`, `connection_request_contacts`, `connection_request_stages`, `connection_messages`, `document_release_log`, `document_tracked_links`, `memo_distribution_log`, `enrichment_queue`, `enrichment_jobs`, `enrichment_events`, `enrichment_cost_log`, `enrichment_rate_limits`, `global_activity_queue`, `trigger_logs`, `cron_job_logs`, `audit_logs`, `permission_audit_log`, `alert_delivery_logs`, `email_delivery_logs`, `similar_deal_alerts`, `captarget_sync_exclusions`, `captarget_sync_log`, `generic_email_domains`, `otp_rate_limits`, `password_reset_tokens`, `registration_funnel`, `ma_guide_generations`, `listing_conversations`, `listing_notes`

### 3.12 Views

`data_room_access_status`, `linkedin_manual_review_queue`, `listings_needing_enrichment`, `marketplace_listings`, `ranked_deals`, `unmapped_primary_owners`, `pipeline_views`

---

## 4. AI Tool Inventory & Data Access

### 4.1 Tool Files

| File                          | Tools                                                                                                             | Purpose              |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------- |
| deal-tools.ts                 | query_deals, get_deal_details, get_deal_activities, get_pipeline_summary                                          | Deal queries         |
| buyer-tools.ts                | search_buyers, get_buyer_profile, get_score_breakdown, get_top_buyers_for_deal                                    | Buyer search/scoring |
| transcript-tools.ts           | search_transcripts, search_buyer_transcripts, search_fireflies, get_meeting_action_items                          | Transcripts          |
| outreach-tools.ts             | get_outreach_status, get_outreach_records, get_remarketing_outreach, get_call_history                             | Outreach & Calls     |
| analytics-tools.ts            | get_analytics, get_enrichment_status, get_industry_trackers                                                       | Analytics            |
| user-tools.ts                 | get_current_user_context                                                                                          | User context         |
| action-tools.ts               | create_deal_task, complete_deal_task, add_deal_note, log_deal_activity, update_deal_stage, grant_data_room_access | Write ops            |
| ui-action-tools.ts            | select_table_rows, apply_table_filter, sort_table_column, navigate_to_page                                        | UI manipulation      |
| content-tools.ts              | generate_meeting_prep, draft_outreach_email, generate_pipeline_report                                             | Content gen          |
| universe-tools.ts             | search_buyer_universes, get_universe_details                                                                      | Universes            |
| signal-tools.ts               | get_engagement_signals, get_interest_signals                                                                      | Engagement           |
| lead-tools.ts                 | search_inbound_leads, search_valuation_leads, search_lead_sources, get_referral_data, get_deal_referrals          | Leads                |
| contact-tools.ts              | search_pe_contacts, search_contacts, get_firm_agreements, get_nda_logs                                            | Contacts             |
| connection-tools.ts           | get_connection_requests, get_connection_messages, get_deal_conversations                                          | Connections          |
| deal-extra-tools.ts           | get_deal_documents, get_deal_memos, get_deal_comments, get_deal_scoring_adjustments                               | Deal extras          |
| followup-tools.ts             | get_follow_up_queue, get_buyer_decisions                                                                          | Follow-ups           |
| scoring-explain-tools.ts      | explain_buyer_score, get_score_history, get_buyer_learning_history                                                | Scoring              |
| cross-deal-analytics-tools.ts | get_cross_deal_analytics                                                                                          | Cross-deal           |
| semantic-search-tools.ts      | semantic_transcript_search                                                                                        | Vector search        |

### 4.2 Data Access Patterns

#### Client-Side Filtering Tools (Risk: High)

These tools fetch ALL records then filter in JavaScript:

| Tool                   | Table      | Issue                                                                          |
| ---------------------- | ---------- | ------------------------------------------------------------------------------ |
| `query_deals`          | `deals`    | Fetches all deals, filters by keyword/stage/state/industry in JS. Limit: 50    |
| `search_buyers`        | `buyers`   | Fetches all buyers, filters by keyword/state/industry/service in JS. Limit: 50 |
| `get_pipeline_summary` | `deals`    | Fetches all active deals, groups by stage in JS                                |
| `search_pe_contacts`   | `contacts` | Fetches all contacts, filters by keyword in JS. Limit: 50                      |

#### Server-Side Filtered Tools (Working Well)

| Tool                      | Table                          | Filter Method                              |
| ------------------------- | ------------------------------ | ------------------------------------------ |
| `get_deal_details`        | `deals`                        | `.eq('id', deal_id)`                       |
| `get_deal_activities`     | `deal_activities`              | `.eq('deal_id')`, limit 20                 |
| `get_top_buyers_for_deal` | `buyer_deal_scores` + `buyers` | `.eq('deal_id')`, order by score, limit 25 |
| `get_score_breakdown`     | `buyer_deal_scores`            | `.eq('buyer_id').eq('deal_id')`            |
| `get_connection_requests` | `connection_requests`          | `.eq('deal_id')` or `.eq('status')`        |
| `get_firm_agreements`     | `firm_agreements`              | `.eq('firm_id')`                           |

#### External API Tools

| Tool                         | External Service   | Mechanism                                                      |
| ---------------------------- | ------------------ | -------------------------------------------------------------- |
| `search_fireflies`           | Fireflies.ai       | Calls `search-fireflies-for-buyer` edge function → GraphQL     |
| `semantic_transcript_search` | Lovable AI Gateway | Generates embeddings (Gemini), then pgvector similarity search |

#### Write Operation Tools

| Tool                     | Operation                             | Confirmation Required |
| ------------------------ | ------------------------------------- | --------------------- |
| `create_deal_task`       | INSERT `deal_tasks`                   | No                    |
| `complete_deal_task`     | UPDATE `deal_tasks`                   | No                    |
| `add_deal_note`          | INSERT `deal_comments`                | No                    |
| `log_deal_activity`      | INSERT `deal_activities`              | No                    |
| `update_deal_stage`      | UPDATE `deals` + INSERT `deal_stages` | **Yes**               |
| `grant_data_room_access` | INSERT/UPDATE `deal_data_room_access` | **Yes**               |

#### Mixed Array/String Column Issue

The `buyers` table has columns that store data as either arrays or strings:

| Column                 | Expected              | Actual                       | Impact                       |
| ---------------------- | --------------------- | ---------------------------- | ---------------------------- |
| `geographic_footprint` | `["OH","PA"]`         | Sometimes `"OH, PA"`         | `.some()` crashes on strings |
| `services_offered`     | `["HVAC","Plumbing"]` | Sometimes `"HVAC, Plumbing"` | Same                         |
| `target_industries`    | Array                 | Sometimes string             | Same                         |
| `target_services`      | Array                 | Sometimes string             | Same                         |

**Current mitigation**: `fieldContains()` helper handles both types. New code must use this helper.

---

## 5. Router & Orchestration

### 5.1 All 22 Intent Categories with Tool Access

| Category           | # Tools | Key Tools                                                                                                                                 |
| ------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| DEAL_STATUS        | 10      | query_deals, get_deal_details, get_deal_memos, get_deal_documents, get_deal_comments                                                      |
| FOLLOW_UP          | 8       | get_deal_tasks, get_outreach_records, get_follow_up_queue, get_connection_requests                                                        |
| BUYER_SEARCH       | 8       | search_buyers, search_lead_sources, search_valuation_leads, query_deals                                                                   |
| BUYER_ANALYSIS     | 12      | search_buyers, get_buyer_profile, explain_buyer_score, get_top_buyers_for_deal                                                            |
| BUYER_UNIVERSE     | 5       | search_buyer_universes, get_universe_details, get_top_buyers_for_deal                                                                     |
| MEETING_INTEL      | 5       | search_transcripts, search_fireflies, semantic_transcript_search                                                                          |
| PIPELINE_ANALYTICS | 7       | get_pipeline_summary, query_deals, get_analytics, get_cross_deal_analytics                                                                |
| CROSS_DEAL         | 3       | get_cross_deal_analytics, get_analytics, get_pipeline_summary                                                                             |
| SEMANTIC_SEARCH    | 3       | semantic_transcript_search, search_buyer_transcripts                                                                                      |
| DAILY_BRIEFING     | 7       | get_follow_up_queue, get_cross_deal_analytics, get_analytics, get_deal_tasks                                                              |
| ACTION             | 6       | create_deal_task, add_deal_note, update_deal_stage, grant_data_room_access                                                                |
| UI_ACTION          | 4       | select_table_rows, apply_table_filter, sort_table_column, navigate_to_page                                                                |
| REMARKETING        | 9       | search_buyers, explain_buyer_score, select_table_rows, get_engagement_signals                                                             |
| MEETING_PREP       | 6       | generate_meeting_prep, semantic_transcript_search, get_connection_messages                                                                |
| OUTREACH_DRAFT     | 6       | get_deal_details, get_buyer_profile, draft_outreach_email, search_pe_contacts                                                             |
| LEAD_INTEL         | 5       | search_inbound_leads, get_referral_data, get_deal_referrals                                                                               |
| ENGAGEMENT         | 5       | get_engagement_signals, get_buyer_decisions, get_score_history                                                                            |
| CONNECTION         | 3       | get_connection_requests, get_connection_messages, get_deal_conversations                                                                  |
| CONTACTS           | 6       | search_pe_contacts, search_contacts, get_firm_agreements, get_nda_logs                                                                    |
| INDUSTRY           | 2       | get_industry_trackers, search_buyer_universes                                                                                             |
| PIPELINE_REPORT    | 1       | generate_pipeline_report                                                                                                                  |
| GENERAL            | 7       | get_current_user_context, query_deals, search_buyers, search_contacts, get_pipeline_summary, get_follow_up_queue, get_connection_requests |

### 5.2 Bypass Rules (30 Regex Patterns)

Key patterns with their target categories:

| Pattern                                                      | → Category         | Example                           |
| ------------------------------------------------------------ | ------------------ | --------------------------------- |
| `pipeline\|summary\|overview\|briefing\|daily\|good morning` | DAILY_BRIEFING     | "catch me up"                     |
| `how many + deal + industry_keyword`                         | PIPELINE_ANALYTICS | "how many hvac deals"             |
| `how many + deal`                                            | PIPELINE_ANALYTICS | "total active deals"              |
| `tell me about + company`                                    | DEAL_STATUS        | "what is this company"            |
| `task\|todo\|follow.?up\|overdue`                            | FOLLOW_UP          | "overdue tasks"                   |
| `buyer + search\|find\|show`                                 | BUYER_SEARCH       | "find PE buyers"                  |
| `score\|rank\|top buyer\|best buyer`                         | BUYER_ANALYSIS     | "top buyers for this deal"        |
| `transcript\|call\|meeting\|discussed`                       | MEETING_INTEL      | "what was discussed"              |
| `select\|filter\|sort`                                       | REMARKETING        | "filter by state"                 |
| `create task\|add note`                                      | ACTION             | "create a task"                   |
| `update stage\|move to`                                      | ACTION             | "move to LOI stage"               |
| `data room\|grant access`                                    | ACTION             | "open data room"                  |
| `draft\|write\|email\|outreach`                              | OUTREACH_DRAFT     | "draft an email"                  |
| `buyer universe\|universe`                                   | BUYER_UNIVERSE     | "universe details"                |
| `outreach\|nda\|contacted`                                   | FOLLOW_UP          | "who have we contacted"           |
| `engagement signal\|ioi\|loi`                                | ENGAGEMENT         | "any IOI signals"                 |
| `pass.?reason\|passed on`                                    | ENGAGEMENT         | "why did they pass"               |
| `inbound lead\|website lead`                                 | LEAD_INTEL         | "new inbound leads"               |
| `contact at\|email for`                                      | CONTACTS           | "find contacts at Trivest"        |
| `find companies\|discover`                                   | BUYER_SEARCH       | "find hvac shops in TX"           |
| `document\|teaser\|memo\|cim`                                | DEAL_STATUS        | "where's the CIM"                 |
| `why.*score\|explain.*score`                                 | BUYER_ANALYSIS     | "why did they score 85"           |
| `what did.*say\|sentiment`                                   | SEMANTIC_SEARCH    | "what did they say about add-ons" |
| `enrichment\|enrich status`                                  | PIPELINE_ANALYTICS | "enrichment status"               |
| `connection request`                                         | CONNECTION         | "show connection requests"        |
| `nda log\|fee agreement`                                     | CONTACTS           | "who signed NDAs"                 |
| `deal referral`                                              | LEAD_INTEL         | "deal referrals"                  |
| `learning history`                                           | ENGAGEMENT         | "buyer learning history"          |
| `industry tracker\|vertical`                                 | INDUSTRY           | "industry trackers"               |
| `comment\|internal note`                                     | DEAL_STATUS        | "deal comments"                   |

---

## 6. External Integrations

### 6.1 Status Summary

| Integration      | Status          | AI Access                                          | Webhooks       |
| ---------------- | --------------- | -------------------------------------------------- | -------------- |
| **Fireflies.ai** | Working         | Yes (search_fireflies, semantic_transcript_search) | No             |
| **Apify**        | Working         | No (admin-only)                                    | No             |
| **Prospeo**      | Working         | No (admin-only)                                    | No             |
| **PandaDoc**     | Working         | No (UI-only)                                       | Yes (incoming) |
| **PhoneBurner**  | Working         | No (logging only)                                  | Yes (incoming) |
| **SmartLead**    | Not Implemented | —                                                  | —              |

### 6.2 Fireflies.ai

- **Functions**: `search-fireflies-for-buyer`, `fetch-fireflies-content`, `sync-fireflies-transcripts`
- **API**: `https://api.fireflies.ai/graphql` (Bearer token)
- **Flow**: GraphQL → `deal_transcripts.transcript_text` (cached) → AI semantic search
- **Features**: Silent meeting detection, external participant extraction, domain dedup

### 6.3 Apify + Prospeo (Contact Enrichment Pipeline)

- **Orchestrator**: `find-contacts` edge function
- **Apify API**: `https://api.apify.com/v2` — LinkedIn company + employee scraping
- **Prospeo API**: `https://api.prospeo.io/v1` — 3-step waterfall (LinkedIn → name+domain → domain search)
- **Flow**: Company → Firecrawl → LinkedIn URL → Apify scrape → employee list → Prospeo emails → `enriched_contacts`
- **AI Access**: Not exposed — admin-only endpoint

### 6.4 PandaDoc (E-Signatures)

- **Functions**: `pandadoc-webhook-handler`, `create-pandadoc-submission`, `get-buyer-nda-embed`, `get-buyer-fee-embed`
- **Events**: form.completed, form.viewed, form.started, form.declined, form.expired
- **Security**: HMAC timing-safe, configurable header
- **State Machine**: not_sent → viewed → started → completed/declined/expired (no backward)
- **Idempotency**: Unique constraint on (submission_id, event_type)

### 6.5 PhoneBurner (Cold Calling)

- **Functions**: `phoneburner-webhook`, `phoneburner-push-contacts`, `phoneburner-oauth-callback`
- **Events**: call_begin, call_end, disposition.set, contact_displayed, callback.scheduled
- **Security**: HMAC-SHA256 (X-Phoneburner-Signature)
- **Flow**: Webhook → `contact_activities` + `buyer_contacts` (DNC flags) + `disposition_mappings`
- **OAuth**: Per-user tokens in `phoneburner_oauth_tokens`

### 6.6 SmartLead — NOT IMPLEMENTED

Zero code exists. No tables, no functions, no API calls.

---

## 7. Critical Findings

### 7.1 HIGH: Client-Side Filtering

**Tools**: `query_deals`, `search_buyers`, `get_pipeline_summary`, `search_pe_contacts`

Fetch ALL records then filter in JS. No server-side WHERE for text search. 50-result limit means relevant results may be missed on large datasets.

**Fix**: Add `.ilike()` / `.contains()` server-side filters.

### 7.2 ~~HIGH~~ FIXED: Mixed Array/String Column Types

**Columns**: `geographic_footprint`, `services_offered`, `target_industries`, `target_services` on `buyers`

Stored as either JSON arrays or plain strings. Code using `.some()` directly crashes on strings. `fieldContains()` helper exists and is now used consistently across all filters (search, industry, services).

**Status**: Fixed — `fieldContains()` applied to all mixed-type column access in buyer-tools.ts industry filter. Migration to normalize data types is still recommended for long-term data quality.

### 7.3 HIGH: Tool Category Restrictions

Router misclassification means AI gets wrong tool subset. Example: "collision buyers in Oklahoma" needs `search_buyers` (BUYER_SEARCH) but may route to PIPELINE_ANALYTICS.

**Mitigation**: GENERAL fallback now includes core tools. Bypass rules cover common patterns.

### 7.4 MEDIUM: Enrichment Pipeline Not Exposed to AI

Apify+Prospeo `/find-contacts` is admin-only. AI cannot trigger contact enrichment.

### 7.5 ~~MEDIUM~~ FIXED: PhoneBurner Call History Tool

`get_call_history` tool now queries `contact_activities` by contact, buyer, rep, activity type, disposition, and date range. Registered in FOLLOW_UP, ENGAGEMENT, CONTACTS, and DAILY_BRIEFING categories. Router bypass rule added for call-related queries.

### 7.6 MEDIUM: Router Fallback Fragility

Haiku timeout/failure → GENERAL category with confidence 0.3. During LLM outages, all non-bypassed queries get degraded classification.

### 7.7 LOW: SmartLead Not Implemented

No email campaign capability exists.

### 7.8 LOW: PandaDoc Not Exposed to AI

NDA sending is UI-only. AI cannot trigger document signing.

---

## 8. Recommendations

### Priority 1 — Performance & Data Quality

1. **Server-side filtering** for query_deals, search_buyers, search_pe_contacts — use `.ilike()`, `.in()`, `.or()` instead of fetching all records
2. **Normalize mixed-type columns** — migration to convert buyer field strings to arrays

### Priority 2 — Tool Gaps

3. ~~**Create `get_call_history` tool**~~ DONE — queries `contact_activities` by contact/buyer/rep/disposition/date with summary stats
4. **Create `find_contacts_enriched` tool** — wrap `/find-contacts` with cost guardrails for AI use
5. ~~**Add `get_buyer_contacts` tool**~~ DONE — `getBuyerProfile` now queries unified `contacts` table instead of legacy `buyer_contacts`

### Priority 3 — Router Resilience

6. **More bypass rules** for remaining common patterns
7. **Expand GENERAL category** with `get_deal_details`, `get_deal_tasks`

### Priority 4 — Future

8. Implement SmartLead if email campaigns needed
9. Expose PandaDoc to AI if automated NDA sending desired
10. Add PhoneBurner push capability for AI-queued dialing

---

## Appendix: Environment Variables

```
FIREFLIES_API_KEY=
APIFY_API_TOKEN=
FIRECRAWL_API_KEY=              # Optional
PROSPEO_API_KEY=
PANDADOC_WEBHOOK_SECRET=
PANDADOC_WEBHOOK_SECRET_HEADER= # Default: onboarding-secret
PHONEBURNER_WEBHOOK_SECRET=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
```

---

_Generated by automated system audit — 2026-02-24. Updated with fixes: 2026-02-24._
