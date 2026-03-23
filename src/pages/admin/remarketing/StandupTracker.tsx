import { useState, useMemo } from 'react';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Mic,
  Calendar,
  Clock,
  Users,
  CheckCircle2,
  AlertTriangle,
  ListChecks,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Search,
  FileText,
  UserRound,
  ClipboardList,
  Building2,
  ShieldAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStandupMeetings } from '@/hooks/useStandupMeetings';
import type { StandupMeetingWithTasks } from '@/hooks/useStandupMeetings';
import type { DailyStandupTaskWithRelations } from '@/types/daily-tasks';
import {
  TASK_TYPE_LABELS,
  TASK_TYPE_COLORS,
  TASK_STATUS_LABELS,
} from '@/types/daily-tasks';

// ─── Format meeting date label ───
function formatMeetingDate(dateStr: string): string {
  const d = parseISO(dateStr);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'EEEE, MMMM d, yyyy');
}

// ─── Status badge colors ───
function getStatusColor(status: string) {
  switch (status) {
    case 'completed':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'overdue':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'in_progress':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'snoozed':
      return 'bg-slate-100 text-slate-800 border-slate-200';
    case 'pending_approval':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

// ─── Single task row inside a meeting card ───
function MeetingTaskRow({ task }: { task: DailyStandupTaskWithRelations }) {
  const assigneeName = task.assignee
    ? `${task.assignee.first_name || ''} ${task.assignee.last_name || ''}`.trim()
    : 'Unassigned';
  const isCompleted = task.status === 'completed';
  const isPendingApproval = task.status === 'pending_approval';
  const dealName =
    task.deal?.listings?.internal_company_name || task.deal?.listings?.title || task.deal_reference;

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-md border text-sm',
        isCompleted ? 'bg-muted/30 opacity-70' : isPendingApproval ? 'bg-amber-50/50 border-amber-200' : 'bg-card',
      )}
    >
      {/* Status indicator */}
      {isCompleted ? (
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
      ) : task.status === 'overdue' ? (
        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
      ) : isPendingApproval ? (
        <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
      ) : (
        <div className="h-4 w-4 rounded-full border-2 border-gray-300 shrink-0" />
      )}

      {/* Title */}
      <span
        className={cn(
          'flex-1 truncate font-medium',
          isCompleted && 'line-through text-muted-foreground',
        )}
      >
        {task.title}
      </span>

      {/* Deal reference */}
      {dealName && (
        <Badge
          variant="outline"
          className="shrink-0 text-[10px] px-1.5 py-0 h-4 border-indigo-200 text-indigo-700 bg-indigo-50 max-w-[120px] truncate"
          title={dealName}
        >
          <Building2 className="h-2.5 w-2.5 mr-0.5 inline" />
          {dealName}
        </Badge>
      )}

      {/* Task type */}
      <Badge
        variant="outline"
        className={cn('shrink-0 text-[10px] px-1.5 py-0 h-4', TASK_TYPE_COLORS[task.task_type])}
      >
        {TASK_TYPE_LABELS[task.task_type]}
      </Badge>

      {/* Status */}
      <Badge
        variant="outline"
        className={cn('shrink-0 text-[10px] px-1.5 py-0 h-4', getStatusColor(task.status))}
      >
        {TASK_STATUS_LABELS[task.status] || task.status}
      </Badge>

      {/* Assignee */}
      <div className="flex items-center gap-1 shrink-0 text-xs text-muted-foreground min-w-[100px]">
        <UserRound className="h-3 w-3" />
        <span className="truncate">{assigneeName}</span>
      </div>

      {/* Due date */}
      {task.due_date && (
        <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">
          <Calendar className="h-3 w-3 inline mr-0.5 -mt-0.5" />
          {format(parseISO(task.due_date), 'MMM d')}
        </span>
      )}
    </div>
  );
}

