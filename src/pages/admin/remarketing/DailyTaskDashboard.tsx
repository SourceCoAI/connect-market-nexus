import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import {
  useDailyTasks,
  useDeleteTask,
  useApproveTask,
  useApproveAllTasks,
  DAILY_TASKS_QUERY_KEY,
} from '@/hooks/useDailyTasks';
import { useCancelTask } from '@/hooks/useTaskActions';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  ListChecks,
  Users,
  BarChart3,
  UserRound,
  ShieldCheck,
  XCircle,
  Tag,
  RefreshCcw,
  Loader2,
  PauseCircle,
  Mic,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn, getLocalDateString } from '@/lib/utils';
import { TaskCard } from '@/components/daily-tasks/TaskCard';
import { AddTaskDialog } from '@/components/daily-tasks/AddTaskDialog';
import { EditTaskDialog } from '@/components/daily-tasks/EditTaskDialog';
import { ReassignDialog } from '@/components/daily-tasks/ReassignDialog';
import { PinDialog } from '@/components/daily-tasks/PinDialog';
import { useExistingTags } from '@/hooks/useTaskTags';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { DailyStandupTaskWithRelations } from '@/types/daily-tasks';

// ─── Group tasks by assignee into separate sections ───
interface TaskGroup {
  assigneeId: string | null;
  assigneeName: string;
  tasks: DailyStandupTaskWithRelations[];
}

function groupByOwner(tasks: DailyStandupTaskWithRelations[]): TaskGroup[] {
  const groups = new Map<string, TaskGroup>();

  for (const task of tasks) {
    const key = task.assignee_id || '__unassigned__';
    if (!groups.has(key)) {
      const name = task.assignee
        ? `${task.assignee.first_name || ''} ${task.assignee.last_name || ''}`.trim() || 'Unknown'
        : 'Unassigned';
      groups.set(key, { assigneeId: task.assignee_id, assigneeName: name, tasks: [] });
    }
    groups.get(key)!.tasks.push(task);
  }

  // Sort: assigned first (alphabetical), unassigned last
  return Array.from(groups.values()).sort((a, b) => {
    if (!a.assigneeId) return 1;
    if (!b.assigneeId) return -1;
    return a.assigneeName.localeCompare(b.assigneeName);
  });
}

