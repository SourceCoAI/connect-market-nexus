import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, CalendarDays, ListChecks } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskFiltersBarProps {
  view: 'my' | 'all';
  onViewChange: (view: 'my' | 'all') => void;
  showCompleted: boolean;
  onShowCompletedChange: (show: boolean) => void;
  calendarView: boolean;
  onCalendarViewChange: (cal: boolean) => void;
  overdueCount: number;
}

export function TaskFiltersBar({
  view,
  onViewChange,
  showCompleted,
  onShowCompletedChange,
  calendarView,
  onCalendarViewChange,
  overdueCount,
}: TaskFiltersBarProps) {
  return (
    <div className="flex items-center justify-between">
      {/* Left: View toggle */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border bg-white p-0.5">
          <button
            onClick={() => onViewChange('my')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              view === 'my'
                ? 'bg-gray-900 text-white'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            My Tasks
          </button>
          <button
            onClick={() => onViewChange('all')}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
              view === 'all'
                ? 'bg-gray-900 text-white'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            All Tasks
          </button>
        </div>

        {overdueCount > 0 && (
          <Badge variant="destructive" className="text-[10px] h-5 px-2">
            {overdueCount} overdue
          </Badge>
        )}
      </div>

      {/* Right: View mode + show completed */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border bg-white p-0.5">
          <button
            onClick={() => onCalendarViewChange(false)}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
              !calendarView
                ? 'bg-gray-900 text-white'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <ListChecks className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onCalendarViewChange(true)}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded-md transition-colors',
              calendarView
                ? 'bg-gray-900 text-white'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" />
          </button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onShowCompletedChange(!showCompleted)}
          className="text-xs gap-1.5 text-muted-foreground"
        >
          {showCompleted ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
          {showCompleted ? 'Hide done' : 'Show done'}
        </Button>
      </div>
    </div>
  );
}
