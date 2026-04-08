# Task, Daily Standup & Document Tracking System

## Overview

The platform has three interconnected tracking systems that power the M&A advisory team's daily operations:

1. **Daily Task Dashboard** — Central hub for managing all tasks across deals, buyers, and operations
2. **Standup Tracker** — Automatic meeting-to-task pipeline powered by Fireflies + AI extraction
3. **Document Tracking** — NDA and Fee Agreement lifecycle tracking per buyer firm

All three are accessed from the admin sidebar under the Remarketing section.

---

## 1. Daily Task Dashboard

**Route:** `/admin/daily-tasks`

### Page Layout

The dashboard has two top-level tabs:

- **Tasks** — The primary task management view
- **Standups** — Embedded standup meeting history (see Section 2)

### Task Types

Tasks are categorized by their M&A workflow function:

| Type | Label | Use Case |
|------|-------|----------|
| `contact_owner` | Contact Owner | Reach out to a deal's seller/owner |
| `build_buyer_universe` | Build Buyer Universe | Research and compile potential buyers |
| `follow_up_with_buyer` | Follow Up with Buyer | Check in with an interested buyer |
| `send_materials` | Send Materials | Share CIM, teaser, financials |
| `schedule_call` | Schedule Call | Set up management presentations, intro calls |
| `nda_execution` | NDA Execution | Send/track NDA signing |
| `ioi_loi_process` | IOI/LOI Process | Track offers and letters of intent |
| `due_diligence` | Due Diligence | Manage DD checklist items |
| `buyer_qualification` | Buyer Qualification | Vet a buyer's fit and capability |
| `seller_relationship` | Seller Relationship | Maintain seller engagement |
| `buyer_ic_followup` | Buyer IC Follow-up | Track buyer investment committee process |
| `call` | Call | Generic call task |
| `email` | Email | Generic email task |
| `find_buyers` | Find Buyers | Search for new potential buyers |
| `contact_buyers` | Contact Buyers | Outreach to identified buyers |
| `other` | Other | Catch-all |

### Task Statuses

| Status | Label | Description |
|--------|-------|-------------|
| `pending_approval` | Awaiting Approval | AI-generated tasks awaiting leadership review |
| `pending` | Pending | Approved and ready to work on |
| `in_progress` | In Progress | Actively being worked on |
| `completed` | Completed | Done |
| `overdue` | Overdue | Past due date (set automatically by cron) |
| `snoozed` | Snoozed | Deferred to a future date |
| `cancelled` | Cancelled | Dismissed or no longer relevant |
| `listing_closed` | Listing Closed | Auto-closed when deal closes |

### Task Priority System

Each task has a `priority` field (`high` / `medium` / `low`) and a computed `priority_score` (0-100) that factors in:

- **Task type weight** — e.g., `contact_owner` = 90, `update_pipeline` = 30
- **Deal stage weight** — tasks on deals further in the process score higher (e.g., LOI Submitted = 90, Sourced = 20)

### Task Categories

Tasks are bucketed into three categories:

- **`deal_task`** — Directly linked to a specific deal in the pipeline
- **`platform_task`** — System/marketplace maintenance tasks
- **`operations_task`** — Internal operational tasks

### Views & Filters

- **My Tasks / All Tasks** toggle — Personal view vs. full team view
- **Entity filter** — Filter by `all`, `deal`, or `buyer`
- **Tag filter** — Free-form tags applied to tasks
- **Meeting filter** — Filter to tasks extracted from a specific standup meeting
- **Show completed** toggle
- **List / Calendar** toggle — Switch between list view and month-view calendar

### Task Sections (List View)

Tasks are displayed in grouped sections:

1. **Pending Approval** (leadership-only) — AI-generated tasks needing human review. Leadership can approve individually or in bulk.
2. **Today** — Tasks due today or overdue, grouped by assignee
3. **Upcoming** — Tasks due after today, grouped by assignee
4. **Snoozed** — Tasks deferred to a future date
5. **Completed** — (shown when toggled on)

### Calendar View

A month-view calendar with:
- Priority-colored dots on each day that has tasks
- Click to expand a popover showing task titles and statuses for that day

### Team Workload Card

Horizontal bar chart showing open task count per team member, with colored segments for high/medium/low priority breakdown. Helps managers identify overloaded team members.

### Stale Deals Widget

Shows deals with no activity in 7+ days, with deal name, current stage, and last activity date. Alerts the team to deals that need attention.

### Auto-Generated Tasks Widget

Summary of system-created tasks broken down by generation source:
- `call_disposition` — Created after a call is logged
- `email_reply` — Created when a buyer responds to email
- `stage_entry` — Created when a deal enters a specific pipeline stage
- `stale_deal` — Created by the stale deal detector
- `recurrence` — Created when a recurring task's previous instance is completed
- `meeting_extraction` — Extracted from standup meeting transcripts
- `template` — Created from a task template

### Task Actions

