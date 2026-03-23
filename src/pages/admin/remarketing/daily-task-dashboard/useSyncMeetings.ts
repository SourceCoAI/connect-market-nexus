import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { DAILY_TASKS_QUERY_KEY } from '@/hooks/useDailyTasks';

export function useSyncMeetings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-standup-meetings', {
        body: { lookback_hours: 168 },
      });
      if (error) throw error;
      return data as {
        newly_processed: number;
        transcripts_checked: number;
        already_processed?: number;
        failed?: number;
        results?: { title: string; success: boolean; error?: string }[];
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [DAILY_TASKS_QUERY_KEY] });
      const parts = [`Checked ${data.transcripts_checked} meetings`];
      if (data.already_processed) parts.push(`${data.already_processed} already processed`);
      if (data.newly_processed) parts.push(`${data.newly_processed} newly extracted`);
      else parts.push('no new meetings to process');
      if (data.failed) parts.push(`${data.failed} failed`);
      toast({
        title: 'Meetings synced',
        description: parts.join(', ') + '.',
        ...(data.failed ? { variant: 'destructive' as const } : {}),
      });
    },
    onError: (err) => {
      toast({
        title: 'Sync failed',
        description: err instanceof Error ? err.message : 'Could not sync meetings from Fireflies',
        variant: 'destructive',
      });
    },
  });
}
