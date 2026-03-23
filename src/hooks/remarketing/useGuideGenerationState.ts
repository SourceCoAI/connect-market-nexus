import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface GuideProgress {
  industryName: string;
  batchIndex: number;
  content: string;
  clarificationContext?: Record<string, unknown>;
  lastPhaseId?: string;
  lastPhase?: number;
  wordCount?: number;
}

interface GenerationState {
  id: string;
  universe_id: string;
  status: string | null;
  current_batch: number | null;
  current_phase: number | null;
  phase_name: string | null;
  saved_content: string | null;
  last_error: string | Record<string, unknown> | null;
  updated_at: string | null;
}

/**
 * Hook to persist guide generation progress to the database.
 * This ensures progress survives page reloads and navigation.
 */
export function useGuideGenerationState(universeId: string | undefined) {
  const [dbProgress, setDbProgress] = useState<GenerationState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load existing progress on mount
  useEffect(() => {
    if (!universeId) {
      setIsLoading(false);
      return undefined;
    }

    let active = true;

    const loadProgress = async () => {
      try {
        const { data, error } = await supabase
          .from('remarketing_guide_generation_state')
          .select('*')
          .eq('universe_id', universeId)
          .maybeSingle();

        if (!active) return;

        if (error) {
          console.error('Error loading guide progress:', error);
        } else if (data && data.status !== 'completed') {
          setDbProgress(data as unknown as GenerationState);
        }
      } catch (e) {
        console.error('Failed to load guide progress:', e);
      } finally {
        if (active) setIsLoading(false);
      }
    };

    loadProgress();
    return () => {
      active = false;
    };
  }, [universeId]);

  // Save progress to database (debounced to avoid too many writes)
  const saveProgress = useCallback(
    async (progress: GuideProgress) => {
      if (!universeId) return;

      // Clear any pending save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Debounce: save after 500ms of no changes
      saveTimeoutRef.current = setTimeout(async () => {
        try {
          const stateData = {
            universe_id: universeId,
            status: 'in_progress',
            current_batch: progress.batchIndex,
            current_phase: progress.lastPhase || progress.batchIndex,
            phase_name: progress.lastPhaseId || `batch_${progress.batchIndex}`,
            saved_content: progress.content,
            last_error: null,
            updated_at: new Date().toISOString(),
          };

          // Upsert: insert or update based on universe_id
          const { data, error } = await supabase
            .from('remarketing_guide_generation_state')
            .upsert(stateData, {
              onConflict: 'universe_id',
              ignoreDuplicates: false,
            })
            .select()
            .single();

          if (error) {
            console.error('Error saving guide progress:', error);
          } else {
            setDbProgress(data as unknown as GenerationState);
          }
        } catch (e) {
          console.error('Failed to save guide progress:', e);
        }
      }, 500);
    },
    [universeId],
  );

  // Mark generation as completed and clear progress
  const markCompleted = useCallback(async () => {
    if (!universeId) return;

    try {
      await supabase
        .from('remarketing_guide_generation_state')
        .update({
          status: 'completed',
          saved_content: null,
          updated_at: new Date().toISOString(),
        })
        .eq('universe_id', universeId);

      setDbProgress(null);
    } catch (e) {
      console.error('Failed to mark guide as completed:', e);
    }
  }, [universeId]);

  // Clear progress (for "Start Over")
  const clearProgress = useCallback(async () => {
    if (!universeId) return;

    try {
      await supabase
        .from('remarketing_guide_generation_state')
        .delete()
        .eq('universe_id', universeId);

      setDbProgress(null);
    } catch (e) {
      console.error('Failed to clear guide progress:', e);
    }
  }, [universeId]);

  // Save error state
  const saveError = useCallback(
    async (error: { message: string; batch?: number; wordCount?: number }) => {
      if (!universeId) return;

      try {
        await supabase.from('remarketing_guide_generation_state').upsert(
          {
            universe_id: universeId,
            status: 'error',
            last_error: error,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'universe_id',
            ignoreDuplicates: false,
          },
        );
      } catch (e) {
        console.error('Failed to save error state:', e);
      }
    },
    [universeId],
  );

  // Convert DB state to GuideProgress format for resume
  const getResumableProgress = useCallback((): GuideProgress | null => {
    if (!dbProgress || !dbProgress.saved_content || dbProgress.status === 'completed') {
      return null;
    }

    return {
      industryName: '', // Will be filled by component
      batchIndex: dbProgress.current_batch || 0,
      content: dbProgress.saved_content,
      lastPhaseId: dbProgress.phase_name || undefined,
      lastPhase: dbProgress.current_phase || undefined,
      wordCount: dbProgress.saved_content.split(/\s+/).length,
    };
  }, [dbProgress]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    dbProgress,
    isLoadingProgress: isLoading,
    saveProgress,
    markCompleted,
    clearProgress,
    saveError,
    getResumableProgress,
  };
}
