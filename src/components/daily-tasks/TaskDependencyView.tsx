/**
 * TaskDependencyView — Visualises task dependencies for a deal.
 *
 * Renders tasks in order, showing dependency connections and blocked status.
 * A task whose `depends_on` references an incomplete task is shown as "Blocked".
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, Circle, Ban, ArrowDown, Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TASK_TYPE_LABELS, PRIORITY_COLORS } from '@/types/daily-tasks';
import type { DailyStandupTaskWithRelations } from '@/types/daily-tasks';

interface TaskDependencyViewProps {
  dealId: string;
}

export function TaskDependencyView({ dealId }: TaskDependencyViewProps) {
  const { data: tasks, isLoading } = useQuery({
    queryKey: ['entity-tasks', 'deal', dealId, 'dependency-view'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_standup_tasks' as never)
        .select(
          'id, title, status, task_type, priority, due_date, depends_on, recurrence_rule, auto_generated, generation_source, template_id, escalation_level',
        )
        .eq('entity_type', 'deal')
        .eq('entity_id', dealId)
        .not('status', 'in', '("cancelled","listing_closed")')
        .order('due_date', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as Pick<
        DailyStandupTaskWithRelations,
        | 'id'
        | 'title'
        | 'status'
        | 'task_type'
        | 'priority'
        | 'due_date'
        | 'depends_on'
        | 'recurrence_rule'
        | 'auto_generated'
        | 'generation_source'
        | 'template_id'
        | 'escalation_level'
      >[];
    },
    enabled: !!dealId,
  });

  const completedIds = useMemo(() => {
    if (!tasks) return new Set<string>();
    return new Set(tasks.filter((t) => t.status === 'completed').map((t) => t.id));
  }, [tasks]);

  const isBlocked = (task: { depends_on: string | null }) => {
    if (!task.depends_on) return false;
    // depends_on can be a single ID or comma-separated list
    const deps = task.depends_on
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
    return deps.some((depId) => !completedIds.has(depId));
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!tasks || tasks.length === 0) {
    return (
      <p className="text-xs text-muted-foreground text-center py-4">
        No tasks found for this deal.
      </p>
    );
  }

  // Build a lookup for which tasks are depended upon
  const dependedUponBy = new Map<string, string[]>();
  for (const task of tasks) {
    if (task.depends_on) {
      const deps = task.depends_on
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean);
      for (const depId of deps) {
        const existing = dependedUponBy.get(depId) || [];
        existing.push(task.id);
        dependedUponBy.set(depId, existing);
      }
    }
  }

  return (
    <div className="space-y-0">
      {tasks.map((task, idx) => {
        const blocked = isBlocked(task);
        const completed = task.status === 'completed';
        const hasDependents = dependedUponBy.has(task.id);
        const hasDependency = !!task.depends_on;

        return (
          <div key={task.id}>
            {/* Dependency connector line */}
            {hasDependency && (
              <div className="flex justify-center py-0.5">
                <ArrowDown className="h-3.5 w-3.5 text-muted-foreground/50" />
              </div>
            )}

            <div
              className={cn(
                'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors',
                blocked && 'border-amber-200 bg-amber-50/50',
                completed && 'border-green-200 bg-green-50/30 opacity-70',
                !blocked && !completed && 'border-border',
              )}
            >
              {/* Status icon */}
              {completed ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
              ) : blocked ? (
                <Ban className="h-4 w-4 text-amber-600 shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
              )}

              {/* Task title */}
              <span
                className={cn('flex-1 truncate', completed && 'line-through text-muted-foreground')}
              >
                {task.title}
              </span>

              {/* Indicators */}
              {task.recurrence_rule && <Repeat className="h-3 w-3 text-blue-500 shrink-0" />}

              {task.auto_generated && (
                <Badge
                  variant="outline"
                  className="text-[9px] h-4 px-1 shrink-0 bg-violet-50 text-violet-700 border-violet-200"
                >
                  Auto
                </Badge>
              )}

              <Badge variant="outline" className="text-[10px] h-5 shrink-0">
                {TASK_TYPE_LABELS[task.task_type] ?? task.task_type}
              </Badge>

              <Badge
                variant="outline"
                className={cn('text-[10px] h-5 shrink-0', PRIORITY_COLORS[task.priority] ?? '')}
              >
                {task.priority}
              </Badge>

              {blocked && (
                <Badge className="text-[10px] h-5 bg-amber-100 text-amber-800 border-amber-200 shrink-0">
                  Blocked
                </Badge>
              )}

              <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                {task.due_date}
              </span>
            </div>

            {/* Connector to dependents */}
            {hasDependents && idx < tasks.length - 1 && !tasks[idx + 1]?.depends_on && (
              <div className="flex justify-center py-0.5">
                <div className="w-px h-2 bg-muted-foreground/20" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
