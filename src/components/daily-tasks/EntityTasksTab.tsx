/**
 * EntityTasksTab — Reusable Tasks tab for Listing/Deal/Buyer detail pages.
 *
 * Renders tasks linked to a specific entity, with add, edit, snooze,
 * complete, delete, and filter capabilities.
 */

import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
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
  Plus,
  ListChecks,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Filter,
  FileText,
  Repeat,
  Zap,
  X,
  UserPlus,
  AlarmClock,
} from 'lucide-react';
import { useEntityTasks } from '@/hooks/useEntityTasks';
import { useDeleteTask } from '@/hooks/useDailyTasks';
import { useToggleTaskComplete } from '@/hooks/useDailyTaskMutations';
import { useSnoozeTask } from '@/hooks/useTaskActions';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { TaskCard } from './TaskCard';
import { EditTaskDialog } from './EditTaskDialog';
import { ReassignDialog } from './ReassignDialog';
import { PinDialog } from './PinDialog';
import { EntityAddTaskDialog } from './EntityAddTaskDialog';
import { TaskTemplateDialog } from './TaskTemplateDialog';
import type { DailyStandupTaskWithRelations, TaskEntityType } from '@/types/daily-tasks';

interface EntityTasksTabProps {
  entityType: TaskEntityType;
  entityId: string;
  entityName?: string;
  teamMembers?: { id: string; name: string }[];
  /** For deal entity — pre-populate deal_id in new tasks */
  dealId?: string;
}

