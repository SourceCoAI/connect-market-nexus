import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { untypedFrom } from '@/integrations/supabase/client';

export interface CallScore {
  id: string;
  contact_activity_id: string;
  rep_name: string;
  contact_name: string | null;
  company_name: string | null;
  call_date: string | null;
  call_duration_seconds: number | null;
  recording_url: string | null;
  disposition: string | null;
  composite_score: number | null;
  opener_tone: number | null;
  call_structure: number | null;
  discovery_quality: number | null;
  objection_handling: number | null;
  closing_next_step: number | null;
  value_proposition: number | null;
  ai_summary: string | null;
}

interface UseCallHighlightsOptions {
  repName: string | null;
  dateRange: { from: Date; to: Date } | null;
}

export function useCallHighlights({ repName, dateRange }: UseCallHighlightsOptions) {
  return useQuery<{ top: CallScore[]; bottom: CallScore[] }>({
    queryKey: ['call-highlights', repName, dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      let query = untypedFrom('call_scores')
        .select('*')
        .not('composite_score', 'is', null);

      if (repName && repName !== 'All Reps') {
        query = query.eq('rep_name', repName);
      }

      if (dateRange?.from) {
        query = query.gte('call_date', dateRange.from.toISOString());
      }
      if (dateRange?.to) {
        query = query.lte('call_date', dateRange.to.toISOString());
      }

      const { data, error } = await query.order('composite_score', { ascending: false });

      if (error) {
        console.error('Error fetching call highlights:', error);
        return { top: [], bottom: [] };
      }

      const scores = (data || []) as CallScore[];
      const top = scores.slice(0, 3);
      const bottom = scores.length > 3
        ? scores.slice(-3).reverse()
        : [];

      return { top, bottom };
    },
    enabled: true,
    staleTime: 60_000,
  });
}

export async function generateCallSummary(callScore: CallScore): Promise<string | null> {
  if (callScore.ai_summary) return callScore.ai_summary;

  try {
    const { data, error } = await supabase.functions.invoke('generate-call-summary', {
      body: {
        call_score_id: callScore.id,
        composite_score: callScore.composite_score,
        opener_tone: callScore.opener_tone,
        call_structure: callScore.call_structure,
        discovery_quality: callScore.discovery_quality,
        objection_handling: callScore.objection_handling,
        closing_next_step: callScore.closing_next_step,
        value_proposition: callScore.value_proposition,
        disposition: callScore.disposition,
      },
    });

    if (error) {
      console.error('Error generating call summary:', error);
      return null;
    }

    return data?.summary || null;
  } catch (err) {
    console.error('Failed to generate call summary:', err);
    return null;
  }
}
