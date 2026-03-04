import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface BackgroundScoringState {
  isScoring: boolean;
  currentCount: number;
  expectedCount: number;
  progress: number;
}

export function useBackgroundScoringProgress(listingId: string, universeId?: string) {
  const queryClient = useQueryClient();
  const [scoringState, setScoringState] = useState<BackgroundScoringState>({
    isScoring: false,
    currentCount: 0,
    expectedCount: 0,
    progress: 0,
  });

  // Get expected buyer count for universe
  const { data: expectedCount } = useQuery({
    queryKey: ['remarketing', 'buyer-count', universeId],
    queryFn: async () => {
      if (!universeId) return 0;
      const { count } = await supabase
        .from('buyers')
        .select('*', { count: 'exact', head: true })
        .eq('universe_id', universeId)
        .eq('archived', false);
      return count || 0;
    },
    enabled: !!universeId,
  });

  // Poll for current score count during active scoring
  const { data: currentCount, refetch: refetchScores } = useQuery({
    queryKey: ['remarketing', 'score-count', listingId, universeId],
    queryFn: async () => {
      let query = supabase
        .from('remarketing_scores')
        .select('*', { count: 'exact', head: true })
        .eq('listing_id', listingId);

      if (universeId) {
        query = query.eq('universe_id', universeId);
      }

      const { count } = await query;
      return count || 0;
    },
    refetchInterval: scoringState.isScoring ? 2000 : false, // Poll every 2s when scoring
  });

  // Start scoring session
  const startScoring = useCallback((expectedBuyerCount: number) => {
    setScoringState({
      isScoring: true,
      currentCount: 0,
      expectedCount: expectedBuyerCount,
      progress: 0,
    });
  }, []);

  // End scoring session
  const endScoring = useCallback(() => {
    setScoringState((prev) => ({
      ...prev,
      isScoring: false,
      progress: 100,
    }));
    // Invalidate scores to refresh the list
    queryClient.invalidateQueries({ queryKey: ['remarketing', 'scores', listingId] });
  }, [queryClient, listingId]);

  // Update progress when count changes
  useEffect(() => {
    if (scoringState.isScoring && currentCount !== undefined && expectedCount) {
      const progress = Math.min(100, Math.round((currentCount / expectedCount) * 100));
      setScoringState((prev) => ({
        ...prev,
        currentCount,
        expectedCount: expectedCount,
        progress,
      }));

      // Auto-end when complete
      if (currentCount >= expectedCount) {
        setTimeout(() => endScoring(), 1000); // Small delay for UX
      }
    }
  }, [currentCount, expectedCount, scoringState.isScoring, endScoring]);

  return {
    ...scoringState,
    startScoring,
    endScoring,
    refetchScores,
  };
}

export default useBackgroundScoringProgress;
