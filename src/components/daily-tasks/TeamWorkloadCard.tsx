/**
 * TeamWorkloadCard — Shows open task count per team member as horizontal bars
 * with colored segments for priority breakdown.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users } from 'lucide-react';

interface MemberWorkload {
  id: string;
  name: string;
  high: number;
  medium: number;
  low: number;
  total: number;
}

export function TeamWorkloadCard() {
  const { data: rawTasks, isLoading } = useQuery({
    queryKey: ['team-workload-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_standup_tasks' as never)
        .select('assignee_id, priority')
        .in('status', ['pending_approval', 'pending', 'in_progress', 'overdue'])
        .not('assignee_id', 'is', null);

      if (error) throw error;
      return data as Array<{ assignee_id: string; priority: string }>;
    },
    staleTime: 60_000,
  });

  // Fetch profiles for assignee names
  const assigneeIds = useMemo(() => {
    if (!rawTasks) return [];
    return [...new Set(rawTasks.map((t) => t.assignee_id))];
  }, [rawTasks]);

  const { data: profiles } = useQuery({
    queryKey: ['team-workload-profiles', assigneeIds],
    queryFn: async () => {
      if (assigneeIds.length === 0) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', assigneeIds);
      if (error) throw error;
      return data as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        email: string;
      }>;
    },
    enabled: assigneeIds.length > 0,
    staleTime: 5 * 60_000,
  });

  const workloads = useMemo<MemberWorkload[]>(() => {
    if (!rawTasks) return [];

    const profileMap = new Map(
      (profiles ?? []).map((p) => [
        p.id,
        `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || p.email,
      ]),
    );

    const map = new Map<string, MemberWorkload>();

    for (const task of rawTasks) {
      const existing = map.get(task.assignee_id);
      if (existing) {
        if (task.priority === 'high') existing.high++;
        else if (task.priority === 'low') existing.low++;
        else existing.medium++;
        existing.total++;
      } else {
        map.set(task.assignee_id, {
          id: task.assignee_id,
          name: profileMap.get(task.assignee_id) ?? 'Unknown',
          high: task.priority === 'high' ? 1 : 0,
          medium: task.priority === 'medium' ? 1 : 0,
          low: task.priority === 'low' ? 1 : 0,
          total: 1,
        });
      }
    }

    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [rawTasks, profiles]);

  const maxCount = useMemo(() => Math.max(...workloads.map((w) => w.total), 1), [workloads]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Users className="h-4 w-4 text-indigo-600" />
            Team Workload
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3 space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-6 w-full rounded" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (workloads.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Users className="h-4 w-4 text-indigo-600" />
            Team Workload
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <p className="text-xs text-muted-foreground">No open tasks assigned.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Users className="h-4 w-4 text-indigo-600" />
          Team Workload
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        {workloads.map((member) => {
          const barPercent = (member.total / maxCount) * 100;
          const highPercent = (member.high / member.total) * 100;
          const medPercent = (member.medium / member.total) * 100;

          return (
            <div key={member.id} className="flex items-center gap-2">
              <span className="text-xs font-medium w-28 truncate shrink-0" title={member.name}>
                {member.name}
              </span>
              <div className="flex-1 h-5 bg-gray-100 rounded-md overflow-hidden relative">
                <div
                  className="h-full flex rounded-md overflow-hidden"
                  style={{ width: `${barPercent}%` }}
                >
                  {member.high > 0 && (
                    <div className="bg-red-400 h-full" style={{ width: `${highPercent}%` }} />
                  )}
                  {member.medium > 0 && (
                    <div className="bg-amber-400 h-full" style={{ width: `${medPercent}%` }} />
                  )}
                  {member.low > 0 && <div className="bg-gray-400 h-full flex-1" />}
                </div>
              </div>
              <span className="text-xs font-bold tabular-nums w-6 text-right shrink-0">
                {member.total}
              </span>
            </div>
          );
        })}

        {/* Legend */}
        <div className="flex items-center gap-3 pt-1 border-t mt-2">
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-red-400" />
            <span className="text-[10px] text-muted-foreground">High</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="text-[10px] text-muted-foreground">Medium</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-2 w-2 rounded-full bg-gray-400" />
            <span className="text-[10px] text-muted-foreground">Low</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