Each task supports:
- **Complete / Uncomplete** — Toggle completion with optional notes
- **Edit** — Change title, description, type, priority, due date
- **Reassign** — Move to a different team member (triggers notification)
- **Pin** — Pin to top with a reason
- **Snooze** — Defer with presets (tomorrow, 3 days, 1 week, 2 weeks, 1 month)
- **Delete** — Permanent removal (with confirmation dialog)
- **Approve** — (leadership-only) Approve AI-generated pending tasks
- **Dismiss** — (leadership-only) Reject/cancel AI-generated tasks

### Entity Tasks Tab

A reusable `<EntityTasksTab>` component can be embedded on any deal, buyer, or listing detail page. It shows tasks linked to that specific entity and supports all the same actions (add, edit, snooze, complete, delete, template application).

### Task Dependencies

Tasks can reference a `depends_on` field pointing to another task. The `TaskDependencyView` component renders a visual dependency chain for a deal, showing blocked tasks (where the parent task is not yet completed).

### Task Templates

Pre-built checklists that can be applied to a deal to bulk-create tasks:

**Deal Process Templates:**
1. Intake & Qualification (4 tasks)
2. Build Buyer Universe (3 tasks)
3. NDA Phase (3 tasks)
4. Deal Memo Phase (3 tasks)
5. IOI & Presentations (4 tasks)
6. LOI & Diligence (4 tasks)

**Buyer Engagement Templates:**
1. Initial Outreach (3 tasks)
2. NDA & CIM Phase (4 tasks)
3. Management Presentation (4 tasks)
4. Buyer IC Follow-up (3 tasks)

**Database-Stored Templates** (editable by admins):
- New Deal Intake
- Buyer Outreach Launch
- Due Diligence Checklist
- Post-Call Follow-up
- Interested Buyer Response

Templates are applied via the `TaskTemplateDialog` which lets you select a template, choose an assignee, and creates all tasks with offset due dates and dependency chains.

---

## 2. Standup Tracker

**Route:** `/admin/daily-tasks` (Standups tab)  
**Standalone page:** `/admin/remarketing/standup-tracker`

### How Standup Meetings Get Into the System

The standup tracker is powered by **Fireflies.ai** meeting transcription:

1. **Webhook path (real-time):** When a Fireflies meeting finishes processing, it sends a webhook to `process-standup-webhook`. Only meetings with `<ds>` in the title are processed — all others are acknowledged but skipped.

2. **Polling path (safety net):** The `sync-standup-meetings` edge function runs on a cron schedule, looking back 48 hours for unprocessed `<ds>`-tagged meetings in Fireflies. This catches any meetings the webhook missed.

3. **Manual sync:** Admins can click "Sync Meetings" in the dashboard header to trigger `sync-standup-meetings` on demand.

### The `<ds>` Tag Convention

To mark a meeting for standup processing, include `<ds>` anywhere in the meeting title in your calendar invite. The system checks for:
- `<ds>` (literal)
- `&lt;ds&gt;` (HTML-encoded)
- `%3cds%3e` (URL-encoded)

Non-`<ds>` meetings are completely ignored.

### AI Task Extraction

When a `<ds>` meeting is detected, the `extract-standup-tasks` edge function:

1. Fetches the full transcript from Fireflies API
2. Sends it to **Gemini AI** with an M&A-specific extraction prompt
3. AI identifies actionable tasks: calls to make, emails to send, documents to prepare, follow-ups needed
4. Each task is extracted with: title, description, assignee name, task type, category, due date, deal reference, confidence level
5. Tasks are matched to team members by name fuzzy-matching against the `internal_team` table
6. Tasks are matched to deals by fuzzy-matching `deal_reference` against `deal_pipeline` and `listings`
7. All extracted tasks start in `pending_approval` status (awaiting leadership review)

**Fallback mode:** If no Gemini API key is configured, the system falls back to parsing Fireflies' built-in `action_items` from the transcript summary.

### Meeting Data Stored

Each processed meeting creates a `standup_meetings` record with:
- Meeting title, date, duration
- Attendees list
- Summary and key points (AI-generated)
- Transcript URL (link back to Fireflies)
- Extraction metadata: tasks extracted count, unassigned count, confidence average

### Standup Tracker UI

The page displays:

1. **KPI cards:** Total standups, tasks assigned, completed, overdue
2. **Search:** Filter meetings by title, attendee, or task content
3. **Meeting cards** grouped by date, each showing:
   - Meeting title, date, duration, attendee count, task count
   - Completion progress bar (% of tasks completed)
   - Overdue count badge
   - Pending approval count badge
   - Expandable details with:
     - Meeting summary
     - Key points
     - Tasks grouped by assignee, each with status, type, deal reference, due date
     - Link to full transcript on Fireflies

---

## 3. Document Tracking

**Route:** `/admin/documents`

### What It Tracks

The Document Tracking page monitors the lifecycle of legal agreements (NDAs and Fee Agreements) for every buyer firm on the platform.

### Data Model

- **`firm_agreements`** — One record per buyer firm, tracking NDA and fee agreement status
- **`firm_members`** — Users belonging to each firm (with a primary contact)
- **`document_requests`** — Individual send/sign requests with delivery status
- **`agreement_audit_log`** — History of status changes with who made them

