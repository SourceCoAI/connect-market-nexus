import { useState, useRef, useEffect, useMemo } from 'react';
import { formatDistanceToNow, format, isToday, isTomorrow, isPast, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  MoreVertical,
  Pin,
  ExternalLink,
  Pencil,
  Trash2,
  UserRound,
  Building2,
  Calendar,
  AlarmClock,
  Phone,
  Mail,
  User,
} from 'lucide-react';
import type { DailyStandupTaskWithRelations } from '@/types/daily-tasks';
import { TASK_TYPE_LABELS, TASK_TYPE_COLORS } from '@/types/daily-tasks';
import { useToggleTaskComplete, useReassignTask, useEditTask } from '@/hooks/useDailyTasks';
import { useSnoozeTask } from '@/hooks/useTaskActions';
import { useAdminProfiles } from '@/hooks/admin/use-admin-profiles';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SNOOZE_PRESETS } from '@/types/daily-tasks';
import { TaskCommentsPanel } from './TaskCommentsPanel';
import { TaskActivityPanel } from './TaskActivityPanel';

interface TaskCardProps {
  task: DailyStandupTaskWithRelations;
  isLeadership?: boolean;
  onEdit?: (task: DailyStandupTaskWithRelations) => void;
  onReassign?: (task: DailyStandupTaskWithRelations) => void;
  onPin?: (task: DailyStandupTaskWithRelations) => void;
  onDelete?: (task: DailyStandupTaskWithRelations) => void;
}

/** Minimal deal list for the deal picker */
function useDealsForPicker() {
  return useQuery({
    queryKey: ['daily-tasks-deal-picker'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_pipeline')
        .select('id, listing_id, listings(title, internal_company_name)')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        listing_id: string;
        listings: { title: string | null; internal_company_name: string | null } | null;
      }>;
    },
    staleTime: 60_000,
  });
}

