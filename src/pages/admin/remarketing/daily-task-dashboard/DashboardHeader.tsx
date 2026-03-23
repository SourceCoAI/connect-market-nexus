import { Button } from '@/components/ui/button';
import { Plus, BarChart3, RefreshCcw, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

interface DashboardHeaderProps {
  onSyncMeetings: () => void;
  isSyncing: boolean;
  onAddTask: () => void;
}

export function DashboardHeader({ onSyncMeetings, isSyncing, onAddTask }: DashboardHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Today's Tasks</h2>
        <p className="text-sm text-muted-foreground mt-0.5">Deal follow-up tasks & assignments</p>
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
        <Link to="/admin/daily-tasks/analytics">
          <Button variant="outline" size="sm">
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics
          </Button>
        </Link>
        <Button size="sm" onClick={onAddTask}>
          <Plus className="h-4 w-4 mr-2" />
          Add Task
        </Button>
      </div>
    </div>
  );
}