### Agreement Statuses

Each agreement (NDA and Fee Agreement independently) goes through:
- **Not started** — No action taken
- **Sent** — Document sent to the buyer
- **Signed** — Buyer has signed
- **Marked by admin** — Admin manually marked as complete (with admin name tracked)

### Firm Row Display

Each firm row shows:
- Company name and email domain
- Member count
- Primary contact name and email
- NDA status + timestamps (sent, signed, who signed)
- Fee Agreement status + timestamps
- Pending request indicator
- Document request history (expandable)

### Key Features

- **Status dropdowns** — Admins can change agreement status directly in the table
- **Member management** — View and remove firm members
- **Audit log** — View history of all status changes per firm
- **Orphan user detection** — Identifies users not associated with any firm
- **Document request tracking** — Shows email delivery status, errors, and provider message IDs

---

## 4. Automation & Background Jobs

### Cron-Triggered Automations

| Job | Schedule | Function |
|-----|----------|----------|
| Check overdue tasks | Hourly | `check-overdue-tasks` — Marks past-due tasks as `overdue`, wakes snoozed tasks, sends escalation notifications |
| Detect stale deals | Daily (9 AM ET) | `detect-stale-deals` — Finds deals with no activity past their cadence threshold, creates follow-up tasks |
| Sync standup meetings | Periodic | `sync-standup-meetings` — Polls Fireflies for unprocessed `<ds>` meetings |
| Send daily digest | Daily | `send-daily-digest` — Email summary of tasks due today |

### Database Triggers (Real-Time Automation)

| Trigger | Table | Action |
|---------|-------|--------|
| `trg_auto_create_stage_tasks` | `deal_pipeline` | When a deal's stage changes, auto-creates tasks from matching templates |
| `trg_auto_recur_completed_task` | `daily_standup_tasks` | When a recurring task is completed, creates the next instance |
| `trg_update_deal_last_activity` | `deal_activities` | Updates `deal_pipeline.last_activity_at` on new activity |
| `trg_log_deal_assignment_change` | `deal_pipeline` | Logs to `deal_activities` when deal ownership changes |

### Overdue Escalation Levels

The `check-overdue-tasks` function implements a 3-tier escalation:
- **Level 1:** Notify the assignee
- **Level 2:** Notify the manager
- **Level 3:** Notify leadership

### Task Notification Flow

When a task is assigned to someone:
1. An `admin_notifications` record is created (in-app notification bell)
2. An email is sent via `send-task-notification-email` edge function
3. Both include the task title, priority, due date, and a deep-link to the deal

---

## 5. Data Flow Summary

```
Calendar Meeting (with <ds> tag)
    |
    v
Fireflies Transcription
    |
    +---> Webhook (process-standup-webhook)
    |         |
    +---> Cron Poll (sync-standup-meetings)
              |
              v
    extract-standup-tasks (Gemini AI)
              |
              v
    standup_meetings + daily_standup_tasks
    (status: pending_approval)
              |
              v
    Leadership reviews in Daily Task Dashboard
              |
    +---------+---------+
    |                   |
    Approve          Dismiss
    (status: pending)  (status: cancelled)
    |
    v
    Team works tasks in My Tasks view
    |
    +---> Complete ---> (auto-recur if recurring)
    +---> Snooze   ---> (auto-wake via cron)
    +---> Overdue  ---> (auto-escalate via cron)
```

### Other Task Creation Paths

- **Manual creation** — Add Task dialog or Entity Tasks Tab
- **Template application** — Bulk-create from a template checklist
- **Stage change** — DB trigger auto-creates tasks from stage-matched templates
- **Stale deal detection** — Cron creates re-engagement tasks
- **Meeting extraction** — AI extracts from any meeting transcript (not just standups)

---

## 6. Key Tables

| Table | Purpose |
|-------|---------|
| `daily_standup_tasks` | All tasks (manual, AI-extracted, auto-generated) |
| `standup_meetings` | Processed meeting records from Fireflies |
| `rm_task_activity_log` | Audit trail of all task mutations |
| `task_templates` | Reusable task template definitions |
| `deal_activities` | Deal-level activity log (stages, tasks, calls, emails) |
| `deal_pipeline` | Deals with `last_activity_at` for stale detection |
| `firm_agreements` | NDA/Fee Agreement status per buyer firm |
| `firm_members` | Users associated with buyer firms |
| `document_requests` | Individual document send/sign requests |
| `agreement_audit_log` | Agreement status change history |
| `admin_notifications` | In-app notification records |

---

## 7. Permissions

- **All team members** can view and manage their own tasks ("My Tasks" view)
- **Leadership** (`owner` or `admin` team role) can:
  - View all team members' tasks ("All Tasks" view)
  - Approve or dismiss AI-generated pending tasks
  - Approve all pending tasks in bulk
- **Document tracking** is admin-only (accessible from admin sidebar)
- **Standup sync** can be triggered by any admin