// ─── Person Card: renders one person's tasks inside a Card ───
function PersonTaskGroup({
  group,
  isLeadership,
  isPendingApproval,
  onEdit,
  onReassign,
  onPin,
  onDelete,
  onApprove,
  onDismiss,
}: {
  group: TaskGroup;
  isLeadership: boolean;
  isPendingApproval?: boolean;
  onEdit: (task: DailyStandupTaskWithRelations) => void;
  onReassign: (task: DailyStandupTaskWithRelations) => void;
  onPin: (task: DailyStandupTaskWithRelations) => void;
  onDelete: (task: DailyStandupTaskWithRelations) => void;
  onApprove?: (taskId: string) => void;
  onDismiss?: (taskId: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <UserRound className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-sm font-semibold">{group.assigneeName}</CardTitle>
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {group.tasks.length} {group.tasks.length === 1 ? 'task' : 'tasks'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-1 space-y-2">
        {group.tasks.map((task) => (
          <div key={task.id} className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <TaskCard
                task={task}
                isLeadership={isLeadership}
                onEdit={onEdit}
                onReassign={onReassign}
                onPin={onPin}
                onDelete={onDelete}
              />
            </div>
            {isPendingApproval && isLeadership && (
              <div className="flex gap-1 shrink-0 mt-2">
                {onApprove && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-green-700 border-green-300 hover:bg-green-50"
                    onClick={() => onApprove(task.id)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                )}
                {onDismiss && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => onDismiss(task.id)}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Dismiss
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const DailyTaskDashboard = () => {
  const { teamRole } = useAuth();
  const { toast } = useToast();
  const isLeadership = teamRole === 'owner' || teamRole === 'admin';

  const [view, setView] = useState<'my' | 'all'>('my');
  const [entityFilter, setEntityFilter] = useState<'all' | 'deal' | 'buyer'>('all');
  const [showCompleted, setShowCompleted] = useState(false);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [selectedMeeting, setSelectedMeeting] = useState<string | null>(null);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editTask, setEditTask] = useState<DailyStandupTaskWithRelations | null>(null);
  const [reassignTask, setReassignTask] = useState<DailyStandupTaskWithRelations | null>(null);
  const [pinTask, setPinTask] = useState<DailyStandupTaskWithRelations | null>(null);
  const [deleteTask, setDeleteTask] = useState<DailyStandupTaskWithRelations | null>(null);

  const queryClient = useQueryClient();
  const deleteTaskMutation = useDeleteTask();
  const approveTask = useApproveTask();
  const approveAll = useApproveAllTasks();
  const dismissTask = useCancelTask();
  const { data: allDistinctTags } = useExistingTags();

  // Sync meetings from Fireflies
  const syncMeetings = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-standup-meetings', {
        body: { lookback_hours: 168 },
      });
      if (error) throw error;
      return data as {
        newly_processed: number;
        transcripts_checked: number;
        already_processed?: number;
        failed?: number;
        results?: { title: string; success: boolean; error?: string }[];
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });
      const parts = [`Checked ${data.transcripts_checked} meetings`];
      if (data.already_processed) parts.push(`${data.already_processed} already processed`);
      if (data.newly_processed) parts.push(`${data.newly_processed} newly extracted`);
      else parts.push('no new meetings to process');
      if (data.failed) parts.push(`${data.failed} failed`);
      toast({
        title: 'Meetings synced',
        description: parts.join(', ') + '.',
        ...(data.failed ? { variant: 'destructive' as const } : {}),
      });
    },
    onError: (err) => {
      toast({
        title: 'Sync failed',
        description: err instanceof Error ? err.message : 'Could not sync meetings from Fireflies',
        variant: 'destructive',
      });
    },
  });

  const today = getLocalDateString();

  const {
    data: tasks,
    isLoading,
    error: tasksError,
  } = useDailyTasks({
    view,
    includeCompleted: showCompleted,
  });

  // Fetch team members for dialogs
  const { data: teamMembersRaw } = useQuery({
    queryKey: ['team-members-for-tasks'],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_roles')
        .select('user_id, profiles!inner(id, first_name, last_name)')
        .in('role', ['owner', 'admin', 'moderator']);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data || []).map((r: any) => ({
        // Use user_id directly from user_roles (matches auth.uid()) to ensure
        // consistent IDs with what useDailyTasks uses for the "My Tasks" filter.
        id: r.user_id,
        name: `${r.profiles.first_name || ''} ${r.profiles.last_name || ''}`.trim() || r.user_id,
      }));
    },
    staleTime: 300_000,
  });
  const teamMembers = teamMembersRaw || [];

  // Entity filter helper
  const matchesEntityFilter = useMemo(() => {
    if (entityFilter === 'all') return () => true;
    const dealTypes = new Set(['deal', 'listing']);
    const buyerTypes = new Set(['buyer', 'contact']);
    return (t: DailyStandupTaskWithRelations) => {
      const et = t.entity_type;
      if (entityFilter === 'deal') return !et || dealTypes.has(et);
      return buyerTypes.has(et);
    };
  }, [entityFilter]);

  // Distinct source meetings for the filter dropdown
  const distinctMeetings = useMemo(() => {
    if (!tasks) return [];
    const seen = new Map<string, string>();
    for (const t of tasks) {
      const sm = t.source_meeting;
      if (sm?.id && sm?.meeting_title && !seen.has(sm.id)) {
        seen.set(sm.id, sm.meeting_title);
      }
    }
    return Array.from(seen.entries())
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [tasks]);

  // Combined filter: entity + meeting
  const matchesAllFilters = useMemo(() => {
    return (t: DailyStandupTaskWithRelations) => {
      if (!matchesEntityFilter(t)) return false;
      if (selectedMeeting && t.source_meeting?.id !== selectedMeeting) return false;
      return true;
    };
  }, [matchesEntityFilter, selectedMeeting]);

  // Separate tasks by approval status
  const pendingApprovalTasks = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter((t) => t.status === 'pending_approval' && matchesAllFilters(t));
  }, [tasks, matchesAllFilters]);

  const approvedTasks = useMemo(() => {
    if (!tasks) return [];
    let filtered = tasks.filter((t) => t.status !== 'pending_approval' && matchesAllFilters(t));

    // Apply tag filter
    if (selectedTags.size > 0) {
      filtered = filtered.filter((t) => {
        const taskTags = (t as DailyStandupTaskWithRelations & { tags?: string[] }).tags;
        if (!taskTags || taskTags.length === 0) return false;
        return Array.from(selectedTags).some((tag) => taskTags.includes(tag));
      });
    }

    return filtered;
  }, [tasks, selectedTags, matchesAllFilters]);

  // Stats (only from approved tasks)
  const stats = useMemo(() => {
    if (!approvedTasks) return { total: 0, completed: 0, overdue: 0, pending: 0 };
    return {
      total: approvedTasks.length,
      completed: approvedTasks.filter((t) => t.status === 'completed').length,
      overdue: approvedTasks.filter((t) => t.status === 'overdue').length,
      pending: approvedTasks.filter((t) => t.status === 'pending').length,
    };
  }, [approvedTasks]);

  // Filter approved tasks into today/future/completed
  // Guard against null/missing due_date — treat as "today" so the task is always visible
  const todayTasks = useMemo(() => {
    return approvedTasks.filter(
      (t) =>
        t.status !== 'completed' &&
        ((t.due_date ?? '') <= today || !t.due_date || t.status === 'overdue'),
    );
  }, [approvedTasks, today]);

  const futureTasks = useMemo(() => {
    return approvedTasks.filter(
      (t) =>
        !!t.due_date && t.due_date > today && t.status !== 'overdue' && t.status !== 'completed',
    );
  }, [approvedTasks, today]);

  const completedTasks = useMemo(() => {
    return approvedTasks.filter((t) => t.status === 'completed');
  }, [approvedTasks]);

  const snoozedTasks = useMemo(() => {
    return approvedTasks.filter((t) => t.status === 'snoozed');
  }, [approvedTasks]);

  // Grouped views
  const pendingApprovalGroups = useMemo(
    () => groupByOwner(pendingApprovalTasks),
    [pendingApprovalTasks],
  );
  const todayGroups = useMemo(() => groupByOwner(todayTasks), [todayTasks]);
  const futureGroups = useMemo(() => groupByOwner(futureTasks), [futureTasks]);
  const completedGroups = useMemo(() => groupByOwner(completedTasks), [completedTasks]);
  const snoozedGroups = useMemo(() => groupByOwner(snoozedTasks), [snoozedTasks]);

  const handleDelete = async () => {
    if (!deleteTask) return;
    try {
      await deleteTaskMutation.mutateAsync(deleteTask.id);
      setDeleteTask(null);
    } catch (err) {
      toast({
        title: 'Failed to delete task',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
      setDeleteTask(null);
    }
  };

  const handleApproveTask = async (taskId: string) => {
    try {
      await approveTask.mutateAsync(taskId);
      toast({ title: 'Task approved' });
    } catch (err) {
      toast({
        title: 'Failed to approve task',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleApproveAll = async () => {
    try {
      await approveAll.mutateAsync();
      toast({ title: `${pendingApprovalTasks.length} tasks approved` });
    } catch (err) {
      toast({
        title: 'Failed to approve tasks',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleDismissTask = async (taskId: string) => {
    try {
      await dismissTask.mutateAsync(taskId);
      toast({ title: 'Task dismissed' });
    } catch (err) {
      toast({
        title: 'Failed to dismiss task',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const taskHandlers = {
    onEdit: setEditTask,
    onReassign: setReassignTask,
    onPin: setPinTask,
    onDelete: setDeleteTask,
  };

  return (
    <div className="px-8 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Today's Tasks</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Deal follow-up tasks & assignments</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMeetings.mutate()}
            disabled={syncMeetings.isPending}
          >
            {syncMeetings.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4 mr-2" />
            )}
            {syncMeetings.isPending ? 'Syncing...' : 'Sync Meetings'}
          </Button>
          <Link to="/admin/daily-tasks/analytics">
            <Button variant="outline" size="sm">
              <BarChart3 className="h-4 w-4 mr-2" />
              Analytics
            </Button>
          </Link>
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Task
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center">
                <ListChecks className="h-5 w-5 text-blue-700" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{stats.pending + stats.overdue}</p>
                <p className="text-xs text-muted-foreground">Open Tasks</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-green-700" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{stats.completed}</p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-700" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{stats.overdue}</p>
                <p className="text-xs text-muted-foreground">Overdue</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-amber-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-700" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">
                  {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%
                </p>
                <p className="text-xs text-muted-foreground">Completion Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Approval Banner (leadership only) */}
      {pendingApprovalTasks.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-amber-600" />
              <h3 className="text-sm font-semibold text-amber-800">Awaiting Approval</h3>
              <Badge variant="outline" className="border-amber-300 text-amber-700 text-[10px]">
                {pendingApprovalTasks.length} tasks
              </Badge>
            </div>
            {isLeadership && (
              <Button
                size="sm"
                onClick={handleApproveAll}
                disabled={approveAll.isPending}
                className="gap-1.5"
              >
                <ShieldCheck className="h-4 w-4" />
                Approve All ({pendingApprovalTasks.length})
              </Button>
            )}
          </div>

          {/* Pending approval tasks grouped by person */}
          <div className="space-y-3">
            {pendingApprovalGroups.map((group) => (
              <PersonTaskGroup
                key={group.assigneeId || 'unassigned'}
                group={group}
                isLeadership={isLeadership}
                isPendingApproval
                onApprove={handleApproveTask}
                onDismiss={handleDismissTask}
                {...taskHandlers}
              />
            ))}
          </div>

          {/* Divider */}
          {approvedTasks.length > 0 && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-background px-3 text-xs text-muted-foreground">
                  Approved Tasks
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* View Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-lg border bg-white p-0.5">
          <button
            onClick={() => setView('my')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              view === 'my'
                ? 'bg-gray-900 text-white'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Users className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
            My Tasks
          </button>
          <button
            onClick={() => setView('all')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              view === 'all'
                ? 'bg-gray-900 text-white'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <ListChecks className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
            All Tasks
          </button>
        </div>

        {/* Entity type filter */}
        <div className="flex items-center gap-1 rounded-lg border bg-white p-0.5">
          {(['all', 'deal', 'buyer'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setEntityFilter(filter)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                entityFilter === filter
                  ? 'bg-gray-900 text-white'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {filter === 'all' ? 'All Types' : filter === 'deal' ? 'Deal Tasks' : 'Buyer Tasks'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Tag filter */}
          {allDistinctTags && allDistinctTags.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={selectedTags.size > 0 ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs gap-1.5"
                >
                  <Tag className="h-3.5 w-3.5" />
                  Tags
                  {selectedTags.size > 0 && (
                    <Badge variant="secondary" className="h-4 px-1 text-[9px] ml-1">
                      {selectedTags.size}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-48 overflow-auto">
                {allDistinctTags.map((tag) => (
                  <DropdownMenuCheckboxItem
                    key={tag}
                    checked={selectedTags.has(tag)}
                    onCheckedChange={(checked) => {
                      setSelectedTags((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(tag);
                        else next.delete(tag);
                        return next;
                      });
                    }}
                  >
                    {tag}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Meeting source filter */}
          {distinctMeetings.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant={selectedMeeting ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs gap-1.5"
                >
                  <Mic className="h-3.5 w-3.5" />
                  {selectedMeeting
                    ? distinctMeetings.find((m) => m.id === selectedMeeting)?.title || 'Meeting'
                    : 'Meeting'}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-60 overflow-auto min-w-[200px]">
                <DropdownMenuCheckboxItem
                  checked={!selectedMeeting}
                  onCheckedChange={() => setSelectedMeeting(null)}
                >
                  All Meetings
                </DropdownMenuCheckboxItem>
                {distinctMeetings.map((m) => (
                  <DropdownMenuCheckboxItem
                    key={m.id}
                    checked={selectedMeeting === m.id}
                    onCheckedChange={() =>
                      setSelectedMeeting(selectedMeeting === m.id ? null : m.id)
                    }
                  >
                    {m.title}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

            <Button
            size="sm"
            onClick={() => setShowCompleted(!showCompleted)}
            className="text-xs"
          >
            {showCompleted ? 'Hide Completed' : 'Show Completed'}
          </Button>
        </div>
      </div>

      {/* Task List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      ) : tasksError ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-400" />
            <p className="font-medium text-red-700 mb-1">Failed to load tasks</p>
            <p className="text-sm text-muted-foreground">
              {tasksError instanceof Error ? tasksError.message : 'An unexpected error occurred'}
            </p>
          </CardContent>
        </Card>
      ) : !tasks || tasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ListChecks className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">
              {view === 'my'
                ? 'No tasks assigned to you. Switch to "All Tasks" to see the full team view.'
                : 'No tasks yet today. Tasks will appear after the daily standup is processed.'}
            </p>
            <div className="flex items-center justify-center gap-2 mt-4">
              {view === 'my' && (
                <Button variant="outline" size="sm" onClick={() => setView('all')}>
                  <Users className="h-4 w-4 mr-2" />
                  View All Tasks
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Manual Task
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : approvedTasks.length === 0 && pendingApprovalTasks.length > 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <ShieldCheck className="h-10 w-10 mx-auto mb-3 text-amber-400" />
            <p className="text-sm text-muted-foreground">
              All {pendingApprovalTasks.length} tasks are awaiting approval above.
              {isLeadership
                ? ' Approve them to move tasks to your active list.'
                : ' Ask a team lead to approve pending tasks.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Today & Overdue */}
          {todayTasks.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">Today & Overdue</h3>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {todayTasks.length}
                </Badge>
              </div>
              {todayGroups.map((group) => (
                <PersonTaskGroup
                  key={group.assigneeId || 'unassigned'}
                  group={group}
                  isLeadership={isLeadership}
                  {...taskHandlers}
                />
              ))}
            </div>
          )}

          {/* Upcoming */}
          {futureTasks.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">Upcoming</h3>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {futureTasks.length}
                </Badge>
              </div>
              {futureGroups.map((group) => (
                <PersonTaskGroup
                  key={group.assigneeId || 'unassigned'}
                  group={group}
                  isLeadership={isLeadership}
                  {...taskHandlers}
                />
              ))}
            </div>
          )}

          {/* Snoozed */}
          {snoozedTasks.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <PauseCircle className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-foreground">Snoozed</h3>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {snoozedTasks.length}
                </Badge>
              </div>
              {snoozedGroups.map((group) => (
                <PersonTaskGroup
                  key={group.assigneeId || 'unassigned'}
                  group={group}
                  isLeadership={isLeadership}
                  {...taskHandlers}
                />
              ))}
            </div>
          )}

          {/* Completed */}
          {showCompleted && completedTasks.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">Completed</h3>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {completedTasks.length}
                </Badge>
              </div>
              {completedGroups.map((group) => (
                <PersonTaskGroup
                  key={group.assigneeId || 'unassigned'}
                  group={group}
                  isLeadership={isLeadership}
                  {...taskHandlers}
                />
              ))}
            </div>
          )}

          {/* Fallback: approved tasks exist but none match today/future/completed filters */}
          {todayTasks.length === 0 && futureTasks.length === 0 && snoozedTasks.length === 0 && completedTasks.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center">
                <ListChecks className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground">
                  {approvedTasks.length} task{approvedTasks.length !== 1 ? 's' : ''} found but none
                  match the current filters. Try enabling "Show Completed" or adjusting filters.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Dialogs */}
      <AddTaskDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        teamMembers={teamMembers}
      />
      <EditTaskDialog
        task={editTask}
        open={!!editTask}
        onOpenChange={(open) => !open && setEditTask(null)}
      />
      <ReassignDialog
        task={reassignTask}
        open={!!reassignTask}
        onOpenChange={(open) => !open && setReassignTask(null)}
        teamMembers={teamMembers}
      />
      <PinDialog
        task={pinTask}
        open={!!pinTask}
        onOpenChange={(open) => !open && setPinTask(null)}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTask} onOpenChange={(open) => !open && setDeleteTask(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTask?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DailyTaskDashboard;
