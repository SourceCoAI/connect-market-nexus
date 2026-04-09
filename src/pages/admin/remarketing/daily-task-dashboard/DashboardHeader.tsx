import { Button } from '@/components/ui/button';
import { Plus, BarChart3, RefreshCcw, Loader2, Mic } from 'lucide-react';
import type { TaskStats } from './types';

interface DashboardHeaderProps {
  onSyncMeetings: () => void;
  isSyncing: boolean;
  onAddTask: () => void;
  onViewStandups: () => void;
  onViewAnalytics: () => void;
  stats: TaskStats;
}

export function DashboardHeader({
  onSyncMeetings,
  isSyncing,
  onAddTask,
  onViewStandups,
  onViewAnalytics,
  stats,
}: DashboardHeaderProps) {
  const openCount = stats.pending + stats.overdue + stats.in_progress;
  const todayTotal = openCount + stats.completed;
  const completionPct = todayTotal > 0 ? Math.round((stats.completed / todayTotal) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Tasks</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {openCount > 0
              ? `${openCount} open task${openCount !== 1 ? 's' : ''}`
              : 'All caught up'}
            {stats.overdue > 0 && (
              <span className="text-red-600 font-medium ml-1">
                ({stats.overdue} overdue)
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onSyncMeetings} disabled={isSyncing}>
            {isSyncing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4 mr-2" />
            )}
            {isSyncing ? 'Syncing...' : 'Sync Meetings'}
          </Button>
          <Button variant="outline" size="sm" onClick={onViewStandups}>
            <Mic className="h-4 w-4 mr-2" />
            Standups
          </Button>
          <Button variant="outline" size="sm" onClick={onViewAnalytics}>
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics
          </Button>
          <Button size="sm" onClick={onAddTask}>
            <Plus className="h-4 w-4 mr-2" />
            Add Task
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      {todayTotal > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-500"
              style={{ width: `${completionPct}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            {stats.completed}/{todayTotal} done
          </span>
        </div>
      )}
    </div>
  );
}
