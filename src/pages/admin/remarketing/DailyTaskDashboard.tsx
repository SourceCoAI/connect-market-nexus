import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  useDailyTasks,
  useDeleteTask,
  useApproveTask,
  useApproveAllTasks,
} from '@/hooks/useDailyTasks';
import { useCancelTask } from '@/hooks/useTaskActions';
import { useToast } from '@/hooks/use-toast';
import { AddTaskDialog } from '@/components/daily-tasks/AddTaskDialog';
import { EditTaskDialog } from '@/components/daily-tasks/EditTaskDialog';
import { ReassignDialog } from '@/components/daily-tasks/ReassignDialog';
import { PinDialog } from '@/components/daily-tasks/PinDialog';
import { TaskCalendarView } from '@/components/daily-tasks/TaskCalendarView';
import type { DailyStandupTaskWithRelations } from '@/types/daily-tasks';

import {
  DashboardHeader,
  TaskFiltersBar,
  TaskListContent,
  PendingApprovalSection,
  StandupsTabContent,
  DeleteTaskDialog,
  useSyncMeetings,
  useTeamMembers,
  useTaskFilters,
} from './daily-task-dashboard';

const DailyTaskDashboard = () => {
  const navigate = useNavigate();
  const { teamRole } = useAuth();
  const { toast } = useToast();
  const isLeadership = teamRole === 'owner' || teamRole === 'admin';

  const [pageMode, setPageMode] = useState<'tasks' | 'standups'>('tasks');
  const [view, setView] = useState<'my' | 'all'>('my');
  const [showCompleted, setShowCompleted] = useState(false);
  const [calendarView, setCalendarView] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editTask, setEditTask] = useState<DailyStandupTaskWithRelations | null>(null);
  const [reassignTask, setReassignTask] = useState<DailyStandupTaskWithRelations | null>(null);
  const [pinTask, setPinTask] = useState<DailyStandupTaskWithRelations | null>(null);
  const [deleteTask, setDeleteTask] = useState<DailyStandupTaskWithRelations | null>(null);

  const deleteTaskMutation = useDeleteTask();
  const approveTask = useApproveTask();
  const approveAll = useApproveAllTasks();
  const dismissTask = useCancelTask();
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
    overdueTasks,
    todayTasks,
    futureTasks,
    completedTasks,
    snoozedTasks,
    stats,
    pendingApprovalGroups,
    overdueGroups,
    todayGroups,
    futureGroups,
    completedGroups,
    snoozedGroups,
  } = useTaskFilters({
    tasks,
    entityFilter: 'all',
    selectedMeeting: null,
    selectedTags: new Set(),
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

  if (pageMode === 'standups') {
    return (
      <div className="px-4 md:px-8 py-6 space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setPageMode('tasks')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Tasks
          </Button>
          <h2 className="text-lg font-semibold tracking-tight">Standup Meetings</h2>
        </div>
        <StandupsTabContent />
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-6 space-y-4 max-w-4xl">
      {/* Header with progress bar */}
      <DashboardHeader
        onSyncMeetings={() => syncMeetings.mutate()}
        isSyncing={syncMeetings.isPending}
        onAddTask={() => setAddDialogOpen(true)}
        onViewStandups={() => setPageMode('standups')}
        onViewAnalytics={() => navigate('/admin/daily-tasks/analytics')}
        stats={stats}
      />

      {/* Filters: My/All + Calendar/List + Show completed */}
      <TaskFiltersBar
        view={view}
        onViewChange={setView}
        showCompleted={showCompleted}
        onShowCompletedChange={setShowCompleted}
        calendarView={calendarView}
        onCalendarViewChange={setCalendarView}
        overdueCount={overdueTasks.length}
      />

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

      {/* Calendar View */}
      {calendarView && <TaskCalendarView tasks={tasks ?? []} />}

      {/* Task List */}
      {!calendarView && (
        <TaskListContent
          isLoading={isLoading}
          tasksError={tasksError}
          tasks={tasks}
          approvedTasks={approvedTasks}
          pendingApprovalTasks={pendingApprovalTasks}
          overdueTasks={overdueTasks}
          todayTasks={todayTasks}
          futureTasks={futureTasks}
          completedTasks={completedTasks}
          snoozedTasks={snoozedTasks}
          todayGroups={todayGroups}
          futureGroups={futureGroups}
          completedGroups={completedGroups}
          snoozedGroups={snoozedGroups}
          overdueGroups={overdueGroups}
          showCompleted={showCompleted}
          view={view}
          isLeadership={isLeadership}
          taskHandlers={taskHandlers}
          onViewChange={setView}
          onAddTask={() => setAddDialogOpen(true)}
        />
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