export function TaskCard({
  task,
  isLeadership,
  onEdit,
  onReassign,
  onPin,
  onDelete,
}: TaskCardProps) {
  const toggleComplete = useToggleTaskComplete();
  const reassignTask = useReassignTask();
  const editTask = useEditTask();
  const snoozeTask = useSnoozeTask();
  const { data: adminProfiles } = useAdminProfiles();
  const { data: deals } = useDealsForPicker();

  const [justCompleted, setJustCompleted] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  // For 'contact_owner' tasks: resolve the listing_id to fetch seller contact
  const isContactOwner = task.task_type === 'contact_owner';
  const resolvedListingId =
    task.entity_type === 'listing' ? task.entity_id : (task.deal?.listing_id ?? null);

  const { data: sellerContact } = useQuery({
    queryKey: ['seller-contact-for-task', resolvedListingId],
    enabled: detailOpen && isContactOwner && !!resolvedListingId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts' as 'profiles')
        .select('first_name, last_name, title, phone, email')
        .eq('listing_id', resolvedListingId!)
        .eq('contact_type', 'seller')
        .order('is_primary_seller_contact', { ascending: false })
        .limit(1)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      return data as {
        first_name: string;
        last_name: string;
        title: string | null;
        phone: string | null;
        email: string | null;
      } | null;
    },
    staleTime: 60_000,
  });
  const undoTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const isOverdue = task.status === 'overdue';
  const isCompleted = task.status === 'completed';
  const isPendingApproval = task.status === 'pending_approval';
  const isAISource = task.source === 'ai' || task.source === 'chatbot';

  const dueDateLabel = (() => {
    if (!task.due_date) return 'No date';
    const d = parseISO(task.due_date);
    if (isToday(d)) return 'Today';
    if (isTomorrow(d)) return 'Tomorrow';
    return format(d, 'MMM d');
  })();

  const isDuePast = task.due_date ? isPast(parseISO(task.due_date + 'T23:59:59')) : false;

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const handleCheck = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isCompleted) {
      toggleComplete.mutate({ taskId: task.id, completed: false });
    } else {
      toggleComplete.mutate({ taskId: task.id, completed: true });
      setJustCompleted(true);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      undoTimerRef.current = setTimeout(() => setJustCompleted(false), 5000);
    }
  };

  const handleUndo = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleComplete.mutate({ taskId: task.id, completed: false });
    setJustCompleted(false);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  };

  const assigneeName = task.assignee
    ? `${task.assignee.first_name || ''} ${task.assignee.last_name || ''}`.trim()
    : null;

  const dealName =
    task.deal?.listings?.internal_company_name || task.deal?.listings?.title || task.deal_reference;

  const adminList = useMemo(() => {
    if (!adminProfiles) return [];
    return Object.entries(adminProfiles)
      .map(([id, profile]) => ({
        id,
        name: profile.displayName,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [adminProfiles]);

  const dealList = useMemo(() => {
    if (!deals) return [];
    return deals
      .map((d) => ({
        id: d.id,
        name: d.listings?.internal_company_name || d.listings?.title || d.id.slice(0, 8),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [deals]);

  const handleAssigneeChange = (newAssigneeId: string) => {
    reassignTask.mutate({ taskId: task.id, newAssigneeId });
  };

  const handleDealChange = (newDealId: string) => {
    const deal = deals?.find((d) => d.id === newDealId);
    editTask.mutate({
      taskId: task.id,
      updates: {
        deal_id: newDealId,
        deal_reference: deal?.listings?.internal_company_name || deal?.listings?.title || null,
      },
    });
  };

  return (
    <>
      {/* ── Compact card: checkbox + title only ── */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setDetailOpen(true)}
        onKeyDown={(e) => e.key === 'Enter' && setDetailOpen(true)}
        className={cn(
          'group flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all cursor-pointer',
          isCompleted && 'opacity-60 bg-muted/30',
          isOverdue && !isCompleted && 'border-red-300 bg-red-50/50',
          !isCompleted && !isOverdue && 'bg-card hover:shadow-sm border-border',
          justCompleted && 'bg-green-50/50 border-green-300',
        )}
      >
        {/* Checkbox – only shown for approved tasks */}
        {!isPendingApproval && (
          <div
            className="flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <Checkbox
              checked={isCompleted}
              onCheckedChange={() => handleCheck()}
              disabled={toggleComplete.isPending}
              className={cn('h-5 w-5', isOverdue && 'border-red-400')}
            />
          </div>
        )}

        {/* Title + AI badge */}
        <span
          className={cn(
            'flex-1 text-sm font-medium leading-tight truncate',
            isCompleted && 'line-through text-muted-foreground',
          )}
        >
          {task.title}
        </span>

        {/* AI source indicator */}
        {isAISource && isPendingApproval && (
          <Badge
            variant="outline"
            className="shrink-0 text-[9px] px-1.5 py-0 h-4 border-purple-300 text-purple-700 bg-purple-50"
          >
            AI Suggested
          </Badge>
        )}

        {/* Source meeting badge */}
        {task.source_meeting?.meeting_title && (
          <Badge
            variant="outline"
            className="shrink-0 text-[9px] px-1.5 py-0 h-4 border-sky-300 text-sky-700 bg-sky-50 max-w-[160px] truncate"
            title={task.source_meeting.meeting_title}
          >
            {task.source_meeting.meeting_title}
          </Badge>
        )}

        <span
          className={cn(
            'inline-flex items-center gap-1 text-[11px] shrink-0 tabular-nums',
            isCompleted
              ? 'text-muted-foreground'
              : isOverdue || (isDuePast && !isCompleted)
                ? 'text-red-600 font-medium'
                : 'text-muted-foreground',
          )}
        >
          <Calendar className="h-3 w-3" />
          {dueDateLabel}
        </span>

        {/* Overdue badge */}
        {isOverdue && !isCompleted && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 shrink-0">
            Overdue
          </Badge>
        )}

        {/* Pin indicator */}
        {task.is_pinned && !isCompleted && <Pin className="h-3.5 w-3.5 text-amber-500 shrink-0" />}

        {/* Tag pills */}
        {task.tags && task.tags.length > 0 && (
          <div className="flex items-center gap-1 shrink-0">
            {task.tags.slice(0, 2).map((tag) => (
              <Badge key={tag} variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-slate-50">
                {tag}
              </Badge>
            ))}
            {task.tags.length > 2 && (
              <span className="text-[9px] text-muted-foreground">+{task.tags.length - 2}</span>
            )}
          </div>
        )}

        {/* Undo inline */}
        {justCompleted && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2 text-green-700 hover:text-green-900 shrink-0"
            onClick={handleUndo}
          >
            Undo
          </Button>
        )}

        {/* Three-dot menu */}
        <div
          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit?.(task)}>
                <Pencil className="h-3.5 w-3.5 mr-2" />
                Edit Task
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onReassign?.(task)}>
                <UserRound className="h-3.5 w-3.5 mr-2" />
                Reassign
              </DropdownMenuItem>
              {!isCompleted && task.status !== 'snoozed' && (
                <>
                  <DropdownMenuSeparator />
                  {SNOOZE_PRESETS.map((preset) => (
                    <DropdownMenuItem
                      key={preset.days}
                      onClick={() => snoozeTask.mutate({ taskId: task.id, days: preset.days })}
                    >
                      <AlarmClock className="h-3.5 w-3.5 mr-2" />
                      Snooze {preset.label}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              {isLeadership && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onPin?.(task)}>
                    <Pin className="h-3.5 w-3.5 mr-2" />
                    {task.is_pinned ? 'Unpin' : 'Pin to Rank'}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onDelete?.(task)} className="text-destructive">
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Detail popup ── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base leading-snug pr-6">{task.title}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* Description */}
            {task.description && (
              <p className="text-sm text-muted-foreground leading-relaxed">{task.description}</p>
            )}

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {/* Task type */}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Type</p>
                <Badge
                  variant="outline"
                  className={cn('text-xs', TASK_TYPE_COLORS[task.task_type])}
                >
                  {TASK_TYPE_LABELS[task.task_type]}
                </Badge>
              </div>

              {/* Status */}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <Badge
                  variant={isOverdue ? 'destructive' : isCompleted ? 'secondary' : 'outline'}
                  className="text-xs"
                >
                  {isOverdue
                    ? 'Overdue'
                    : isCompleted
                      ? 'Completed'
                      : task.status === 'pending_approval'
                        ? 'Awaiting Approval'
                        : task.status === 'snoozed'
                          ? 'Snoozed'
                          : 'Pending'}
                </Badge>
                {task.status === 'snoozed' && task.snoozed_until && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Snoozed until {format(parseISO(task.snoozed_until), 'MMM d, yyyy')}
                  </p>
                )}
              </div>

              {/* Assignee – editable dropdown */}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Assigned to</p>
                <Select value={task.assignee_id || ''} onValueChange={handleAssigneeChange}>
                  <SelectTrigger className="h-8 text-sm w-full">
                    <SelectValue placeholder="Unassigned">
                      {assigneeName && (
                        <span className="inline-flex items-center gap-1.5">
                          <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                          {assigneeName}
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {adminList.map((admin) => (
                      <SelectItem key={admin.id} value={admin.id}>
                        {admin.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Deal – editable dropdown */}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Deal</p>
                <Select value={task.deal_id || ''} onValueChange={handleDealChange}>
                  <SelectTrigger className="h-8 text-sm w-full">
                    <SelectValue placeholder="No deal linked">
                      {dealName && (
                        <span className="inline-flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          {dealName}
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {dealList.map((deal) => (
                      <SelectItem key={deal.id} value={deal.id}>
                        {deal.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Due date */}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Due</p>
                <span className={cn('text-sm', isOverdue && 'text-red-600 font-medium')}>
                  {task.due_date
                    ? formatDistanceToNow(new Date(task.due_date + 'T23:59:59'), {
                        addSuffix: true,
                      })
                    : 'No due date'}
                </span>
              </div>

              {/* Priority */}
              {task.priority_rank && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Priority</p>
                  <span className="text-sm font-medium">
                    #{task.priority_rank}
                    {task.is_pinned && (
                      <Pin className="inline h-3 w-3 ml-1 text-amber-500 -mt-0.5" />
                    )}
                    <span className="text-muted-foreground font-normal ml-1.5">
                      (score: {task.priority_score?.toFixed(0)})
                    </span>
                  </span>
                </div>
              )}
            </div>

            {/* Seller contact inline — for Contact Owner tasks */}
            {isContactOwner && sellerContact && (
              <div className="rounded-lg border bg-green-50/50 border-green-200 px-3 py-2.5 space-y-1.5">
                <p className="text-xs font-medium text-green-800">Primary Seller Contact</p>
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-3.5 w-3.5 text-green-700 shrink-0" />
                  <span className="font-medium">
                    {sellerContact.first_name} {sellerContact.last_name}
                  </span>
                  {sellerContact.title && (
                    <span className="text-muted-foreground text-xs">({sellerContact.title})</span>
                  )}
                </div>
                {sellerContact.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-3.5 w-3.5 text-green-700 shrink-0" />
                    <a
                      href={`tel:${sellerContact.phone}`}
                      className="text-blue-600 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {sellerContact.phone}
                    </a>
                  </div>
                )}
                {sellerContact.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-3.5 w-3.5 text-green-700 shrink-0" />
                    <a
                      href={`mailto:${sellerContact.email}`}
                      className="text-blue-600 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {sellerContact.email}
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Pin reason */}
            {task.is_pinned && task.pin_reason && (
              <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                <p className="text-xs text-amber-800">
                  <span className="font-medium">Pinned:</span> {task.pin_reason}
                </p>
              </div>
            )}

            {/* Transcript link */}
            {task.source_meeting?.transcript_url && (
              <a
                href={task.source_meeting.transcript_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                View Standup Transcript
              </a>
            )}

            {/* Source meeting */}
            {task.source_meeting && (
              <p className="text-xs text-muted-foreground">
                From: {task.source_meeting.meeting_title}
                {task.source_timestamp && ` (at ${task.source_timestamp})`}
              </p>
            )}

            {/* AI source + confidence indicator */}
            {isAISource && (
              <div className="rounded-md bg-purple-50 border border-purple-200 px-3 py-2">
                <p className="text-xs text-purple-800">
                  <span className="font-medium">AI-generated task</span>
                  {task.ai_confidence && (
                    <span className="ml-1.5">(confidence: {task.ai_confidence})</span>
                  )}
                  {isPendingApproval && (
                    <span className="ml-1.5 text-amber-700 font-medium">
                      — Requires human approval
                    </span>
                  )}
                </p>
              </div>
            )}

            {/* AI evidence quote */}
            {task.ai_evidence_quote && (
              <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2">
                <p className="text-xs text-blue-800">
                  <span className="font-medium">AI Evidence:</span>{' '}
                  <span className="italic">&ldquo;{task.ai_evidence_quote}&rdquo;</span>
                </p>
              </div>
            )}

            {/* Comments */}
            <div className="border-t pt-3">
              <TaskCommentsPanel taskId={task.id} />
            </div>

            {/* Activity log */}
            <div className="border-t pt-3">
              <TaskActivityPanel taskId={task.id} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
