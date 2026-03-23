import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  useDailyTasks,
  useDeleteTask,
  useApproveTask,
  useApproveAllTasks,
} from '@/hooks/useDailyTasks';
import { useCancelTask } from '@/hooks/useTaskActions';
import { useToast } from '@/hooks/use-toast';
import { useExistingTags } from '@/hooks/useTaskTags';
import { ListChecks, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AddTaskDialog } from '@/components/daily-tasks/AddTaskDialog';
import { EditTaskDialog } from '@/components/daily-tasks/EditTaskDialog';
import { ReassignDialog } from '@/components/daily-tasks/ReassignDialog';
import { PinDialog } from '@/components/daily-tasks/PinDialog';
import type { DailyStandupTaskWithRelations } from '@/types/daily-tasks';

import {
  DashboardHeader,
  StandupsTabContent,
  TaskStatsCards,
  TaskFiltersBar,
  TaskListContent,
  PendingApprovalSection,
  DeleteTaskDialog,
  useSyncMeetings,
  useTeamMembers,
  useTaskFilters,
} from './daily-task-dashboard';

const DailyTaskDashboard = () => {
  const { teamRole } = useAuth();
  const { toast } = useToast();
  const isLeadership = teamRole === 'owner' || teamRole === 'admin';

  const [pageTab, setPageTab] = useState<'tasks' | 'standups'>('tasks');
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

  const deleteTaskMutation = useDeleteTask();
  const approveTask = useApproveTask();
  const approveAll = useApproveAllTasks();
  const dismissTask = useCancelTask();
  const { data: allDistinctTags } = useExistingTags();
  const syncMeetings = useSyncMeetings();
  const teamMembers = useTeamMembers();

  const {
    data: tasks,
    isLoading,
    error: tasksError,
  } = useDailyTasks({
    view,
    includeCompleted: showCompleted,
  });

  const {
    pendingApprovalTasks,
    approvedTasks,
    todayTasks,
    futureTasks,
    completedTasks,
    snoozedTasks,
    stats,
    pendingApprovalGroups,
    todayGroups,
    futureGroups,
    completedGroups,
    snoozedGroups,
    distinctMeetings,
  } = useTaskFilters({
    tasks,
    entityFilter,
    selectedMeeting,
    selectedTags,
    showCompleted,
  });

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
      <DashboardHeader
        onSyncMeetings={() => syncMeetings.mutate()}
        isSyncing={syncMeetings.isPending}
        onAddTask={() => setAddDialogOpen(true)}
      />

      {/* Page Tab Toggle: Tasks | Standups */}
      <div className="flex items-center gap-1 rounded-lg border bg-white p-0.5 w-fit">
        <button
          onClick={() => setPageTab('tasks')}
          className={cn(
            'px-4 py-1.5 text-xs font-medium rounded-md transition-colors',
            pageTab === 'tasks'
              ? 'bg-gray-900 text-white'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <ListChecks className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
          Tasks
        </button>
        <button
          onClick={() => setPageTab('standups')}
          className={cn(
            'px-4 py-1.5 text-xs font-medium rounded-md transition-colors',
            pageTab === 'standups'
              ? 'bg-gray-900 text-white'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Mic className="h-3.5 w-3.5 inline mr-1.5 -mt-0.5" />
          Standups
        </button>
      </div>

      {/* Standups Tab */}
      {pageTab === 'standups' && <StandupsTabContent />}

      {/* Tasks Tab */}
      {pageTab === 'tasks' && (
        <>
          {/* KPI Cards */}
          <TaskStatsCards stats={stats} />

          {/* Pending Approval Banner (leadership only) */}
          <PendingApprovalSection
            pendingApprovalTasks={pendingApprovalTasks}
            pendingApprovalGroups={pendingApprovalGroups}
            approvedTasksCount={approvedTasks.length}
            isLeadership={isLeadership}
            isApprovingAll={approveAll.isPending}
            onApproveAll={handleApproveAll}
            onApproveTask={handleApproveTask}
            onDismissTask={handleDismissTask}
            taskHandlers={taskHandlers}
          />

          {/* View Toggle & Filters */}
          <TaskFiltersBar
            view={view}
            onViewChange={setView}
            entityFilter={entityFilter}
            onEntityFilterChange={setEntityFilter}
            selectedTags={selectedTags}
            onSelectedTagsChange={setSelectedTags}
            allDistinctTags={allDistinctTags}
            selectedMeeting={selectedMeeting}
            onSelectedMeetingChange={setSelectedMeeting}
            distinctMeetings={distinctMeetings}
            showCompleted={showCompleted}
            onShowCompletedChange={setShowCompleted}
          />

          {/* Task List */}
          <TaskListContent
            isLoading={isLoading}
            tasksError={tasksError}
            tasks={tasks}
            approvedTasks={approvedTasks}
            pendingApprovalTasks={pendingApprovalTasks}
            todayTasks={todayTasks}
            futureTasks={futureTasks}
            completedTasks={completedTasks}
            snoozedTasks={snoozedTasks}
            todayGroups={todayGroups}
            futureGroups={futureGroups}
            completedGroups={completedGroups}
            snoozedGroups={snoozedGroups}
            showCompleted={showCompleted}
            view={view}
            isLeadership={isLeadership}
            taskHandlers={taskHandlers}
            onViewChange={setView}
            onAddTask={() => setAddDialogOpen(true)}
          />
        </>
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
      <DeleteTaskDialog
        task={deleteTask}
        onOpenChange={() => setDeleteTask(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
};

export default DailyTaskDashboard;
