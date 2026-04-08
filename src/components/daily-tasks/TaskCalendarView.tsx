/**
 * TaskCalendarView — Month-view calendar showing tasks by due date.
 *
 * Displays task dots colored by priority, with day counts and
 * expandable popovers to show task titles on click.
 */

import { useState, useMemo } from 'react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
} from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DailyStandupTaskWithRelations } from '@/types/daily-tasks';

interface TaskCalendarViewProps {
  tasks: DailyStandupTaskWithRelations[];
}

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-400',
  low: 'bg-gray-400',
};

const PRIORITY_BADGE: Record<string, string> = {
  high: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  low: 'bg-gray-100 text-gray-800 border-gray-200',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function TaskCalendarView({ tasks }: TaskCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Group tasks by date string
  const tasksByDate = useMemo(() => {
    const map = new Map<string, DailyStandupTaskWithRelations[]>();
    for (const task of tasks) {
      if (!task.due_date) continue;
      const key = task.due_date.slice(0, 10); // yyyy-MM-dd
      const existing = map.get(key);
      if (existing) {
        existing.push(task);
      } else {
        map.set(key, [task]);
      }
    }
    return map;
  }, [tasks]);

  // Generate calendar grid days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const gridStart = startOfWeek(monthStart);
    const gridEnd = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [currentMonth]);

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4 text-blue-600" />
            Task Calendar
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[120px] text-center">
              {format(currentMonth, 'MMMM yyyy')}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-[10px] font-medium text-muted-foreground py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-px">
          {calendarDays.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const dayTasks = tasksByDate.get(key) || [];
            const inMonth = isSameMonth(day, currentMonth);
            const today = isToday(day);

            return (
              <Popover key={key}>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      'relative flex flex-col items-center rounded-md p-1 min-h-[48px] text-xs transition-colors',
                      !inMonth && 'opacity-30',
                      today && 'bg-blue-50 ring-1 ring-blue-200',
                      dayTasks.length > 0 && inMonth && 'hover:bg-gray-50 cursor-pointer',
                      dayTasks.length === 0 && 'cursor-default',
                    )}
                    disabled={dayTasks.length === 0}
                  >
                    <span
                      className={cn('text-[11px] tabular-nums', today && 'font-bold text-blue-700')}
                    >
                      {format(day, 'd')}
                    </span>
                    {dayTasks.length > 0 && (
                      <>
                        <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center">
                          {dayTasks.slice(0, 5).map((t, i) => (
                            <div
                              key={i}
                              className={cn(
                                'h-1.5 w-1.5 rounded-full',
                                PRIORITY_DOT[t.priority] ?? 'bg-gray-400',
                              )}
                            />
                          ))}
                        </div>
                        {dayTasks.length > 5 && (
                          <span className="text-[8px] text-muted-foreground mt-0.5">
                            +{dayTasks.length - 5}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                </PopoverTrigger>
                {dayTasks.length > 0 && (
                  <PopoverContent className="w-64 p-2" align="start">
                    <p className="text-xs font-semibold mb-1.5">
                      {format(day, 'EEE, MMM d')} — {dayTasks.length} task
                      {dayTasks.length !== 1 ? 's' : ''}
                    </p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {dayTasks.map((task) => (
                        <div
                          key={task.id}
                          className="flex items-start gap-1.5 rounded border px-2 py-1"
                        >
                          <div
                            className={cn(
                              'h-2 w-2 rounded-full mt-1 shrink-0',
                              PRIORITY_DOT[task.priority] ?? 'bg-gray-400',
                            )}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium truncate">{task.title}</p>
                            <div className="flex items-center gap-1 mt-0.5">
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-[8px] h-3.5 px-1',
                                  PRIORITY_BADGE[task.priority] ?? '',
                                )}
                              >
                                {task.priority}
                              </Badge>
                              <span className="text-[9px] text-muted-foreground truncate">
                                {task.assignee
                                  ? `${task.assignee.first_name ?? ''} ${task.assignee.last_name ?? ''}`.trim() ||
                                    task.assignee.email
                                  : 'Unassigned'}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                )}
              </Popover>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mt-3 pt-2 border-t">
          {(['high', 'medium', 'low'] as const).map((p) => (
            <div key={p} className="flex items-center gap-1">
              <div className={cn('h-2 w-2 rounded-full', PRIORITY_DOT[p])} />
              <span className="text-[10px] text-muted-foreground capitalize">{p}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
