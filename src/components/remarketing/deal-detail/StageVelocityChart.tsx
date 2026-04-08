/**
 * StageVelocityChart — Shows how long a deal spent in each stage.
 *
 * Queries deal_activities for stage_change events and renders a horizontal
 * bar chart using colored div segments.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { differenceInDays, differenceInHours } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Timer } from 'lucide-react';

interface StageVelocityChartProps {
  dealId: string;
}

interface StageChangeActivity {
  id: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

interface StageDuration {
  name: string;
  days: number;
  hours: number;
  isCurrent: boolean;
}

const STAGE_COLORS: Record<string, string> = {
  Sourced: 'bg-slate-400',
  Qualified: 'bg-blue-400',
  'NDA Sent': 'bg-indigo-400',
  'NDA Signed': 'bg-violet-500',
  'Fee Agreement Sent': 'bg-purple-400',
  'Fee Agreement Signed': 'bg-purple-600',
  'Due Diligence': 'bg-amber-500',
  'LOI Submitted': 'bg-orange-500',
  'Under Contract': 'bg-emerald-500',
  'Closed Won': 'bg-green-600',
  'Closed Lost': 'bg-red-500',
};

function getStageColor(stage: string): string {
  return STAGE_COLORS[stage] ?? 'bg-gray-400';
}

function formatDuration(days: number, hours: number): string {
  if (days === 0 && hours === 0) return '< 1 hour';
  if (days === 0) return `${hours}h`;
  if (days === 1) return '1 day';
  return `${days} days`;
}

export function StageVelocityChart({ dealId }: StageVelocityChartProps) {
  const { data: activities, isLoading } = useQuery({
    queryKey: ['stage-velocity', dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_activities')
        .select('id, created_at, metadata')
        .eq('deal_id', dealId)
        .eq('activity_type', 'stage_change')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as StageChangeActivity[];
    },
    enabled: !!dealId,
    staleTime: 2 * 60 * 1000,
  });

  const stages = useMemo<StageDuration[]>(() => {
    if (!activities || activities.length === 0) return [];

    const result: StageDuration[] = [];
    const now = new Date();

    for (let i = 0; i < activities.length; i++) {
      const activity = activities[i];
      const meta = activity.metadata as Record<string, unknown> | null;
      const stageName =
        (meta?.new_stage as string) ??
        (meta?.to_stage as string) ??
        (meta?.stage_name as string) ??
        'Unknown';

      const startDate = new Date(activity.created_at);
      const endDate = i < activities.length - 1 ? new Date(activities[i + 1].created_at) : now;

      const isCurrent = i === activities.length - 1;
      const days = differenceInDays(endDate, startDate);
      const hours = differenceInHours(endDate, startDate) % 24;

      result.push({ name: stageName, days, hours, isCurrent });
    }

    return result;
  }, [activities]);

  const maxDays = useMemo(() => {
    if (stages.length === 0) return 1;
    return Math.max(...stages.map((s) => s.days + (s.hours > 0 ? 1 : 0)), 1);
  }, [stages]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Timer className="h-4 w-4 text-blue-600" />
            Stage Velocity
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-6 w-full rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (stages.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-3 px-4">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Timer className="h-4 w-4 text-blue-600" />
            Stage Velocity
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <p className="text-xs text-muted-foreground">No stage changes recorded yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-3 px-4">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Timer className="h-4 w-4 text-blue-600" />
          Stage Velocity
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3 space-y-2">
        {/* Stacked bar */}
        <div className="flex h-5 w-full rounded-md overflow-hidden">
          {stages.map((stage, i) => {
            const widthPercent = Math.max(
              ((stage.days + (stage.hours > 0 ? 1 : 0)) / maxDays) * 100,
              4,
            );
            return (
              <div
                key={i}
                className={`${getStageColor(stage.name)} ${stage.isCurrent ? 'opacity-70 animate-pulse' : ''}`}
                style={{ width: `${widthPercent}%` }}
                title={`${stage.name}: ${formatDuration(stage.days, stage.hours)}${stage.isCurrent ? ' (current)' : ''}`}
              />
            );
          })}
        </div>

        {/* Legend / detail rows */}
        <div className="space-y-1 mt-2">
          {stages.map((stage, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <div className={`h-2.5 w-2.5 rounded-sm shrink-0 ${getStageColor(stage.name)}`} />
              <span className="font-medium truncate flex-1">{stage.name}</span>
              <span
                className={`tabular-nums shrink-0 ${
                  stage.isCurrent ? 'text-blue-600 font-semibold' : 'text-muted-foreground'
                }`}
              >
                {formatDuration(stage.days, stage.hours)}
                {stage.isCurrent && ' (current)'}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
