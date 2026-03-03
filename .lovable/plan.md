

## Fix: "Assigned To" Dropdown Shows No Team Members

### Root Cause

The "Assigned To" dropdown in task creation/reassignment is empty because it queries the `user_roles` table directly, which has Row-Level Security (RLS) policies that restrict visibility:

- **Owners and admins** can see all rows -- dropdown works for them
- **Moderators (team members)** can only see their own row -- dropdown shows only themselves or nothing
- **Some pages** don't pass `teamMembers` at all (e.g., Deal Detail page), so the dropdown is always empty regardless of role

### Fix

Replace the `user_roles`-based team member query with a shared hook that uses a **security definer RPC** (bypasses RLS) to return the internal team list. This ensures all internal users can see the full team in every task dialog.

### Changes

**1. Create a database RPC function (security definer)**

Create `get_internal_team_members()` that returns user_id, first_name, last_name, email, and role for all internal team members (owner/admin/moderator). Since it uses `security definer`, any authenticated user can call it without RLS restrictions on `user_roles`.

**2. Create shared hook: `src/hooks/use-team-members.ts`**

A single reusable hook that calls the new RPC and returns `{ id, name, email, role }[]`. This replaces the inline `user_roles` query currently duplicated in `CreateTaskButton`, `TeamMemberRegistry`, and passed as props through `EntityTasksTab`.

**3. Update `CreateTaskButton.tsx`**

Replace the inline `useQuery` for team members with the new `useTeamMembers()` hook.

**4. Update `EntityTasksTab.tsx`**

Remove the `teamMembers` prop dependency. Instead, have the component use `useTeamMembers()` internally, so it always has the team list regardless of what the parent passes.

**5. Update `EntityAddTaskDialog.tsx`**

Use `useTeamMembers()` hook internally instead of relying on the `teamMembers` prop (keep prop as optional override for backward compatibility).

**6. Update `ReassignDialog.tsx`**

Same pattern -- use `useTeamMembers()` hook internally.

**7. Update `AddTaskDialog.tsx`**

Same pattern -- use hook internally instead of requiring prop.

### Technical Details

```text
Database function:
  get_internal_team_members() -> table(user_id uuid, first_name text, last_name text, email text, role text)
  SECURITY DEFINER, accessible to authenticated users

Hook: useTeamMembers()
  Calls supabase.rpc('get_internal_team_members')
  Returns: { id: string; name: string; email: string; role: string }[]
  Stale time: 60s (matches current pattern)
```

### Files to Create/Modify

| File | Action |
|------|--------|
| SQL migration (via Supabase) | Create `get_internal_team_members()` RPC |
| `src/hooks/use-team-members.ts` | Create shared hook |
| `src/components/daily-tasks/CreateTaskButton.tsx` | Use new hook |
| `src/components/daily-tasks/EntityTasksTab.tsx` | Use hook internally, make prop optional |
| `src/components/daily-tasks/EntityAddTaskDialog.tsx` | Use hook internally |
| `src/components/daily-tasks/ReassignDialog.tsx` | Use hook internally |
| `src/components/daily-tasks/AddTaskDialog.tsx` | Use hook internally |

