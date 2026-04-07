

# Operations Hub Tab for Admin Dashboard

## Summary
Add a new top-level dashboard view called **"Operations"** (alongside Daily Tasks, Remarketing, Marketplace) that consolidates all actionable items an admin needs to monitor: pending document signing requests, unread buyer messages, pending connection requests, data room access changes, and marketplace approvals -- all in one glance.

## Design

The tab will be a single-page "command center" with card-based sections, each showing a count badge and a compact list of the most recent actionable items. Clicking any item deep-links to the relevant detail page.

```text
┌─────────────────────────────────────────────────────┐
│  [Daily Tasks] [Remarketing] [Operations] [Marketplace]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─ Document Signing ──┐  ┌─ Unread Messages ─────┐│
│  │ 3 pending requests  │  │ 5 threads need reply  ││
│  │ • NDA - Firm A (2d) │  │ • John @ PE Fund (1h) ││
│  │ • Fee - Firm B (5h) │  │ • Sarah @ Cap (3h)    ││
│  │ [View All →]        │  │ [View All →]          ││
│  └─────────────────────┘  └───────────────────────┘│
│                                                     │
│  ┌─ Connection Requests ┐  ┌─ Marketplace Approvals┐│
│  │ 2 pending review     │  │ 1 pending approval   ││
│  │ • Adam → Deal X (1d) │  │ • Buyer C → Deal Y   ││
│  │ [View All →]         │  │ [View All →]          ││
│  └──────────────────────┘  └──────────────────────┘│
│                                                     │
│  ┌─ User Approvals ────┐  ┌─ Data Room Activity ──┐│
│  │ 1 pending user      │  │ Recent access grants  ││
│  │ • newuser@... (3h)  │  │ • Firm A → Deal X     ││
│  │ [View All →]        │  │ [View All →]           ││
│  └─────────────────────┘  └───────────────────────┘│
└─────────────────────────────────────────────────────┘
```

## Changes

| File | Change |
|------|--------|
| `src/components/admin/dashboard/OperationsHub.tsx` | **New file.** Single component with 6 cards: (1) Pending Document Signing Requests -- queries `document_requests` where status in ('requested','email_sent'), shows firm name, type, age. (2) Unread Messages -- uses `useMessageCenterThreads` to show threads with unread_count > 0. (3) Pending Connection Requests -- queries `connection_requests` where status='pending', joins listing title + profile name. (4) Marketplace Approvals -- queries `deal_data_room_access` pending approvals or reuses `usePendingApprovalCount`. (5) Pending User Approvals -- queries `profiles` where approval_status='pending'. (6) Recent Data Room Activity -- queries `data_room_audit_log` last 10 entries. Each card shows count badge, compact list (max 5 items), and a "View All" link to the full page. |
| `src/pages/admin/AdminDashboard.tsx` | Add "Operations" as a 4th top-level dashboard option (between Remarketing and Marketplace). Lazy-load `OperationsHub`. Add `Inbox` icon import. Wire `?view=operations` param. |

### Implementation Details

- Each card is independent with its own `useQuery` -- no shared loading state
- Cards use existing Supabase tables directly (no new tables/RPCs needed)
- Count badges use destructive variant when > 0, secondary when 0
- Items show relative time ("2h ago", "1d ago") using `formatDistanceToNow`
- "View All" links: Documents → `/admin/documents`, Messages → `/admin/marketplace/messages`, Connections → `/admin/marketplace/requests`, Users → `/admin/marketplace/users`, Approvals → `/admin/approvals`
- Empty state per card: subtle "All caught up" message
- Responsive: 2-column grid on desktop, single column on mobile
- No database migrations needed