export function EntityTasksTab({
  entityType,
  entityId,
  entityName,
  teamMembers = [],
  dealId,
}: EntityTasksTabProps) {
  const { teamRole } = useAuth();
  const { toast } = useToast();
  const isLeadership = teamRole === 'owner' || teamRole === 'admin';

  const [showCompleted, setShowCompleted] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editTask, setEditTask] = useState<DailyStandupTaskWithRelations | null>(null);
  const [reassignTask, setReassignTask] = useState<DailyStandupTaskWithRelations | null>(null);
  const [pinTask, setPinTask] = useState<DailyStandupTaskWithRelations | null>(null);
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<DailyStandupTaskWithRelations | null>(
    null,
  );
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [_bulkReassignOpen, _setBulkReassignOpen] = useState(false);

  const deleteTaskMutation = useDeleteTask();
  const toggleComplete = useToggleTaskComplete();
  const snoozeTask = useSnoozeTask();

  const toggleTaskSelection = useCallback((taskId: string) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedTaskIds(new Set()), []);

  const handleBulkComplete = async () => {
    try {
      await Promise.all(
        Array.from(selectedTaskIds).map((taskId) =>
          toggleComplete.mutateAsync({ taskId, completed: true }),
        ),
      );
      toast({ title: `${selectedTaskIds.size} tasks completed` });
      clearSelection();
    } catch (err) {
      toast({
        title: 'Failed to complete tasks',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleBulkSnooze = async () => {
    try {
      await Promise.all(
        Array.from(selectedTaskIds).map((taskId) => snoozeTask.mutateAsync({ taskId, days: 1 })),
      );
      toast({ title: `${selectedTaskIds.size} tasks snoozed until tomorrow` });
      clearSelection();
    } catch (err) {
      toast({
        title: 'Failed to snooze tasks',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const { data: tasks, isLoading } = useEntityTasks({
    entityType,
    entityId,
    includeCompleted: showCompleted,
  });

  const stats = useMemo(() => {
    if (!tasks) return { total: 0, completed: 0, overdue: 0, open: 0 };
    return {
      total: tasks.length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      overdue: tasks.filter((t) => t.status === 'overdue').length,
      open: tasks.filter((t) => ['pending', 'pending_approval', 'in_progress'].includes(t.status))
        .length,
    };
  }, [tasks]);

  const openTasks = useMemo(
    () =>
      (tasks || []).filter(
        (t) =>
          t.status !== 'completed' && t.status !== 'cancelled' && t.status !== 'listing_closed',
      ),
    [tasks],
  );

  const completedTasks = useMemo(
    () => (tasks || []).filter((t) => t.status === 'completed'),
    [tasks],
  );

  const handleDelete = async () => {
    if (!deleteTaskTarget) return;
    try {
      await deleteTaskMutation.mutateAsync(deleteTaskTarget.id);
      setDeleteTaskTarget(null);
    } catch (err) {
      toast({
        title: 'Failed to delete task',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
      setDeleteTaskTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">Tasks</h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
              {stats.open} open
            </Badge>
            {stats.overdue > 0 && (
              <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                {stats.overdue} overdue
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCompleted(!showCompleted)}
            className="text-xs h-7"
          >
            <Filter className="h-3 w-3 mr-1" />
            {showCompleted ? 'Hide Completed' : 'Show Completed'}
          </Button>
          {entityType === 'deal' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTemplateDialogOpen(true)}
              className="text-xs h-7"
            >
              <FileText className="h-3.5 w-3.5 mr-1" />
              Apply Template
            </Button>
          )}
          <Button size="sm" onClick={() => setAddDialogOpen(true)} className="h-7">
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add Task
          </Button>
        </div>
      </div>

      {/* Mini KPI row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
          <ListChecks className="h-4 w-4 text-blue-600" />
          <div>
            <p className="text-lg font-bold tabular-nums">{stats.open}</p>
            <p className="text-[10px] text-muted-foreground">Open</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <div>
            <p className="text-lg font-bold tabular-nums">{stats.completed}</p>
            <p className="text-[10px] text-muted-foreground">Done</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <div>
            <p className="text-lg font-bold tabular-nums">{stats.overdue}</p>
            <p className="text-[10px] text-muted-foreground">Overdue</p>
          </div>
        </div>
      </div>

      {/* Task list */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : openTasks.length === 0 && !showCompleted ? (
        <Card>
          <CardContent className="py-8 text-center">
            <Clock className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">No open tasks for this {entityType}.</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setAddDialogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Task
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {/* Bulk action bar */}
          {selectedTaskIds.size > 0 && (
            <div className="sticky top-0 z-10 flex items-center gap-2 rounded-lg border bg-background/95 backdrop-blur px-3 py-2 shadow-sm">
              <span className="text-xs font-medium">{selectedTaskIds.size} selected</span>
              <div className="flex-1" />
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={handleBulkComplete}
              >
                <CheckCircle2 className="h-3 w-3" />
                Complete All
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => {
                  // Pick first selected task for reassign dialog context
                  const firstId = Array.from(selectedTaskIds)[0];
                  const task = openTasks.find((t) => t.id === firstId);
                  if (task) setReassignTask(task);
                }}
              >
                <UserPlus className="h-3 w-3" />
                Reassign All
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={handleBulkSnooze}
              >
                <AlarmClock className="h-3 w-3" />
                Snooze All
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearSelection}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          )}

          {openTasks.map((task) => (
            <div key={task.id} className="flex items-start gap-2">
              <div className="pt-3 pl-1">
                <Checkbox
                  checked={selectedTaskIds.has(task.id)}
                  onCheckedChange={() => toggleTaskSelection(task.id)}
                  aria-label={`Select task: ${task.title}`}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="relative">
                  <TaskCard
                    task={task}
                    isLeadership={isLeadership}
                    onEdit={setEditTask}
                    onReassign={setReassignTask}
                    onPin={setPinTask}
                    onDelete={setDeleteTaskTarget}
                  />
                  {/* Overlay badges for auto-generated and recurrence */}
                  <div className="absolute top-1.5 right-12 flex items-center gap-1">
                    {task.auto_generated && (
                      <Badge
                        variant="outline"
                        className="text-[9px] h-4 px-1 bg-violet-50 text-violet-700 border-violet-200"
                      >
                        <Zap className="h-2.5 w-2.5 mr-0.5" />
                        Auto
                      </Badge>
                    )}
                    {task.recurrence_rule && (
                      <Badge
                        variant="outline"
                        className="text-[9px] h-4 px-1 bg-blue-50 text-blue-700 border-blue-200"
                      >
                        <Repeat className="h-2.5 w-2.5 mr-0.5" />
                        {task.recurrence_rule}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          {showCompleted && completedTasks.length > 0 && (
            <>
              <div className="relative my-3">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-background px-3 text-[10px] text-muted-foreground">
                    Completed ({completedTasks.length})
                  </span>
                </div>
              </div>
              {completedTasks.map((task) => (
                <div key={task.id} className="flex items-start gap-2">
                  <div className="pt-3 pl-1">
                    <Checkbox checked disabled aria-label={`Completed: ${task.title}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <TaskCard
                      task={task}
                      isLeadership={isLeadership}
                      onEdit={setEditTask}
                      onReassign={setReassignTask}
                      onPin={setPinTask}
                      onDelete={setDeleteTaskTarget}
                    />
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Dialogs */}
      <EntityAddTaskDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        entityType={entityType}
        entityId={entityId}
        entityName={entityName}
        teamMembers={teamMembers}
        defaultDealId={dealId}
      />
      <EditTaskDialog
        task={editTask}
        open={!!editTask}
        onOpenChange={(open) => !open && setEditTask(null)}
        entityType={entityType}
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

      {/* Template dialog */}
      {entityType === 'deal' && (
        <TaskTemplateDialog
          open={templateDialogOpen}
          onOpenChange={setTemplateDialogOpen}
          listingId={entityId}
          listingName={entityName}
          teamMembers={teamMembers}
          entityType={entityType}
          dealId={dealId || entityId}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTaskTarget}
        onOpenChange={(open) => !open && setDeleteTaskTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{deleteTaskTarget?.title}&rdquo;? This action
              cannot be undone.
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
}
