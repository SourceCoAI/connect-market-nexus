import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase, SUPABASE_PUBLISHABLE_KEY } from '@/integrations/supabase/client';
import { invokeWithTimeout } from '@/lib/invoke-with-timeout';
import { useGuideGenerationState } from '@/hooks/remarketing/useGuideGenerationState';
import type { ErrorDetails } from '../GuideGenerationErrorPanel';
import type { GenerationSummary } from '../GenerationSummaryPanel';

import type {
  GenerationState,
  QualityResult,
  ExtractedCriteria,
  ClarificationContext,
  AIResearchSectionProps,
} from './types';
import type { TargetBuyerTypeConfig } from '@/types/remarketing';
import { getSessionToken, saveGuideToDocuments } from './helpers';

interface UseGenerationEngineParams {
  universeId: AIResearchSectionProps['universeId'];
  universeName: AIResearchSectionProps['universeName'];
  existingContent: AIResearchSectionProps['existingContent'];
  onGuideGenerated: AIResearchSectionProps['onGuideGenerated'];
  onDocumentAdded: AIResearchSectionProps['onDocumentAdded'];
  industryName: string;
  industryDescription: string;
}

export const useGenerationEngine = ({
  universeId,
  universeName,
  existingContent,
  onGuideGenerated,
  onDocumentAdded,
  industryName,
  industryDescription,
}: UseGenerationEngineParams) => {
  const [state, setState] = useState<GenerationState>('idle');
  const [currentPhase, setCurrentPhase] = useState(0);
  const [totalPhases, setTotalPhases] = useState(14);
  const [phaseName, setPhaseName] = useState('');
  const [content, setContent] = useState(existingContent || '');
  const [wordCount, setWordCount] = useState(0);
  const [qualityResult, setQualityResult] = useState<QualityResult | null>(null);
  const [, setExtractedCriteria] = useState<ExtractedCriteria | null>(null);
  const [missingElements, setMissingElements] = useState<string[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const {
    isLoadingProgress,
    saveProgress: saveProgressToDb,
    markCompleted: markCompletedInDb,
    clearProgress: clearProgressInDb,
    getResumableProgress,
  } = useGuideGenerationState(universeId);

  const [errorDetails, setErrorDetails] = useState<ErrorDetails | null>(null);
  const [generationSummary, setGenerationSummary] = useState<GenerationSummary | null>(null);
  const generationStartTimeRef = useRef<number>(0);
  const lastClarificationContextRef = useRef<ClarificationContext>({});
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  const [completedDocumentUrl, setCompletedDocumentUrl] = useState<string | null>(null);

  const MAX_BATCH_RETRIES = 5;
  const batchRetryCountRef = useRef<Record<number, number>>({});
  const nextBatchInfo = useRef<{
    index: number;
    content: string;
    clarificationContext: ClarificationContext;
  } | null>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const pollStartTimeRef = useRef<number | null>(null);
  const [, setIsExtracting] = useState(false);

  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(13);
  const [savedProgress, setSavedProgress] = useState<{
    industryName: string;
    batchIndex: number;
    content: string;
    clarificationContext: ClarificationContext;
  } | null>(null);

  // Sync existingContent
  useEffect(() => {
    if (existingContent) {
      setContent(existingContent);
      setWordCount(existingContent.split(/\s+/).length);
    }
  }, [existingContent]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  // Check for existing generation on mount
  const checkExistingGenerationRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (universeId) checkExistingGenerationRef.current?.();
  }, [universeId]);

  const resumeBackgroundGeneration = (generationId: string) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollStartTimeRef.current = Date.now();
    const MAX_POLLING_DURATION_MS = 10 * 60 * 1000;
    pollIntervalRef.current = window.setInterval(async () => {
      if (
        pollStartTimeRef.current &&
        Date.now() - pollStartTimeRef.current > MAX_POLLING_DURATION_MS
      ) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        pollStartTimeRef.current = null;
        setState('error');
        setErrorDetails({
          code: 'polling_timeout',
          message: 'Background generation exceeded 10-minute timeout.',
          batchIndex: 0,
          isRecoverable: true,
          savedWordCount: wordCount,
          timestamp: Date.now(),
        });
        toast.error('Generation timed out after 10 minutes. Please try regenerating.');
        return;
      }
      const { data: generation, error } = await supabase
        .from('ma_guide_generations')
        .select('*')
        .eq('id', generationId)
        .maybeSingle();
      if (error) {
        return;
      }
      if (!generation) return;
      setCurrentPhase(generation.phases_completed);
      setTotalPhases(generation.total_phases);
      setPhaseName(generation.current_phase || '');
      const generatedContent = generation.generated_content as {
        content?: string;
        criteria?: ExtractedCriteria;
      } | null;
      if (generatedContent?.content) {
        setContent(generatedContent.content);
        setWordCount(generatedContent.content.split(/\s+/).length);
      }
      if (generation.status === 'completed') {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        pollStartTimeRef.current = null;
        setState('complete');
        const finalContent = generatedContent?.content || '';
        const criteria = generatedContent?.criteria;
        setContent(finalContent);
        setWordCount(finalContent.split(/\s+/).length);
        if (criteria) {
          setExtractedCriteria(criteria);
          onGuideGenerated(finalContent, criteria, criteria.target_buyer_types);
        }
        if (finalContent && universeId && onDocumentAdded) {
          saveGuideToDocuments(
            finalContent,
            industryName || universeName || 'M&A Guide',
            universeId,
            onDocumentAdded,
            (url) => setCompletedDocumentUrl(url),
          );
        }
        setShowCompletionDialog(true);
      }
      if (generation.status === 'failed') {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        pollStartTimeRef.current = null;
        setState('error');
        setErrorDetails({
          code: 'generation_failed',
          message: generation.error || 'Generation failed',
          batchIndex: 0,
          isRecoverable: true,
          savedWordCount: 0,
          timestamp: Date.now(),
        });
        toast.error(`Generation failed: ${generation.error}`);
      }
    }, 2000);
  };

  const checkExistingGeneration = async () => {
    if (!universeId) return;
    try {
      const { data: activeGen, error: activeError } = await supabase
        .from('ma_guide_generations')
        .select('*')
        .eq('universe_id', universeId)
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false })
        .limit(1);
      if (!activeError && activeGen && activeGen.length > 0) {
        const generation = activeGen[0];
        toast.info('Resuming M&A guide generation in progress...');
        // Note: caller should handle setIsOpen(true)
        setCurrentPhase(generation.phases_completed || 0);
        setTotalPhases(generation.total_phases || 14);
        setPhaseName(generation.current_phase || 'Resuming...');
        const generatedContent = generation.generated_content as {
          content?: string;
          criteria?: ExtractedCriteria;
        } | null;
        if (generatedContent?.content) {
          setContent(generatedContent.content);
          setWordCount(generatedContent.content.split(/\s+/).length);
        }
        setState('generating');
        resumeBackgroundGeneration(generation.id);
        return;
      }
      const { data: completedGen, error: completedError } = await supabase
        .from('ma_guide_generations')
        .select('*')
        .eq('universe_id', universeId)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(1);
      if (!completedError && completedGen && completedGen.length > 0) {
        const completed = completedGen[0];
        const generatedContent = completed.generated_content as {
          content?: string;
          criteria?: ExtractedCriteria;
        } | null;
        if (generatedContent?.content) {
          setState('complete');
          setContent(generatedContent.content);
          setWordCount(generatedContent.content.split(/\s+/).length);
          if (generatedContent.criteria) {
            setExtractedCriteria(generatedContent.criteria);
            onGuideGenerated(
              generatedContent.content,
              generatedContent.criteria,
              generatedContent.criteria.target_buyer_types,
            );
          }
          return;
        }
      }
      if (existingContent && existingContent.length > 500) setState('complete');
    } catch (err) {
      /* check failed — will re-attempt on next load */ void err;
    }
  };
  checkExistingGenerationRef.current = checkExistingGeneration;

  // Progress management
  useEffect(() => {
    if (!isLoadingProgress) {
      const dbResumable = getResumableProgress();
      if (dbResumable && dbResumable.content) {
        setSavedProgress({
          industryName: universeName || industryName,
          batchIndex: dbResumable.batchIndex,
          content: dbResumable.content,
          clarificationContext: {},
        });
        return;
      }
    }
    const saved = localStorage.getItem('ma_guide_progress');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.industryName === industryName || parsed.industryName === universeName)
          setSavedProgress(parsed);
      } catch {
        localStorage.removeItem('ma_guide_progress');
      }
    }
  }, [industryName, universeName, isLoadingProgress, getResumableProgress]);

  const clearProgress = () => {
    localStorage.removeItem('ma_guide_progress');
    setSavedProgress(null);
    clearProgressInDb();
  };

  const saveProgressBoth = (progressData: {
    industryName: string;
    batchIndex: number;
    content: string;
    clarificationContext: ClarificationContext;
    lastPhaseId?: string;
    lastPhase?: number;
    wordCount?: number;
  }) => {
    localStorage.setItem('ma_guide_progress', JSON.stringify(progressData));
    setSavedProgress(progressData);
    saveProgressToDb(progressData);
  };

  const handleBackgroundGenerate = async (clarificationContext: ClarificationContext) => {
    setState('generating');
    setCurrentPhase(0);
    setContent('');
    setWordCount(0);
    setErrorDetails(null);
    setGenerationSummary(null);
    generationStartTimeRef.current = Date.now();
    try {
      if (universeId && Object.keys(clarificationContext).length > 0) {
        const { error: ctxError } = await supabase
          .from('buyer_universes')
          .update({ ma_guide_qa_context: clarificationContext })
          .eq('id', universeId);
        if (ctxError) throw ctxError;
      }
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = sessionData?.session?.access_token;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-ma-guide-background`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${token || SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ universe_id: universeId }),
        },
      );
      if (!response.ok) throw new Error(`Failed to start generation: ${response.statusText}`);
      const data = await response.json();
      toast.success(
        'Guide generation started in background. You can navigate away - it will continue.',
      );
      resumeBackgroundGeneration(data.generation_id);
    } catch (error: unknown) {
      setState('error');
      toast.error((error as Error).message || 'Failed to start background generation');
    }
  };

  const generateBatch = async (
    batchIndex: number,
    previousContent: string,
    clarificationContext: ClarificationContext,
  ) => {
    let batchWordCount = previousContent ? previousContent.split(/\s+/).length : 0;
    try {
      setCurrentBatch(batchIndex);
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-ma-guide`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await getSessionToken()}`,
          },
          body: JSON.stringify({
            industry_name: industryName,
            industry_description: industryDescription || undefined,
            existing_content: existingContent,
            clarification_context: clarificationContext,
            stream: true,
            batch_index: batchIndex,
            previous_content: previousContent,
          }),
          signal: abortControllerRef.current?.signal,
        },
      );
      if (!response.ok) {
        if (response.status === 402) {
          toast.error('AI credits depleted.', { duration: 10000 });
          setState('error');
          return;
        }
        if (response.status === 429) {
          toast.warning('Rate limit reached.');
          setState('error');
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      if (!response.body) throw new Error('No response body');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = previousContent;
      let sawBatchComplete = false;
      let parseErrorCount = 0;
      const PARSE_ERROR_THRESHOLD = 5;
      let accumulatedWordCount = previousContent ? previousContent.split(/\s+/).length : 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';
        for (const block of blocks) {
          const dataLines = block
            .split('\n')
            .filter((l) => l.startsWith('data: '))
            .map((l) => l.slice(6));
          if (dataLines.length === 0) continue;
          const jsonStr = dataLines.join('\n').trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;
          try {
            const event = JSON.parse(jsonStr);
            switch (event.type) {
              case 'heartbeat':
                break;
              case 'batch_start':
                setTotalBatches(event.total_batches);
                setCurrentBatch(event.batch_index);
                break;
              case 'phase_start':
                setCurrentPhase(event.phase);
                setTotalPhases(event.total);
                setPhaseName(event.name);
                break;
              case 'content':
                fullContent += event.content;
                accumulatedWordCount = fullContent.split(/\s+/).length;
                batchWordCount = accumulatedWordCount;
                setContent(fullContent);
                setWordCount(accumulatedWordCount);
                if (contentRef.current)
                  contentRef.current.scrollTop = contentRef.current.scrollHeight;
                break;
              case 'phase_complete':
                accumulatedWordCount = event.wordCount || fullContent.split(/\s+/).length;
                batchWordCount = accumulatedWordCount;
                setWordCount(accumulatedWordCount);
                if (event.content) {
                  fullContent = event.content;
                  accumulatedWordCount = fullContent.split(/\s+/).length;
                  saveProgressBoth({
                    industryName,
                    batchIndex,
                    content: event.content,
                    clarificationContext,
                    lastPhaseId: event.phaseId,
                    lastPhase: event.phase,
                    wordCount: accumulatedWordCount,
                  });
                }
                break;
              case 'batch_complete':
                sawBatchComplete = true;
                if (batchRetryCountRef.current[batchIndex])
                  delete batchRetryCountRef.current[batchIndex];
                if (!event.is_final && event.next_batch_index !== null) {
                  nextBatchInfo.current = {
                    index: event.next_batch_index,
                    content: event.content,
                    clarificationContext,
                  };
                  saveProgressBoth({
                    industryName,
                    batchIndex: event.next_batch_index,
                    content: event.content,
                    clarificationContext,
                    lastPhaseId: `batch_${batchIndex}_complete`,
                    lastPhase: batchIndex + 1,
                    wordCount: event.wordCount || event.content?.split(/\s+/).length || 0,
                  });
                }
                break;
              case 'quality_check_start':
                setState('quality_check');
                break;
              case 'quality_check_result':
                setQualityResult(event.result);
                break;
              case 'gap_fill_start':
                setState('gap_filling');
                setMissingElements(event.missingElements || []);
                break;
              case 'gap_fill_complete':
              case 'final_quality':
                if (event.result) setQualityResult(event.result);
                break;
              case 'criteria_extraction_start':
                break;
              case 'criteria':
                setExtractedCriteria(event.criteria);
                break;
              case 'complete': {
                setState('complete');
                const finalContent = event.content || fullContent;
                const finalWordCount = event.totalWords || finalContent.split(/\s+/).length;
                setContent(finalContent);
                setWordCount(finalWordCount);
                localStorage.removeItem('ma_guide_progress');
                setSavedProgress(null);
                markCompletedInDb();
                setGenerationSummary({
                  outcome: 'success',
                  startTime: generationStartTimeRef.current,
                  endTime: Date.now(),
                  batchesCompleted: totalBatches,
                  totalBatches,
                  wordCount: finalWordCount,
                  isRecoverable: false,
                });
                toast.success('M&A Guide generated successfully!');
                if (universeId && onDocumentAdded)
                  saveGuideToDocuments(finalContent, industryName, universeId, onDocumentAdded);
                break;
              }
              case 'error': {
                const errorCode = event.error_code || 'unknown';
                setErrorDetails({
                  code: errorCode,
                  message: event.message || 'Unknown error',
                  batchIndex: event.batch_index ?? batchIndex,
                  phaseName: phaseName || undefined,
                  isRecoverable: event.recoverable ?? true,
                  retryAfterMs: event.retry_after_ms,
                  savedWordCount: event.saved_word_count || fullContent.split(/\s+/).length,
                  timestamp: Date.now(),
                });
                if (errorCode === 'payment_required') {
                  toast.error('AI credits depleted.', { duration: 10000 });
                  setState('error');
                  return;
                }
                if (errorCode === 'rate_limited') {
                  const rateLimitErr = new Error(event.message) as Error & {
                    isRateLimited: boolean;
                    retryAfterMs: number;
                  };
                  rateLimitErr.isRateLimited = true;
                  rateLimitErr.retryAfterMs = event.retry_after_ms || 30000;
                  throw rateLimitErr;
                }
                throw new Error(event.message);
              }
              case 'timeout_warning':
                toast.warning(event.message || 'Approaching time limit, saving progress...', {
                  duration: 5000,
                });
                break;
            }
          } catch (e) {
            parseErrorCount++;
            if (parseErrorCount === PARSE_ERROR_THRESHOLD)
              toast.warning(`Detected ${PARSE_ERROR_THRESHOLD} stream parsing errors.`, {
                duration: 8000,
              });
          }
        }
      }

      if (!sawBatchComplete) {
        const timeoutError = new Error(
          `Stream ended unexpectedly during batch ${batchIndex + 1}.`,
        ) as Error & { code: string };
        timeoutError.code = 'function_timeout';
        throw timeoutError;
      }
      if (nextBatchInfo.current) {
        const { index, content: nextContent, clarificationContext: ctx } = nextBatchInfo.current;
        nextBatchInfo.current = null;
        const interBatchDelay = index >= 11 ? 5000 : index >= 8 ? 3000 : 1000;
        await new Promise((r) => setTimeout(r, interBatchDelay));
        toast.info(`Batch ${batchIndex + 1} complete, starting batch ${index + 1}...`);
        abortControllerRef.current = new AbortController();
        await generateBatch(index, nextContent, ctx);
        return;
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        setGenerationSummary({
          outcome: 'cancelled',
          startTime: generationStartTimeRef.current,
          endTime: Date.now(),
          batchesCompleted: batchIndex,
          totalBatches,
          wordCount,
          isRecoverable: true,
        });
        toast.info('Generation cancelled');
        setState('idle');
        setErrorDetails(null);
      } else {
        const typedError = error as Error & {
          code?: string;
          isRateLimited?: boolean;
          retryAfterMs?: number;
        };
        const message = typedError.message || 'Unknown error';
        const errorCode = typedError.code || 'unknown';
        const isStreamCutoff =
          message.includes('Stream ended unexpectedly') || errorCode === 'function_timeout';
        const isRateLimited =
          typedError.isRateLimited ||
          message.includes('Rate limit') ||
          message.includes('rate_limited') ||
          message.includes('RESOURCE_EXHAUSTED');
        const currentRetries = batchRetryCountRef.current[batchIndex] ?? 0;
        if (
          state === 'generating' &&
          (isStreamCutoff || isRateLimited) &&
          currentRetries < MAX_BATCH_RETRIES
        ) {
          batchRetryCountRef.current[batchIndex] = currentRetries + 1;
          const baseBackoff = isRateLimited
            ? 30000
            : Math.min(5000 * Math.pow(2, currentRetries), 30000);
          const batchPenalty = batchIndex >= 8 ? 5000 * (batchIndex - 7) : 0;
          const backoffMs = typedError.retryAfterMs || baseBackoff + batchPenalty;
          toast.info(
            isRateLimited
              ? `Rate limit hit. Waiting ${Math.round(backoffMs / 1000)}s before retry (${currentRetries + 1}/${MAX_BATCH_RETRIES})...`
              : `Batch ${batchIndex + 1} timeout. Retrying (${currentRetries + 1}/${MAX_BATCH_RETRIES})...`,
          );
          await new Promise((r) => setTimeout(r, backoffMs));
          abortControllerRef.current = new AbortController();
          await generateBatch(batchIndex, previousContent, clarificationContext);
          return;
        }
        const outcomeType = isRateLimited ? 'rate_limited' : isStreamCutoff ? 'timeout' : 'error';
        setGenerationSummary({
          outcome: outcomeType,
          startTime: generationStartTimeRef.current,
          endTime: Date.now(),
          batchesCompleted: batchIndex,
          totalBatches,
          wordCount: batchWordCount,
          errorMessage: message,
          isRecoverable: isRateLimited || isStreamCutoff,
        });
        if (!errorDetails)
          setErrorDetails({
            code: isRateLimited ? 'rate_limited' : isStreamCutoff ? 'function_timeout' : errorCode,
            message,
            batchIndex,
            phaseName: phaseName || undefined,
            isRecoverable: isRateLimited || isStreamCutoff,
            retryAfterMs: isRateLimited ? typedError.retryAfterMs || 30000 : undefined,
            savedWordCount: batchWordCount,
            timestamp: Date.now(),
          });
        setState('error');
      }
    }
  };

  const handleGenerate = async (clarificationContext: ClarificationContext) => {
    if (universeId) {
      await handleBackgroundGenerate(clarificationContext);
      return;
    }
    setState('generating');
    setCurrentPhase(0);
    setCurrentBatch(0);
    setContent('');
    setWordCount(0);
    setQualityResult(null);
    setExtractedCriteria(null);
    setMissingElements([]);
    setErrorDetails(null);
    setGenerationSummary(null);
    clearProgress();
    lastClarificationContextRef.current = clarificationContext;
    generationStartTimeRef.current = Date.now();
    batchRetryCountRef.current = {};
    abortControllerRef.current = new AbortController();
    await generateBatch(0, '', clarificationContext);
  };

  const resumeGeneration = (progress: typeof savedProgress) => {
    if (!progress) return;
    setState('generating');
    setCurrentBatch(progress.batchIndex);
    setContent(progress.content);
    setWordCount(progress.content.split(/\s+/).length);
    setGenerationSummary(null);
    if (!generationStartTimeRef.current) generationStartTimeRef.current = Date.now();
    abortControllerRef.current = new AbortController();
    toast.info(`Resuming from batch ${progress.batchIndex + 1}...`);
    generateBatch(progress.batchIndex, progress.content, progress.clarificationContext);
  };

  const handleCancel = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    setState('idle');
    setErrorDetails(null);
  };

  const handleExtractCriteria = async () => {
    const guideContent = existingContent || content;
    if (!guideContent || guideContent.length < 1000) {
      toast.error('Guide must have at least 1,000 characters');
      return;
    }
    if (!universeId) {
      toast.error('Universe ID is required');
      return;
    }
    setIsExtracting(true);
    try {
      const { data, error } = await invokeWithTimeout<Record<string, unknown>>(
        'extract-buyer-criteria',
        {
          body: {
            universe_id: universeId,
            guide_content: guideContent,
            source_name: `${universeName || industryName} M&A Guide`,
            industry_name: universeName || industryName,
          },
          timeoutMs: 120_000,
        },
      );
      if (error) {
        if (error.message?.includes('402')) {
          toast.error('AI credits depleted.', { duration: 10000 });
          return;
        }
        if (error.message?.includes('429')) {
          toast.warning('Rate limit reached.');
          return;
        }
        throw error;
      }
      if (!data?.success) throw new Error((data?.error as string) || 'Extraction failed');
      const criteria = data.criteria as Record<string, unknown> | undefined;
      const mappedCriteria: ExtractedCriteria = {
        size_criteria: criteria?.size_criteria as ExtractedCriteria['size_criteria'],
        geography_criteria: criteria?.geography_criteria as ExtractedCriteria['geography_criteria'],
        service_criteria: criteria?.service_criteria as ExtractedCriteria['service_criteria'],
        buyer_types_criteria: criteria?.buyer_types_criteria as ExtractedCriteria['buyer_types_criteria'],
      };
      setExtractedCriteria(mappedCriteria);
      onGuideGenerated(guideContent as string, mappedCriteria, data.target_buyer_types as TargetBuyerTypeConfig[] | undefined);
      toast.success(`Criteria extracted successfully (${data.confidence || 0}% confidence)`, {
        duration: 5000,
      });
    } catch (error) {
      toast.error(`Failed to extract criteria: ${(error as Error).message}`);
    } finally {
      setIsExtracting(false);
    }
  };
  void handleExtractCriteria;

  const handleErrorRetry = () => {
    setErrorDetails(null);
    handleGenerate(lastClarificationContextRef.current);
  };

  const handleErrorResume = () => {
    if (savedProgress) {
      setErrorDetails(null);
      resumeGeneration(savedProgress);
    } else if (content && errorDetails) {
      setErrorDetails(null);
      setState('generating');
      abortControllerRef.current = new AbortController();
      generateBatch(errorDetails.batchIndex, content, lastClarificationContextRef.current);
    }
  };

  const handleErrorCancel = () => {
    setErrorDetails(null);
    setState('idle');
  };

  return {
    // State
    state,
    setState,
    currentPhase,
    totalPhases,
    phaseName,
    content,
    wordCount,
    qualityResult,
    missingElements,
    contentRef,
    errorDetails,
    generationSummary,
    setGenerationSummary,
    showCompletionDialog,
    setShowCompletionDialog,
    completedDocumentUrl,
    currentBatch,
    totalBatches,
    savedProgress,

    // Actions
    handleGenerate,
    handleCancel,
    resumeGeneration,
    clearProgress,
    handleErrorRetry,
    handleErrorResume,
    handleErrorCancel,
  };
};