// ─── Single meeting card ───
function MeetingCard({ meeting }: { meeting: StandupMeetingWithTasks }) {
  const [isOpen, setIsOpen] = useState(false);

  const completedCount = meeting.tasks.filter((t) => t.status === 'completed').length;
  const overdueCount = meeting.tasks.filter((t) => t.status === 'overdue').length;
  const pendingApprovalCount = meeting.tasks.filter((t) => t.status === 'pending_approval').length;
  const totalTasks = meeting.tasks.length;
  const completionPct = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

  // Group tasks by assignee for the summary view
  const tasksByAssignee = useMemo(() => {
    const groups = new Map<string, { name: string; tasks: DailyStandupTaskWithRelations[] }>();
    for (const task of meeting.tasks) {
      const key = task.assignee_id || '__unassigned__';
      if (!groups.has(key)) {
        const name = task.assignee
          ? `${task.assignee.first_name || ''} ${task.assignee.last_name || ''}`.trim() ||
            'Unknown'
          : 'Unassigned';
        groups.set(key, { name, tasks: [] });
      }
      groups.get(key)!.tasks.push(task);
    }
    return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [meeting.tasks]);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="overflow-hidden">
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 pt-4 px-5 cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-start gap-4">
              {/* Icon */}
              <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center shrink-0 mt-0.5">
                <Mic className="h-5 w-5 text-purple-700" />
              </div>

              {/* Meeting info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <CardTitle className="text-sm font-semibold truncate">
                    {meeting.meeting_title || 'Untitled Meeting'}
                  </CardTitle>
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatMeetingDate(meeting.meeting_date)}
                  </span>
                  {meeting.meeting_duration_minutes && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {meeting.meeting_duration_minutes}min
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {meeting.attendees.length} attendee{meeting.attendees.length !== 1 ? 's' : ''}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <ListChecks className="h-3 w-3" />
                    {totalTasks} task{totalTasks !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Right side stats */}
              <div className="flex items-center gap-3 shrink-0">
                {pendingApprovalCount > 0 && (
                  <Badge variant="outline" className="text-[10px] px-2 py-0 h-5 border-amber-300 text-amber-700 bg-amber-50">
                    {pendingApprovalCount} awaiting approval
                  </Badge>
                )}
                {overdueCount > 0 && (
                  <Badge variant="destructive" className="text-[10px] px-2 py-0 h-5">
                    {overdueCount} overdue
                  </Badge>
                )}
                {totalTasks > 0 ? (
                  <div className="flex items-center gap-1.5">
                    <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          completionPct === 100
                            ? 'bg-green-500'
                            : completionPct >= 50
                              ? 'bg-blue-500'
                              : 'bg-amber-500',
                        )}
                        style={{ width: `${completionPct}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium tabular-nums w-8 text-right">
                      {completionPct}%
                    </span>
                  </div>
                ) : (
                  <Badge variant="secondary" className="text-[10px] px-2 py-0 h-5">
                    No tasks
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="px-5 pb-5 pt-0 space-y-4">
            {/* Summary */}
            {meeting.summary && (
              <div className="rounded-lg bg-blue-50/60 border border-blue-100 px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-blue-600" />
                  <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider">
                    Meeting Summary
                  </p>
                </div>
                <p className="text-sm text-blue-900">{meeting.summary}</p>
              </div>
            )}

            {/* Key Points by Assignee */}
            {meeting.key_points && meeting.key_points.length > 0 && (
              <div className="rounded-lg bg-amber-50/60 border border-amber-100 px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <ClipboardList className="h-4 w-4 text-amber-600" />
                  <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
                    Key Points
                  </p>
                </div>
                <ul className="space-y-1.5">
                  {meeting.key_points.map((point, i) => (
                    <li key={i} className="text-sm text-amber-900 flex items-start gap-2">
                      <span className="text-amber-500 mt-1 shrink-0">&#8226;</span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Meeting-level extraction metadata */}
            {(meeting.tasks_extracted > 0 || meeting.tasks_unassigned > 0) && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                {meeting.tasks_extracted > 0 && (
                  <span>{meeting.tasks_extracted} tasks extracted from transcript</span>
                )}
                {meeting.tasks_unassigned > 0 && (
                  <span className="text-amber-600 font-medium">
                    {meeting.tasks_unassigned} unassigned
                  </span>
                )}
              </div>
            )}

            {/* Tasks by assignee */}
            {totalTasks > 0 ? (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Assigned Tasks
                </p>
                {tasksByAssignee.map((group) => (
                  <div key={group.name} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                        <UserRound className="h-3 w-3 text-primary" />
                      </div>
                      <span className="text-xs font-semibold">{group.name}</span>
                      <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                        {group.tasks.length}
                      </Badge>
                    </div>
                    <div className="pl-8 space-y-1">
                      {group.tasks.map((task) => (
                        <MeetingTaskRow key={task.id} task={task} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-sm text-muted-foreground">
                <ListChecks className="h-8 w-8 mx-auto mb-2 opacity-40" />
                No tasks were extracted from this meeting.
                {meeting.transcript_url && ' Check the transcript for manual task creation.'}
              </div>
            )}

            {/* Transcript link */}
            {meeting.transcript_url && (
              <a
                href={meeting.transcript_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View Full Transcript
              </a>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

// ─── Main Page ───
const StandupTracker = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const { data: meetings, isLoading, error } = useStandupMeetings();

  // Aggregate stats
  const stats = useMemo(() => {
    if (!meetings || meetings.length === 0) {
      return { totalMeetings: 0, totalTasks: 0, completedTasks: 0, overdueTasks: 0 };
    }
    let totalTasks = 0;
    let completedTasks = 0;
    let overdueTasks = 0;
    for (const m of meetings) {
      totalTasks += m.tasks.length;
      completedTasks += m.tasks.filter((t) => t.status === 'completed').length;
      overdueTasks += m.tasks.filter((t) => t.status === 'overdue').length;
    }
    return {
      totalMeetings: meetings.length,
      totalTasks,
      completedTasks,
      overdueTasks,
    };
  }, [meetings]);

  // Filter meetings by search
  const filtered = useMemo(() => {
    if (!meetings) return [];
    if (!searchQuery.trim()) return meetings;
    const q = searchQuery.toLowerCase();
    return meetings.filter((m) => {
      if (m.meeting_title?.toLowerCase().includes(q)) return true;
      if (m.attendees.some((a) => a.toLowerCase().includes(q))) return true;
      if (m.tasks.some((t) => t.title.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [meetings, searchQuery]);

  // Group by date
  const groupedByDate = useMemo(() => {
    const groups = new Map<string, StandupMeetingWithTasks[]>();
    for (const m of filtered) {
      const dateKey = m.meeting_date;
      if (!groups.has(dateKey)) groups.set(dateKey, []);
      groups.get(dateKey)!.push(m);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [filtered]);

  return (
    <div className="px-8 py-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Standup Tracker</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Daily standup summaries, key points & task assignments
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-purple-100 flex items-center justify-center">
                <Mic className="h-5 w-5 text-purple-700" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{stats.totalMeetings}</p>
                <p className="text-xs text-muted-foreground">Total Standups</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center">
                <ListChecks className="h-5 w-5 text-blue-700" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums">{stats.totalTasks}</p>
                <p className="text-xs text-muted-foreground">Tasks Assigned</p>
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
                <p className="text-2xl font-bold tabular-nums">{stats.completedTasks}</p>
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
                <p className="text-2xl font-bold tabular-nums">{stats.overdueTasks}</p>
                <p className="text-xs text-muted-foreground">Overdue</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search meetings, tasks, or people..."
          className="pl-9 h-9"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Meeting List */}
      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-400" />
            <p className="font-medium text-red-700 mb-1">Failed to load standups</p>
            <p className="text-sm text-muted-foreground">
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Mic className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">
              {searchQuery
                ? 'No standups match your search.'
                : 'No standup meetings recorded yet. Meetings will appear here once synced from Fireflies.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {groupedByDate.map(([dateKey, dateMeetings]) => (
            <div key={dateKey} className="space-y-3">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">
                  {formatMeetingDate(dateKey)}
                </h3>
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {dateMeetings.length} meeting{dateMeetings.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              {dateMeetings.map((meeting) => (
                <MeetingCard key={meeting.id} meeting={meeting} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StandupTracker;
