# Comprehensive Task & Deal Workflow Audit
**Date:** 2026-04-07
**Scope:** Every workflow, function, feature, backend, frontend, data schema, edge function, and AI enrichment related to tasks, daily meetings, deal visibility, call integration, and follow-ups.

---

## Executive Summary

Connect Market Nexus has a mature task extraction and deal management system with 245+ database tables, 139+ edge functions, and 641 frontend components. However, **the core problem — "when I click on a deal, I don't understand what happened" — stems from fragmented activity logging across 6+ separate tables with no unified timeline, and missing automation that forces the team to manually log what should be captured automatically.**

This audit documents **40 complete workflows**, identifies every gap in each, and proposes solutions prioritized by automation impact.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Data Schema Map](#2-data-schema-map)
3. [Workflows 1-10: Daily Meeting & Task Lifecycle](#3-workflows-1-10)
4. [Workflows 11-20: Deal Visibility & Activity Tracking](#4-workflows-11-20)
5. [Workflows 21-30: Call & Meeting Integration](#5-workflows-21-30)
6. [Workflows 31-40: Follow-ups, Automation & AI](#6-workflows-31-40)
7. [Gap Summary Matrix](#7-gap-summary-matrix)
8. [Recommended Solutions (Prioritized)](#8-recommended-solutions)

---

## 1. Architecture Overview

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript, Vite 5, TailwindCSS, shadcn/ui |
| State | TanStack React Query 5, React Context |
| Backend | Supabase (PostgreSQL 15, Edge Functions in Deno) |
| AI Primary | Gemini 2.0 Flash (via OpenRouter) — extraction & enrichment |
| AI Secondary | Claude Sonnet/Opus (Anthropic) — AI Command Center, memos |
| Calls | PhoneBurner (dialer + webhooks) |
| Meetings | Fireflies.ai (transcript sync + task extraction) |
| Email | Brevo (primary), SmartLead (campaigns) |
| LinkedIn | HeyReach (campaigns) |
| E-Signatures | PandaDoc |
| Enrichment | Clay, Blitz, Prospeo, Apify, Firecrawl |

### Key Tables for This Audit
| Table | Purpose | Record Count Context |
|-------|---------|---------------------|
| `daily_standup_tasks` | AI-extracted + manual tasks from meetings | Core task table |
| `standup_meetings` | Fireflies meeting records | Meeting source |
| `deal_activities` | Deal interaction log | **Exists but barely written to** |
| `contact_activities` | PhoneBurner call events | Call log |
| `contact_email_history` | SmartLead email events | Email log |
| `contact_linkedin_history` | HeyReach LinkedIn events | LinkedIn log |
| `contact_call_history` | Unified call history | Call log |
| `deal_transcripts` | Fireflies + PhoneBurner transcripts linked to deals | Transcript store |
| `deals` | Deal/opportunity tracking with stages | Deal pipeline |
| `deal_stages` | Pipeline stage definitions | Stage config |
| `listings` | Business listings (the actual companies) | Source deals |
| `outreach_records` | Follow-up activity per buyer-deal pair | Outreach tracking |
| `enrichment_events` | AI enrichment operation log | Enrichment log |
| `user_notifications` | In-app notification queue | Notifications |
| `rm_deal_cadence` | Follow-up cadence scheduling | Cadence config |

---

## 2. Data Schema Map

### Task Data Model
```
daily_standup_tasks
├── id (uuid)
├── title, description
├── assignee_id → profiles.id
├── task_type (contact_owner | build_buyer_universe | follow_up_with_buyer | 
│              send_materials | update_pipeline | schedule_call | nda_execution |
│              ioi_loi_process | due_diligence | buyer_qualification | 
│              seller_relationship | buyer_ic_followup | call | email | 
│              find_buyers | contact_buyers)
├── task_category (deal_task | platform_task | operations_task)
├── status (pending_approval → pending → in_progress → completed | overdue | snoozed | cancelled | listing_closed)
├── due_date, completed_at, snoozed_until
├── source_meeting_id → standup_meetings.id
├── deal_id → deals.id
├── entity_type + entity_id (polymorphic link to deal/buyer/contact/listing)
├── extraction_confidence, ai_confidence, ai_evidence_quote
├── priority_score, priority_rank, is_pinned
├── depends_on (array of task IDs)
├── completion_notes, completion_transcript_id
└── created_by, created_at, updated_at
```

### Deal Activity Model (UNDERUSED)
```
deal_activities
├── id (uuid)
├── deal_id → deals.id
├── admin_id → profiles.id
├── activity_type (stage_change | task_created | task_completed | note_added | 
│                  email_sent | call_made | meeting_scheduled | document_shared |
│                  nda_sent | nda_signed | fee_agreement_sent | fee_agreement_signed | follow_up)
├── title, description
├── metadata (JSONB)
└── created_at
```

### Contact History Model (FRAGMENTED ACROSS 3 TABLES)
```
contact_email_history    → SmartLead emails (sent, opened, clicked, replied)
contact_call_history     → PhoneBurner calls (connected, voicemail, no_answer, etc.)
contact_linkedin_history → HeyReach LinkedIn (connection_request, message, inmail, etc.)
```

---

## 3. Workflows 1-10: Daily Meeting & Task Lifecycle

### WORKFLOW 1: Daily Standup Meeting → Task Extraction
**Description:** Team has a daily standup. Fireflies records it. Tasks are automatically extracted and assigned.

**Current Steps:**
1. Team holds daily standup (Zoom/Google Meet with Fireflies bot)
2. Meeting must be tagged with `<ds>` in the title for auto-processing
3. Fireflies processes recording → generates transcript + action items
4. **Path A (Webhook):** Fireflies sends webhook to `process-standup-webhook` edge function
5. **Path B (Polling fallback):** `sync-standup-meetings` runs at 12 PM ET and 5 PM ET via pg_cron, polls Fireflies API with 48-hour lookback for `<ds>`-tagged meetings
6. Edge function calls `extract-standup-tasks` which uses Gemini 2.0 Flash (or falls back to Fireflies native action_items parsing)
7. AI extracts: task title, assignee (from speaker name), task_type, due_date, deal_reference, confidence level
8. Tasks saved to `daily_standup_tasks` with status `PENDING_APPROVAL`
9. Meeting saved to `standup_meetings` with extraction stats

**Frontend:**
- `DailyTaskDashboard.tsx` shows pending approvals at top
- `PendingApprovalSection.tsx` is leadership-only
- `StandupsTabContent.tsx` shows meeting list with extracted tasks

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| Meeting MUST be tagged `<ds>` — no auto-detection of standup format | Missed meetings if someone forgets the tag | HIGH |
| No notification when tasks are extracted and awaiting approval | Leadership doesn't know tasks are ready for review | HIGH |
| Webhook + polling creates potential duplicate processing | Tasks could be double-extracted | MEDIUM |
| No fallback if Gemini AND Fireflies native parsing both fail | Tasks silently lost | HIGH |
| `team_member_aliases` must be manually configured for speaker→user mapping | New team members' tasks go unassigned | MEDIUM |
| No confirmation that all attendees got tasks (some people may have been silent) | Team members with no tasks aren't flagged | LOW |

---

### WORKFLOW 2: Reviewing & Approving Extracted Tasks
**Description:** Leadership reviews AI-extracted tasks before they go live.

**Current Steps:**
1. Open Daily Task Dashboard → see "Pending Approval" section
2. Each task shows: title, assignee, task_type, due_date, confidence score, AI evidence quote
3. Leadership can: Approve (→ pending), Dismiss (→ cancelled), Edit before approving
4. Bulk "Approve All" button available
5. Approved tasks appear in assignee's task list

**Frontend:**
- `PersonTaskGroup.tsx` groups tasks by assignee
- `TaskCard.tsx` shows individual task with actions

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| No notification to assignee when their task is approved | Assignee doesn't know they have new work | **CRITICAL** |
| No email/Slack notification — only in-app | If user doesn't check dashboard, tasks are invisible | **CRITICAL** |
| No "reject and reassign" — only approve or dismiss | Can't redirect a task to the right person without creating a new one | HIGH |
| No approval deadline — tasks can sit in pending_approval indefinitely | Stale tasks pile up | MEDIUM |
| No confidence threshold auto-approve (high-confidence tasks still need manual approval) | Slows down the team unnecessarily | MEDIUM |

---

### WORKFLOW 3: Working Through My Daily Tasks
**Description:** Team member opens dashboard, sees their tasks for today, works through them.

**Current Steps:**
1. Open Daily Task Dashboard → "My Tasks" tab
2. Tasks grouped: Today/Overdue → Upcoming → Snoozed → Completed
3. Click task → see details, deal link, evidence quote
4. Work on task (externally — call, email, etc.)
5. Come back → mark as completed (with optional completion notes)
6. Or snooze (tomorrow, 3 days, 1 week, 2 weeks, 1 month)

**Frontend:**
- `TaskListContent.tsx` → `TaskCard.tsx` with status actions
- Completion modal with notes field

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| No link from task to the actual action (e.g., "Call John" doesn't launch PhoneBurner) | User has to manually find the contact and dial | HIGH |
| Completing a task doesn't auto-log activity on the deal | Deal page doesn't show the task was done | **CRITICAL** |
| No "what did you do?" structured completion (just free text notes) | Completion data is unstructured and hard to report on | HIGH |
| No auto-completion detection (e.g., if task is "send NDA" and NDA status changes to sent) | Team must manually check off things that the system already knows happened | **CRITICAL** |
| No daily task summary email at start of day | Team must proactively check the dashboard | HIGH |
| No mobile-friendly view | Can't check tasks on the go | MEDIUM |

---

### WORKFLOW 4: Confirming Everyone Completed Their Tasks
**Description:** After completing my tasks, I want to see if my teammates finished theirs.

**Current Steps:**
1. Switch to "All Team Tasks" view on dashboard
2. Tasks grouped by assignee
3. Can see: pending, in_progress, completed, overdue per person
4. `TaskAnalytics.tsx` provides team leaderboard with completion rates

**Frontend:**
- `DailyTaskAnalytics.tsx` → Team overview, leaderboard, individual scorecards
- `TaskStatsCards.tsx` → KPI cards (total, completed, overdue, avg time)

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| No "end of day" summary that shows who's done and who's not | Leadership has to manually check | HIGH |
| No escalation for overdue tasks (no notification to the assignee OR their manager) | Tasks silently go overdue | **CRITICAL** |
| No way to nudge/remind a specific person about their outstanding tasks | Must use external communication (Slack, etc.) | HIGH |
| Analytics show completion % but not which specific tasks are blocking | Have to drill down manually per person | MEDIUM |
| No comparison view: "tasks from this morning's meeting — what % done?" | Can't measure daily meeting effectiveness directly | MEDIUM |

---

### WORKFLOW 5: Creating a Manual Task (Not From a Meeting)
**Description:** User wants to create a task ad-hoc, not from a standup extraction.

**Current Steps:**
1. On Daily Task Dashboard or Deal Detail → "Create Task" button
2. Fill in: title, description, assignee, task_type, due_date, priority
3. Can link to: deal, buyer, contact, listing (entity_type + entity_id)
4. Task created with `is_manual = true`, status = `pending` (skips approval)
5. Also possible via AI Command Center (`create_task` tool)

**Frontend:**
- `CreateTaskDialog.tsx` — form with fields
- `EntityTasksTab.tsx` — task list on deal/buyer pages

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| Manual tasks skip the approval workflow — no oversight on what's being created | Could lead to task sprawl | LOW |
| No task templates (e.g., "standard NDA follow-up sequence") | Team recreates the same task structures repeatedly | HIGH |
| No recurring task support (e.g., "check in with buyer every 2 weeks") | Must manually recreate recurring tasks | **CRITICAL** |
| Creating a task on a deal doesn't notify the deal owner | Deal owner unaware of new tasks on their deal | HIGH |

---

### WORKFLOW 6: Task Dependencies & Sequencing
**Description:** Some tasks depend on others (e.g., "Send CIM" blocked by "Get NDA signed").

**Current Steps:**
1. `daily_standup_tasks.depends_on` field exists (array of task IDs)
2. No UI for setting dependencies (field exists in DB only)
3. No enforcement — dependent tasks don't auto-block

**Frontend:** No dependency UI exists.

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| `depends_on` field exists but NO frontend UI to set or view dependencies | Feature is dead code | HIGH |
| No auto-blocking of tasks when their dependency isn't complete | Users can complete tasks out of order | MEDIUM |
| No visual dependency graph or Gantt-style view | Can't see task sequencing | MEDIUM |
| No auto-creation of downstream tasks when a dependency completes | Must manually create the next step | HIGH |

---

### WORKFLOW 7: Snoozing & Rescheduling Tasks
**Description:** A task can't be done today — snooze it for later.

**Current Steps:**
1. Click snooze on task card
2. Choose preset: tomorrow, 3 days, 1 week, 2 weeks, 1 month
3. Task status → `snoozed`, `snoozed_until` set
4. Task reappears in task list when snooze expires

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| No custom snooze date (only presets) | Can't snooze to a specific date | MEDIUM |
| No snooze reason tracked | Can't analyze why tasks are being deferred | LOW |
| No limit on how many times a task can be snoozed | Tasks can be perpetually deferred | HIGH |
| No notification when snoozed task reappears | User might miss it again | MEDIUM |
| Snoozing doesn't notify the task creator or deal owner | They think the task is being worked on | HIGH |

---

### WORKFLOW 8: Task Completion → Deal Activity Logging
**Description:** When a task is completed, the deal should reflect that work was done.

**Current State:** **THIS IS BROKEN.**

**What should happen:**
1. Task marked complete → `deal_activities` row inserted with type `task_completed`
2. Deal detail page shows "Task 'Follow up with buyer' completed by John at 3:15 PM"
3. If task had completion notes, those appear on the deal

**What actually happens:**
1. Task marked complete → `daily_standup_tasks.status` updated to `completed`
2. `daily_standup_tasks.completed_at` timestamp set
3. **NO write to `deal_activities`** — edge functions never insert into this table
4. Deal page shows **nothing** about the task being completed
5. The only way to see completed tasks is on the Task Dashboard

**Root Cause:** The `deal_activities` table exists with the right schema (activity_type includes `task_completed`) but **no edge function or frontend mutation writes to it when tasks are completed.** Activity logging is fragmented — PhoneBurner writes to `contact_activities`, enrichment writes to `enrichment_events`, but task completion writes to **nothing**.

**Severity: CRITICAL** — This is the #1 reason "when I click on a deal, I don't understand what happened."

---

### WORKFLOW 9: Meeting-to-Task Accuracy Validation
**Description:** How do we know the AI extracted the right tasks from the meeting?

**Current Steps:**
1. AI extracts tasks with `extraction_confidence` (high/medium/low)
2. `ai_evidence_quote` shows the transcript snippet that triggered the task
3. Leadership reviews in approval queue
4. Can view the full standup transcript in the Standups tab

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| No feedback loop — if a task is dismissed, the AI doesn't learn from it | Same extraction mistakes repeat | MEDIUM |
| No comparison: "AI extracted 5 tasks, but 8 were actually assigned" | Can't measure extraction completeness | HIGH |
| No ability to add missed tasks from the transcript retroactively | Must create manual tasks instead | MEDIUM |
| Confidence thresholds not tunable by the team | Can't adjust AI sensitivity | LOW |

---

### WORKFLOW 10: Task Reporting & Analytics
**Description:** Leadership wants to understand task completion trends, team performance, and meeting effectiveness.

**Current Steps:**
1. `DailyTaskAnalytics.tsx` → Team overview tab
2. KPIs: total assigned, completion rate, overdue count, avg completion time
3. Task type breakdown with progress bars
4. Team leaderboard (ranked by completion %)
5. Individual scorecards: completion trends, priority discipline
6. Meeting quality metrics tab

**Frontend:**
- `useTaskAnalytics()` → aggregate queries
- `useTeamScorecards()` → per-person performance
- `useMeetingQualityMetrics()` → meeting extraction quality
- `useTaskVolumeTrend()` → created vs completed over time

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| No exportable report (PDF/CSV) | Can't share analytics outside the platform | MEDIUM |
| No deal-level task summary (how many tasks per deal, completion rate per deal) | Can't identify deals with execution gaps | HIGH |
| No time-to-completion by task type analysis | Can't identify which task types take longest | MEDIUM |
| No "tasks generated vs tasks actually useful" metric | Can't measure AI extraction ROI | MEDIUM |

---

## 4. Workflows 11-20: Deal Visibility & Activity Tracking

### WORKFLOW 11: Opening a Deal — Understanding What's Happened
**Description:** I click on a deal. I need to instantly understand: what calls happened, what emails were sent, what tasks are open, what the next steps are, and what stage we're in.

**Current State:**
The deal detail page has 7 tabs:
1. **Overview** — company info, financials, contacts, enrichment data
2. **Contact History** — unified email + call + LinkedIn timeline per contact
3. **Call Activity** — PhoneBurner calls with recordings + transcripts
4. **Buyer Introductions** — Kanban board of buyer pipeline
5. **Buyer Outreach** — table of outreach contacts with status
6. **Tasks** — tasks linked to this deal
7. **Data Room** — documents, memos, access

**What's Missing:**
| Missing Element | Impact | Severity |
|-----------------|--------|----------|
| **No unified deal activity timeline** showing ALL events (calls, emails, tasks, stage changes, notes, enrichment) in one chronological feed | Must click through 5+ tabs to piece together what happened | **CRITICAL** |
| **No "last activity" indicator** on the deal header | Can't tell at a glance if a deal is stale | **CRITICAL** |
| **No "next step" summary** at the top of the deal | Have to scan tasks/outreach to figure out what's next | HIGH |
| **No stage progression timeline** (visual: NDA → Signed → CIM → IOI → LOI → Close) | Can't see the deal's journey at a glance | HIGH |
| **No Fireflies meeting summary** on the deal overview | Meeting happened but deal page doesn't show it | **CRITICAL** |
| **No PhoneBurner call outcome summary** on overview | Calls happened but you have to go to Call Activity tab | HIGH |
| `deal_activities` table exists but is never written to by backend | The infrastructure is there but unused | **CRITICAL** |

---

### WORKFLOW 12: A Call Happens — Deal Should Auto-Update
**Description:** Someone on the team calls a contact via PhoneBurner. The deal should automatically reflect that a call happened, what was discussed, and what the next steps are.

**Current Flow:**
1. User launches PhoneBurner session via `phoneburner-push-contacts`
2. Dials contact → PhoneBurner tracks call
3. Call ends → PhoneBurner sends webhook to `phoneburner-webhook`
4. Webhook writes to `phoneburner_webhooks_log` (raw) and `contact_activities` (processed)
5. `contact_activities` records: call_started_at, duration, disposition, transcript, recording_url
6. If transcript available, `sync-phoneburner-transcripts` can create `deal_transcripts` entry
7. Fire-and-forget trigger of `enrich-deal` for affected listings

**What the deal page shows:**
- Call Activity tab shows the call (if you navigate to it)
- Contact History tab shows the call in the timeline (if you navigate to it)

**What the deal page SHOULD show:**
- Overview tab: "Call with John Smith — 12 min — Connected — 2 hours ago"
- AI-generated call summary with next steps
- Auto-created follow-up task if disposition indicates callback needed

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| Call doesn't write to `deal_activities` | Deal timeline doesn't show calls | **CRITICAL** |
| No AI summary of the call pushed to deal overview | Must listen to recording or read raw transcript | HIGH |
| No auto-creation of follow-up task from call disposition | If disposition = "callback", no task is created | **CRITICAL** |
| No notification to deal owner that a call happened on their deal | Deal owner unaware of progress | HIGH |
| PhoneBurner webhook has NO authentication (relies on IP allowlisting) | Security risk | HIGH |

---

### WORKFLOW 13: A Meeting Happens — Deal Should Auto-Update
**Description:** A meeting is held with a buyer/seller. Fireflies records it. The deal should automatically show the meeting summary, key discussion points, and next steps.

**Current Flow:**
1. Meeting happens (Zoom/Meet/Teams with Fireflies bot)
2. Fireflies processes transcript
3. User triggers `sync-fireflies-transcripts` (or auto-sync via standup webhook if tagged)
4. Transcript matched to deal via participant email or company name
5. Stored in `deal_transcripts` with `fireflies_transcript_id`
6. If enrichment queue triggered, `enrich-deal` processes transcript via Gemini

**What the deal page shows:**
- Transcripts listed in a transcript section (if navigated to)
- Enriched data (revenue, EBITDA, etc.) updated silently in the background

**What the deal page SHOULD show:**
- "Meeting with ABC Corp — 45 min — Yesterday" prominently on overview
- AI-generated meeting summary with: topics discussed, decisions made, next steps, action items
- Auto-created tasks from meeting action items
- Updated deal fields highlighted ("Revenue updated from meeting: $5M → $7M")

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| Non-standup meetings don't auto-extract tasks | Only `<ds>`-tagged standups get task extraction | **CRITICAL** |
| No meeting summary displayed on deal overview | Must go to transcript section and read raw text | **CRITICAL** |
| No "fields updated from this meeting" indicator | Enrichment happens silently, no transparency | HIGH |
| Transcript sync is manual (user must trigger) for non-standup meetings | Meetings can go unlinked to deals | HIGH |
| No auto-pairing of meetings to deals based on participant email matching | Only standup meetings have auto-processing | HIGH |

---

### WORKFLOW 14: Deal Stage Progression & Automation
**Description:** A deal moves through stages: Sourced → Qualified → NDA Sent → NDA Signed → Fee Agreement → Due Diligence → LOI → Closed. Each stage change should trigger automations.

**Current State:**
- `deal_stages` table has 11 predefined stages
- `deals.stage_id` tracks current stage
- Stage changes are manual (drag-and-drop or dropdown)
- Stage names are used in hardcoded string comparisons for automations

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| No automatic stage advancement (e.g., NDA signed → auto-advance to "NDA Signed" stage) | Team must manually update stages | **CRITICAL** |
| No stage change notification to deal team | Team members don't know a deal advanced | HIGH |
| No enforcement of stage order (can jump from "Sourced" to "Closed Won") | Data integrity risk | HIGH |
| No required fields per stage (e.g., must have NDA before advancing past "NDA Sent") | Deals can advance without completing requirements | HIGH |
| No auto-task creation on stage entry (e.g., entering "Due Diligence" should create DD checklist) | Must manually create tasks for each stage | **CRITICAL** |
| Stage names hardcoded in automations — renaming breaks workflows | Fragile architecture | HIGH |
| No stage duration tracking or SLA alerts | Can't identify bottleneck stages | MEDIUM |

---

### WORKFLOW 15: Adding Notes to a Deal
**Description:** Team member wants to add context to a deal after a conversation, meeting, or internal discussion.

**Current Steps:**
1. Deal Overview tab has notes section
2. User can add text notes
3. AI analysis button available for note enrichment
4. Notes stored in `listing_notes` / `listing_personal_notes`

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| Notes don't appear in a unified deal timeline | Isolated from call/email/task activity | HIGH |
| No @mention or tagging of team members in notes | Can't direct notes to specific people | MEDIUM |
| No structured note types (call recap, meeting notes, internal discussion, buyer feedback) | All notes look the same | HIGH |
| Adding a note doesn't write to `deal_activities` | Note addition not tracked in deal history | HIGH |
| No ability to pin important notes to the top | Key context gets buried | MEDIUM |

---

### WORKFLOW 16: Viewing Buyer History on a Deal
**Description:** For a specific deal, I want to see all the buyers who were contacted, their responses, and where they are in the process.

**Current Steps:**
1. Buyer Introductions tab → Kanban board (Recommended → Introduced → In Process → Approved → Pipeline)
2. Buyer Outreach tab → table with status, last contact date, channels used
3. Contact History tab → per-contact timeline of emails, calls, LinkedIn messages

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| No buyer-level summary (e.g., "15 buyers contacted, 3 interested, 1 in DD") on deal overview | Must navigate to separate tabs to get the picture | HIGH |
| No buyer response heat map (which buyers are warm vs cold) | Hard to prioritize follow-ups | MEDIUM |
| Outreach status is basic (not_contacted → contacted → interested) — no sub-statuses | Can't distinguish "interested but timing wrong" from "interested and ready" | MEDIUM |
| No buyer timeline showing all touchpoints across channels | Must check email, call, and LinkedIn separately | HIGH |
| Buyer introduction activity log exists but isn't surfaced prominently | Introduction follow-ups get lost | HIGH |

---

### WORKFLOW 17: Deal Enrichment Transparency
**Description:** AI enriches deal data from transcripts, websites, LinkedIn, Google Reviews. I need to know what was enriched, when, and from what source.

**Current Flow:**
1. `enrich-deal` orchestrator runs (manual trigger or queue)
2. Sources: transcript extraction (Gemini), website scraping (Firecrawl), LinkedIn (Apify), Google Reviews (Apify)
3. Source priority system prevents overwriting higher-confidence data
4. Results merged into `listings` table
5. `enrichment_events` table logs what happened

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| No "enrichment history" visible on deal page | Can't see what was enriched and when | HIGH |
| No "data source" indicator per field (e.g., "Revenue: $5M — from transcript 03/15") | Don't know where data came from | HIGH |
| No diff view when enrichment changes existing values | Changes happen silently | MEDIUM |
| No manual override tracking (if user edits an AI-enriched field) | Don't know if data is AI or human-verified | MEDIUM |
| Enrichment errors not surfaced to user | Silent failures | HIGH |

---

### WORKFLOW 18: Deal Assignment & Ownership
**Description:** Deals are assigned to team members. Ownership changes should be tracked and notified.

**Current State:**
- `deals.assigned_to` tracks owner
- `rm_deal_team` tracks multiple team members per deal
- `notify-deal-owner-change` and `notify-deal-reassignment` edge functions exist
- `notify-new-deal-owner` sends welcome email

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| Ownership change doesn't log to `deal_activities` | History of who owned the deal when is lost | HIGH |
| No workload balancing visibility (how many deals per person) | Can't distribute work evenly | MEDIUM |
| No automatic reassignment rules (e.g., if deal owner is OOO) | Deals stall when owner is unavailable | MEDIUM |

---

### WORKFLOW 19: Deal Signals & Risk Detection
**Description:** AI detects positive and negative signals from transcripts and engagement data.

**Current State:**
- `rm_deal_signals` table stores signals with type and strength
- `DealSignalsPanel.tsx` shows positive/warning/critical signals with verbatim quotes
- Signals can be acknowledged by users

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| Signals don't trigger notifications | Critical risk signals can go unnoticed | HIGH |
| No signal trend tracking (is this deal getting better or worse?) | Point-in-time only | MEDIUM |
| No automatic task creation from critical signals | "Owner mentioned competing offer" should create urgent task | HIGH |

---

### WORKFLOW 20: Searching Across All Deal Activity
**Description:** I want to search "What did we discuss about pricing with ABC Corp?" across all channels.

**Current State:** No cross-channel search exists.

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| No unified search across transcripts, emails, calls, notes | Must manually check each source | **CRITICAL** |
| No AI-powered "ask about this deal" feature on the deal page | Can't get instant answers about deal history | HIGH |
| Fireflies search exists but only searches Fireflies, not local data | Partial coverage only | MEDIUM |

---

## 5. Workflows 21-30: Call & Meeting Integration

### WORKFLOW 21: Launching a PhoneBurner Dial Session for a Deal
**Description:** I want to call all the buyer contacts for a specific deal.

**Current Steps:**
1. Go to Buyer Outreach tab on deal
2. Select contacts → click "Launch"
3. `phoneburner-push-contacts` creates dial session with deal context (revenue, EBITDA, services, geography) as custom fields
4. PhoneBurner opens in new tab
5. User dials through contacts
6. Webhooks capture call events in real-time

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| No pre-call brief shown (buyer context, last interaction, talking points) | Rep goes in cold | HIGH |
| No post-call prompt for notes/next steps | Relies on PhoneBurner disposition only | HIGH |
| Outreach profile form required before launching (friction) | Slows down the workflow | MEDIUM |
| No skip logic for recently contacted (configurable but not prominently shown) | May re-call someone contacted yesterday | MEDIUM |

---

### WORKFLOW 22: PhoneBurner Call → Automatic Activity Logging
**Description:** After each call, the system should automatically log the call and its outcome.

**Current Flow:**
1. PhoneBurner webhook fires → `phoneburner-webhook` processes
2. Writes to `contact_activities`: call_started_at, duration, disposition, transcript, recording
3. Writes to `phoneburner_webhooks_log`: raw payload

**What's NOT happening:**
- No write to `deal_activities`
- No write to `contact_call_history` (separate unified table)
- No auto-task creation from call disposition
- No notification to deal owner

**Gaps:** See Workflow 12 gaps.

---

### WORKFLOW 23: Syncing Fireflies Transcripts to a Deal
**Description:** A meeting happened. I want to link its transcript to the deal.

**Current Steps:**
1. Go to Fireflies Integration page
2. Click "Auto-Pair Transcripts" or "Bulk Sync"
3. System queries Fireflies API by participant emails + company name
4. Matches stored in `deal_transcripts` with match_type (email/name_fuzzy)
5. Or: manually search and link via transcript dialog on deal page

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| Auto-pairing only runs on manual trigger (no continuous sync for non-standup meetings) | Transcripts pile up unlinked | **CRITICAL** |
| No notification "New transcript available for Deal X" | Must proactively check | HIGH |
| Fuzzy name matching can create false positives | Wrong transcript linked to deal | MEDIUM |
| No inline transcript viewer on deal page (link to Fireflies only) | Must leave the platform to read the transcript | HIGH |
| Content fetch is on-demand (not pre-loaded) — `fetch-fireflies-content` needed | Slow when trying to read transcript | MEDIUM |

---

### WORKFLOW 24: Extracting Action Items from a Non-Standup Meeting
**Description:** A buyer call happened (not a daily standup). I want tasks extracted from it.

**Current State:** **NOT SUPPORTED.** Task extraction (`extract-standup-tasks`) only processes `<ds>`-tagged standup meetings. There is no way to extract tasks from buyer calls, seller meetings, or any other non-standup meeting.

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| Task extraction only works for `<ds>`-tagged standup meetings | Buyer/seller call action items must be manually created | **CRITICAL** |
| No "extract tasks from this transcript" button on deal page | Missing automation for the most common meeting type | **CRITICAL** |
| No AI summary generation for non-standup meetings | Must read entire transcript | HIGH |

---

### WORKFLOW 25: Call Scoring & Quality Analysis
**Description:** AI scores call quality for coaching and performance management.

**Current State:**
- `call_scores` table exists with comprehensive scoring fields
- Fields: composite_score, opener_tone, call_structure, discovery_quality, objection_handling, closing_next_step, value_proposition, ai_summary
- Edge function for scoring exists

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| No frontend UI for call scores (table exists but no component renders it) | Feature is backend-only | HIGH |
| No automatic scoring trigger after call completion | Must be manually triggered | HIGH |
| No coaching recommendations based on scores | Scores exist but no actionable guidance | MEDIUM |
| No trend tracking (is this rep improving?) | Point-in-time only | MEDIUM |

---

### WORKFLOW 26: Objection Tracking from Calls
**Description:** AI extracts buyer objections from call transcripts for playbook building.

**Current State:**
- `extract-objections-from-transcript` edge function exists
- `objection_categories`, `objection_instances`, `objection_playbook` tables exist
- Objections extracted with category, verbatim quote

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| No UI showing objections on the deal page | Feature is backend-only | HIGH |
| No playbook suggestions shown during pre-call prep | Objections tracked but not used proactively | HIGH |
| No objection frequency dashboard (which objections are most common?) | Can't prioritize playbook development | MEDIUM |

---

### WORKFLOW 27: Recording & Transcript Access
**Description:** I want to listen to a call recording or read a transcript from the deal page.

**Current Steps:**
1. Deal → Call Activity tab → expand a call → see recording_url link
2. Click link → opens PhoneBurner recording (public URL)
3. Transcript text shown inline (if available from PhoneBurner)
4. Fireflies transcripts: link to Fireflies platform (external)

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| No embedded audio player (redirects to external URL) | Leaves the platform | MEDIUM |
| Fireflies transcripts not viewable inline | Must go to Fireflies website | HIGH |
| No searchable transcript text within the platform | Can't find specific discussion points | HIGH |
| No transcript highlights (AI-identified key moments) | Must read/listen to entire recording | HIGH |

---

### WORKFLOW 28: SmartLead Email Campaign → Deal Activity
**Description:** An email campaign was sent to buyers for a deal. Replies and engagement should show on the deal.

**Current Flow:**
1. Campaign created via `push-buyer-to-smartlead`
2. SmartLead sends emails
3. Replies processed by `smartlead-inbox-webhook` → classified by Gemini (interested, not_interested, meeting_request, etc.)
4. Stored in `smartlead_reply_inbox`
5. Positive replies can auto-create listings

**What the deal page shows:**
- Contact History tab shows email events per contact
- Buyer Outreach tab shows outreach status

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| Email events don't write to `deal_activities` | Deal timeline doesn't show email activity | HIGH |
| No "campaign results summary" on deal page | Must check SmartLead separately | HIGH |
| No auto-task creation when a buyer replies "interested" | Must manually create follow-up task | **CRITICAL** |
| AI-classified replies (meeting_request, interested) don't auto-advance buyer outreach status | Status must be manually updated | HIGH |

---

### WORKFLOW 29: HeyReach LinkedIn Campaign → Deal Activity
**Description:** A LinkedIn campaign was sent to buyers. Engagement should show on the deal.

**Current Flow:**
1. Campaign created via `push-buyer-to-heyreach`
2. HeyReach sends connection requests / messages
3. Responses come via `heyreach-webhook`
4. Stored in `heyreach_webhook_events`

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| Same gaps as email (no `deal_activities` write, no auto-task creation) | Deal timeline blind to LinkedIn activity | HIGH |
| LinkedIn events not surfaced on deal overview | Must navigate to Contact History tab | HIGH |
| No "connection accepted" → auto-advance buyer status | Manual update required | MEDIUM |

---

### WORKFLOW 30: Unified Communication Timeline for a Contact
**Description:** I want to see everything that happened with a specific contact across all channels.

**Current State:**
- `ContactActivityTimeline.tsx` merges data from 3 tables:
  - `contact_email_history` (SmartLead)
  - `contact_call_history` (PhoneBurner)
  - `contact_linkedin_history` (HeyReach)
- Displayed on Deal Contact History tab

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| No meeting notes in the timeline (Fireflies transcripts not included) | Meetings are invisible in contact history | **CRITICAL** |
| No manual notes/interactions in the timeline | If someone had an in-person conversation, can't log it | HIGH |
| No task completions in the timeline | "Followed up with buyer" task completion not visible | HIGH |
| Timeline only visible on deal detail, not on buyer/contact pages consistently | Fragmented access | MEDIUM |
| No "last touched" calculation across all channels | Can't easily find contacts going cold | HIGH |

---

## 6. Workflows 31-40: Follow-ups, Automation & AI

### WORKFLOW 31: Automatic Follow-up Scheduling
**Description:** After a call or meeting, the system should automatically schedule a follow-up.

**Current State:**
- `rm_deal_cadence` table exists for cadence scheduling
- `outreach_records` has `next_action` and `next_action_date` fields
- No automatic follow-up creation based on call/meeting outcomes

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| No auto-follow-up task creation after a call (based on disposition) | "Callback scheduled" disposition doesn't create a task | **CRITICAL** |
| No auto-follow-up after meeting (based on AI-extracted next steps) | Next steps from meetings are lost | **CRITICAL** |
| No cadence enforcement (e.g., "if no contact in 7 days, create follow-up task") | Deals go cold without anyone noticing | **CRITICAL** |
| `rm_deal_cadence` table exists but no frontend or edge function uses it | Dead feature | HIGH |
| No "stale deal" alerts | Deals can sit untouched for weeks | HIGH |

---

### WORKFLOW 32: NDA/Fee Agreement Workflow Automation
**Description:** NDA sent → signed → fee agreement sent → signed. Each step should trigger the next.

**Current State:**
- PandaDoc integration for e-signatures
- `pandadoc_webhook_log` captures signature events
- `firm_agreements` tracks NDA and fee agreement status
- `send-nda-reminder` and `send-fee-agreement-reminder` edge functions exist

**Known Bugs (from prior audit):**
- UNIQUE constraint on `pandadoc_webhook_log(document_id, event_type)` with hardcoded `document_id = 'reminder'` — **only first firm gets reminder, rest silently fail**
- Reminder status filter checks for `'pending'` status that may never be set

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| NDA signed does NOT auto-advance deal stage | Must manually update stage | **CRITICAL** |
| NDA signed does NOT auto-send fee agreement | Must manually trigger next step | **CRITICAL** |
| No enforcement that NDA must be signed before fee agreement | Can send fee agreement without NDA | HIGH |
| Reminder system broken (UNIQUE constraint bug) | Only first firm gets reminders | **CRITICAL** |
| No expiration tracking for legal documents | Stale NDAs not flagged | MEDIUM |
| No `deal_activities` entry when NDA/fee agreement status changes | Deal timeline doesn't show legal milestones | HIGH |

---

### WORKFLOW 33: AI-Powered Deal Summary on Demand
**Description:** I want an instant AI summary of everything that's happened on a deal.

**Current State:**
- AI Command Center exists with 50+ tools
- `generate-call-summary` edge function exists
- `generate-lead-memo` generates deal memos
- No "summarize this deal's activity" tool

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| No "Summarize this deal" button on deal page | Must use AI Command Center with manual prompting | HIGH |
| No auto-generated deal brief that updates as activity happens | Static memos only | HIGH |
| AI Command Center can query deals but can't aggregate cross-channel activity | Doesn't have unified activity data to summarize | **CRITICAL** |

---

### WORKFLOW 34: Daily Digest / Morning Brief
**Description:** Every morning, each team member should get a brief: their tasks for today, deals that need attention, stale follow-ups, and meeting summaries from yesterday.

**Current State:**
- `admin-digest` edge function exists
- `send-task-notification-email` exists
- No daily morning brief implemented

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| No daily morning email with: today's tasks, overdue items, stale deals, yesterday's meeting summaries | Team starts day without context | **CRITICAL** |
| No "end of day" summary email: what was accomplished, what's still open | No accountability checkpoint | HIGH |
| `admin-digest` exists but scope/content is unclear and may not cover tasks | Partial implementation | MEDIUM |

---

### WORKFLOW 35: Buyer Response → Automatic Deal Update
**Description:** A buyer responds positively to outreach. The deal should auto-update: buyer status, create follow-up task, notify deal owner.

**Current Flow:**
1. SmartLead reply → `smartlead-inbox-webhook` → Gemini classifies sentiment
2. Classification stored in `smartlead_reply_inbox`
3. Positive replies can auto-create listings (GP partner deals)

**What should also happen:**
- Buyer outreach status should auto-advance to "interested"
- Follow-up task should be auto-created: "Schedule call with interested buyer X"
- Deal owner should be notified
- `deal_activities` should log "Buyer X responded positively"

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| AI classification doesn't trigger buyer status update | Must manually update | HIGH |
| No auto-task from positive reply | Must manually create follow-up | **CRITICAL** |
| No deal owner notification on positive response | Delayed response to warm leads | **CRITICAL** |
| No `deal_activities` entry | Deal page blind to email responses | HIGH |

---

### WORKFLOW 36: Stale Deal / Inactive Buyer Detection
**Description:** Automatically identify deals and buyers that have gone cold.

**Current State:** No stale detection system exists.

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| No "last activity" calculation across all channels per deal | Can't identify stale deals | **CRITICAL** |
| No configurable staleness threshold (e.g., 7 days no activity = warning) | No early warning system | HIGH |
| No auto-task creation for stale deals ("Re-engage with ABC Corp") | Deals go cold permanently | HIGH |
| No dashboard widget showing stale deals ranked by days inactive | Must manually check each deal | HIGH |

---

### WORKFLOW 37: Bulk Task Operations
**Description:** After daily meeting, I want to approve/reassign/snooze multiple tasks at once.

**Current State:**
- "Approve All" button exists for pending tasks
- No other bulk operations

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| No bulk reassign (select 5 tasks → reassign to different person) | Must reassign one by one | HIGH |
| No bulk snooze | Must snooze one by one | MEDIUM |
| No bulk complete | Must complete one by one | MEDIUM |
| No bulk tag/categorize | Must tag one by one | LOW |

---

### WORKFLOW 38: Task Escalation & Accountability
**Description:** Tasks that are overdue should escalate automatically.

**Current State:** Tasks change to `overdue` status based on due_date, but no escalation mechanism exists.

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| No notification when a task becomes overdue | Assignee may not realize | **CRITICAL** |
| No escalation to manager after X days overdue | No accountability mechanism | HIGH |
| No overdue task summary to leadership | Must manually check analytics | HIGH |
| No consequences tracking (how many times has this person been overdue?) | No pattern detection | MEDIUM |

---

### WORKFLOW 39: Cross-Deal Task View (My Workload)
**Description:** I want to see all my tasks across ALL deals in one place, prioritized.

**Current State:**
- Daily Task Dashboard shows "My Tasks" across all deals
- Tasks have priority_score and priority_rank
- Can filter by entity type, tags

**Gaps:**
| Gap | Impact | Severity |
|-----|--------|----------|
| No calendar view of tasks (when is what due) | Only list view available | HIGH |
| No workload balancing (can I take on more? am I overloaded?) | No capacity visibility | MEDIUM |
| No "focus mode" (hide everything except today's top 3 tasks) | Dashboard can be overwhelming | LOW |
| Tasks from different sources (standup, manual, auto-generated) not visually distinguished | Can't tell AI tasks from human tasks at a glance | MEDIUM |

---

### WORKFLOW 40: End-to-End Deal Lifecycle Automation
**Description:** From first contact to close, every stage transition should trigger the right actions automatically.

**Ideal Automated Flow:**
```
1. Deal Created → Auto-create "Build buyer universe" task
2. Buyer Universe Built → Auto-create "Launch outreach" task
3. Buyer Responds Positively → Auto-advance buyer status, create "Schedule call" task
4. Call Completed → Auto-log on deal, extract next steps, create follow-up task
5. Meeting Held → Auto-sync transcript, extract action items, update deal enrichment
6. Buyer Interested → Auto-create "Send NDA" task, advance stage
7. NDA Signed → Auto-advance stage, auto-send fee agreement
8. Fee Agreement Signed → Auto-advance stage, auto-create "Send CIM" task
9. CIM Sent → Auto-create "Follow up in 5 days" task
10. IOI Received → Auto-advance stage, notify deal team
11. LOI Submitted → Auto-advance stage, create DD checklist tasks
12. Closed Won/Lost → Auto-close all open tasks, send summary report
```

**What's actually automated:** Almost none of this. Steps 1-12 are all manual.

**Severity: CRITICAL** — This is the fundamental automation gap.

---

## 7. Gap Summary Matrix

### By Severity

| Severity | Count | Key Theme |
|----------|-------|-----------|
| **CRITICAL** | 28 | Unified deal timeline, auto-task creation, activity logging, notifications |
| **HIGH** | 38 | Missing automations, fragmented data, dead features |
| **MEDIUM** | 22 | UI improvements, analytics, secondary features |
| **LOW** | 5 | Nice-to-haves |

### Top 10 Most Impactful Gaps

| # | Gap | Workflows Affected | Fix Complexity |
|---|-----|-------------------|----------------|
| 1 | **`deal_activities` never written to** — the table exists but no backend writes to it | 8, 11, 12, 13, 15, 22, 28, 29, 30, 32 | MEDIUM — add writes to existing webhooks/mutations |
| 2 | **No unified deal activity timeline on deal page** | 11, 20, 30 | MEDIUM — aggregate query + new component |
| 3 | **No auto-task creation from call dispositions** | 12, 22, 31, 40 | MEDIUM — add logic to phoneburner-webhook |
| 4 | **No auto-task creation from meeting action items (non-standup)** | 13, 24, 31, 40 | MEDIUM — extend extract-standup-tasks to handle any meeting |
| 5 | **No notifications for task approval/assignment/overdue** | 2, 3, 4, 38 | LOW — send-task-notification-email exists, just not triggered |
| 6 | **No auto-stage advancement on NDA/fee agreement signed** | 14, 32, 40 | LOW — add trigger to PandaDoc webhook handler |
| 7 | **No daily morning brief email** | 34 | MEDIUM — compose digest from tasks + activity + meetings |
| 8 | **No auto-follow-up from positive buyer response** | 28, 35, 40 | MEDIUM — add logic to smartlead-inbox-webhook |
| 9 | **No stale deal detection** | 36, 40 | MEDIUM — scheduled query + notification |
| 10 | **No meeting summary on deal overview** | 11, 13, 27 | LOW — extract summary from existing transcripts |

---

## 8. Recommended Solutions (Prioritized)

### PHASE 1: Fix the Foundation (Week 1-2)
*Goal: Make `deal_activities` the single source of truth for "what happened on this deal"*

#### Solution 1.1: Populate `deal_activities` from ALL Sources
**What:** Add `deal_activities` INSERT calls to every existing webhook and mutation that touches a deal.

**Where to add writes:**
| Source | Edge Function | Activity Type |
|--------|--------------|---------------|
| PhoneBurner call | `phoneburner-webhook` | `call_made` |
| Fireflies transcript linked | `sync-fireflies-transcripts` | `meeting_scheduled` |
| Task created | `extract-standup-tasks` + manual creation | `task_created` |
| Task completed | task completion mutation | `task_completed` |
| Note added | note mutation | `note_added` |
| Email sent (SmartLead) | `smartlead-webhook` | `email_sent` |
| Email reply received | `smartlead-inbox-webhook` | `email_received` |
| LinkedIn message | `heyreach-webhook` | `linkedin_message` |
| NDA sent/signed | PandaDoc webhook | `nda_sent` / `nda_signed` |
| Fee agreement sent/signed | PandaDoc webhook | `fee_agreement_sent` / `fee_agreement_signed` |
| Stage change | stage mutation | `stage_change` |
| Deal enriched | `enrich-deal` | `deal_enriched` |
| Buyer status change | outreach mutation | `buyer_status_change` |

**Estimated effort:** 2-3 days. Each is a 5-10 line INSERT added to existing functions.

#### Solution 1.2: Build Unified Deal Activity Timeline Component
**What:** New React component on deal overview that queries `deal_activities` + `contact_activities` + `contact_email_history` + `contact_call_history` + `contact_linkedin_history` and renders a single chronological feed.

**Where:** New tab or section at the top of deal detail page, replacing current fragmented approach.

**Estimated effort:** 2-3 days.

#### Solution 1.3: Add "Last Activity" and "Next Step" to Deal Header
**What:** Compute last_activity_at from `deal_activities` MAX(created_at) and display on deal header. Show next pending task as "Next Step."

**Estimated effort:** 1 day.

---

### PHASE 2: Automate Task Creation (Week 2-3)
*Goal: Tasks should appear automatically, not just from standup meetings*

#### Solution 2.1: Auto-Task from PhoneBurner Call Dispositions
**What:** In `phoneburner-webhook`, after logging the call, check disposition. If callback/follow-up indicated, auto-create a `daily_standup_tasks` entry.

**Disposition → Task mapping:**
| Disposition | Task Type | Due Date |
|-------------|-----------|----------|
| callback_scheduled | `schedule_call` | callback date from PhoneBurner |
| interested | `follow_up_with_buyer` | +2 days |
| send_info | `send_materials` | +1 day |
| voicemail | `follow_up_with_buyer` | +3 days |
| connected (no next step) | `follow_up_with_buyer` | +5 days |

**Estimated effort:** 1-2 days.

#### Solution 2.2: Extend Task Extraction to Any Meeting
**What:** Generalize `extract-standup-tasks` to accept any `deal_transcript` ID (not just `<ds>`-tagged standups). Add "Extract Tasks" button on deal transcript section.

**Estimated effort:** 2-3 days.

#### Solution 2.3: Auto-Task from Stage Entry
**What:** Define task templates per deal stage. When a deal enters a stage, auto-create the template tasks.

**Example templates:**
| Stage | Auto-Created Tasks |
|-------|--------------------|
| Qualified | "Build buyer universe", "Research company" |
| NDA Sent | "Follow up on NDA in 3 days" |
| NDA Signed | "Send fee agreement" |
| Fee Agreement Signed | "Send CIM to approved buyers" |
| Due Diligence | DD checklist (5-10 tasks) |

**Estimated effort:** 2-3 days.

#### Solution 2.4: Auto-Task from Positive Buyer Response
**What:** In `smartlead-inbox-webhook`, when AI classifies reply as `interested` or `meeting_request`, auto-create task "Follow up with [buyer] — [reply category]" assigned to deal owner.

**Estimated effort:** 1 day.

---

### PHASE 3: Notifications & Accountability (Week 3-4)
*Goal: Nobody should have to proactively check for updates*

#### Solution 3.1: Task Lifecycle Notifications
**What:** Trigger `send-task-notification-email` at key moments:
- Task approved → notify assignee
- Task overdue → notify assignee + manager
- Task completed → notify deal owner (if different from assignee)
- New tasks extracted from meeting → notify all assignees

**Estimated effort:** 2 days. Function exists, just needs triggers.

#### Solution 3.2: Daily Morning Brief Email
**What:** New cron job (7 AM local time) that sends each team member:
- Today's tasks (from daily_standup_tasks where due_date = today)
- Overdue tasks
- Deals with no activity in 7+ days
- Yesterday's meeting summaries (from standup_meetings)
- Buyer responses that need attention

**Estimated effort:** 3-4 days.

#### Solution 3.3: Overdue Task Escalation
**What:** Cron job that checks for tasks overdue by 2+ days. Creates notification for the assignee's manager. After 5+ days, marks as "escalated" and notifies leadership.

**Estimated effort:** 1-2 days.

#### Solution 3.4: Deal Staleness Alerts
**What:** Cron job that computes last_activity_at per deal. If > 7 days, creates "Re-engage" task for deal owner. If > 14 days, notifies leadership.

**Estimated effort:** 1-2 days.

---

### PHASE 4: Stage Automation & Legal Workflow (Week 4-5)
*Goal: Deal stages advance automatically based on real events*

#### Solution 4.1: Auto-Advance Stages on Legal Milestones
**What:** In PandaDoc webhook handler, when NDA signed → advance to "NDA Signed" stage. When fee agreement signed → advance to "Fee Agreement Signed" stage.

**Estimated effort:** 1 day.

#### Solution 4.2: Stage Validation Rules
**What:** Before allowing stage advancement, check prerequisites:
- Can't enter "NDA Signed" without NDA actually signed
- Can't enter "Fee Agreement Signed" without fee agreement signed
- Can't enter "Due Diligence" without both NDA + fee agreement signed

**Estimated effort:** 1-2 days.

#### Solution 4.3: Fix NDA/Fee Agreement Reminder Bug
**What:** Fix the UNIQUE constraint on `pandadoc_webhook_log` that causes only the first firm to get reminders. Change `document_id = 'reminder'` to use a unique value per firm.

**Estimated effort:** 0.5 days.

---

### PHASE 5: Meeting & Call Intelligence (Week 5-6)
*Goal: Meetings and calls should be self-documenting*

#### Solution 5.1: Auto-Sync All Fireflies Meetings (Not Just Standups)
**What:** Extend the cron job that runs at 12 PM and 5 PM to also auto-pair ALL recent Fireflies transcripts to deals (not just `<ds>`-tagged ones). Use existing `auto-pair-all-fireflies` logic on a schedule.

**Estimated effort:** 1 day.

#### Solution 5.2: AI Meeting Summary on Deal Page
**What:** When a transcript is linked to a deal, auto-generate a summary using Gemini: topics discussed, decisions made, next steps, action items. Store in `deal_transcripts.extracted_data` and display on deal overview.

**Estimated effort:** 2-3 days.

#### Solution 5.3: Inline Transcript Viewer
**What:** Instead of linking to Fireflies, fetch and display transcript content inline on the deal page. Use `fetch-fireflies-content` to pre-load sentences.

**Estimated effort:** 2-3 days.

#### Solution 5.4: Call Score Dashboard
**What:** Surface `call_scores` data on rep profiles and deal pages. Show composite score, strengths/weaknesses, AI coaching suggestions.

**Estimated effort:** 2-3 days.

#### Solution 5.5: Integrate Fireflies MCP for Real-Time Data
**What:** Use the Fireflies MCP server (already connected) to pull transcripts, summaries, and soundbites directly. Build automated flows:
- `fireflies_get_transcript` → extract summary → push to deal
- `fireflies_get_summary` → display on deal overview
- `fireflies_search` → find all meetings related to a deal/buyer

**Estimated effort:** 2-3 days.

---

### PHASE 6: Advanced Automation (Week 6-8)
*Goal: The system should run itself for routine operations*

#### Solution 6.1: Recurring Tasks
**What:** Add `recurrence_rule` field to `daily_standup_tasks` (e.g., "every 2 weeks"). When a recurring task is completed, auto-create the next instance.

**Estimated effort:** 2-3 days.

#### Solution 6.2: Task Templates Library
**What:** Predefined task sequences for common workflows (NDA process, buyer outreach, DD checklist). One-click to create all tasks for a workflow.

**Estimated effort:** 2-3 days.

#### Solution 6.3: Smart Follow-up Cadence
**What:** Based on buyer type and deal stage, automatically schedule follow-up tasks at optimal intervals. Use `rm_deal_cadence` table (currently unused).

**Estimated effort:** 3-4 days.

#### Solution 6.4: AI Deal Health Score
**What:** Compute a real-time "deal health" score based on: activity recency, task completion rate, buyer engagement, stage velocity. Display on deal header and dashboard.

**Estimated effort:** 3-4 days.

#### Solution 6.5: Cross-Channel Search
**What:** Unified search across all deal activity: transcripts, emails, calls, notes, tasks. Full-text search with AI-powered natural language queries ("What did we discuss about pricing with ABC Corp?").

**Estimated effort:** 5-7 days.

---

## Summary: Implementation Priority

| Phase | Weeks | Effort | Impact |
|-------|-------|--------|--------|
| **Phase 1:** Fix deal_activities + unified timeline | 1-2 | 5-7 days | Solves "I don't know what happened on this deal" |
| **Phase 2:** Auto-task creation | 2-3 | 6-9 days | Eliminates manual task entry for 80% of cases |
| **Phase 3:** Notifications & accountability | 3-4 | 7-10 days | Nobody misses tasks or updates |
| **Phase 4:** Stage automation & legal fixes | 4-5 | 3-4 days | Deals advance automatically |
| **Phase 5:** Meeting & call intelligence | 5-6 | 10-14 days | Meetings become self-documenting |
| **Phase 6:** Advanced automation | 6-8 | 13-18 days | Platform runs itself for routine ops |

**Total estimated effort: 6-8 weeks for full implementation.**

**Quick wins (< 1 day each):**
1. Fix NDA reminder UNIQUE constraint bug
2. Add `deal_activities` INSERT to `phoneburner-webhook`
3. Add task approved notification trigger
4. Add "Last Activity" display to deal header
5. Auto-advance stage on NDA signed (PandaDoc webhook)

---

*Audit completed 2026-04-07. This document should be reviewed alongside the existing PLATFORM_WORKFLOW_AUDIT_2026-03-22.md and CORE_SYSTEMS_AUDIT_2026-03-14.md for full context.*
