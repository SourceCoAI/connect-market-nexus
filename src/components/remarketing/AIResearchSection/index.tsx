import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Textarea } from '@/components/ui/textarea';
import {
  BookOpen,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  Check,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { invokeWithTimeout } from '@/lib/invoke-with-timeout';
import { GuideGenerationErrorPanel, type ErrorDetails } from '../GuideGenerationErrorPanel';
import { GenerationSummaryPanel, type GenerationSummary } from '../GenerationSummaryPanel';
import { useGuideGenerationState } from '@/hooks/remarketing/useGuideGenerationState';
import { GuideCompletionDialog } from '../GuideCompletionDialog';

import type {
  GenerationState,
  ClarifyQuestion,
  QualityResult,
  ExtractedCriteria,
  ClarificationContext,
  AIResearchSectionProps,
} from './types';
import { getSessionToken, saveGuideToDocuments } from './helpers';
import { ClarificationPanel } from './ClarificationPanel';
import { GenerationProgress } from './GenerationProgress';

// Re-export types for external consumers
export type { ExtractedCriteria, AIResearchSectionProps } from './types';

export const AIResearchSection = ({
  onGuideGenerated,
  universeName,
  existingContent,
  universeId,
  onDocumentAdded,
}: AIResearchSectionProps) => {
  const [isOpen, setIsOpen] = useState(!!existingContent && existingContent.length > 100);
  const [industryName, setIndustryName] = useState(universeName || '');
  const [industryDescription, setIndustryDescription] = useState('');
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
  const [clarifyingQuestions, setClarifyingQuestions] = useState<ClarifyQuestion[]>([]);
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<string, string | string[]>>({});
  const [clarifyingStatus, setClarifyingStatus] = useState<{
    isLoading: boolean;
    retryCount: number;
    waitingSeconds: number;
    error: string | null;
  }>({ isLoading: false, retryCount: 0, waitingSeconds: 0, error: null });
  const clarifyTimeoutRef = useRef<number | null>(null);
  void clarifyTimeoutRef;

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

  // Upload guide state
  const guideFileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingGuide, setIsUploadingGuide] = useState(false);

  const handleUploadGuide = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !universeId) return;
    const allowedTypes = ['.pdf', '.doc', '.docx', '.txt', '.html', '.htm'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!allowedTypes.includes(ext)) {
      toast.error('Please upload a PDF, Word, text, or HTML file');
      return;
    }
    setIsUploadingGuide(true);
    try {
      const fileName = `${universeId}/guides/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('universe-documents')
        .upload(fileName, file, { upsert: true });
      if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
      const { data: urlData } = supabase.storage.from('universe-documents').getPublicUrl(fileName);
      const guideDoc = {
        id: crypto.randomUUID(),
        name: file.name,
        url: urlData.publicUrl,
        uploaded_at: new Date().toISOString(),
        type: 'ma_guide',
      };
      const { data: universe, error: readError } = await supabase
        .from('buyer_universes')
        .select('documents, ma_guide_content')
        .eq('id', universeId)
        .single();
      if (readError) throw readError;
      const currentDocs =
        (universe?.documents as { type?: string; id?: string; name?: string; url?: string }[]) ||
        [];
      const filteredDocs = currentDocs.filter((d) => !d.type || d.type !== 'ma_guide');
      const updatedDocs = [...filteredDocs, guideDoc];
      const { error: updateError } = await supabase
        .from('buyer_universes')
        .update({
          documents: updatedDocs,
          ma_guide_content: `[Uploaded Guide: ${file.name}]`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', universeId);
      if (updateError) throw updateError;
      if (onDocumentAdded) onDocumentAdded(guideDoc);
      onGuideGenerated(`[Uploaded Guide: ${file.name}]`, {});
      toast.success(
        `Guide "${file.name}" uploaded successfully. Use "Enrich from Documents" or "Extract from Guide" to pull criteria.`,
      );
    } catch (err) {
      toast.error(`Failed to upload guide: ${(err as Error).message}`);
    } finally {
      setIsUploadingGuide(false);
      if (guideFileInputRef.current) guideFileInputRef.current.value = '';
    }
  };

  useEffect(() => {
    if (universeName && !industryName) setIndustryName(universeName);
  }, [universeName, industryName]);
  useEffect(() => {
    if (existingContent) {
      setContent(existingContent);
      setWordCount(existingContent.split(/\s+/).length);
    }
  }, [existingContent]);

  const checkExistingGenerationRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (universeId) checkExistingGenerationRef.current?.();
  }, [universeId]);
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

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
        setIsOpen(true);
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

  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const handleStartClarification = async () => {
    if (!industryName.trim()) {
      toast.error('Please enter an industry name');
      return;
    }
    if (existingContent && existingContent.length > 1000) {
      setShowDuplicateWarning(true);
      return;
    }
    await proceedWithClarification();
  };

  const proceedWithClarification = async () => {
    setShowDuplicateWarning(false);
    setState('clarifying');
    setClarifyingQuestions([]);
    setClarifyAnswers({});
    setClarifyingStatus({ isLoading: true, retryCount: 0, waitingSeconds: 0, error: null });
    try {
      const MAX_CLIENT_RETRIES = 3;
      const CLIENT_TIMEOUT_MS = 120000;
      let response: Response | null = null;
      let lastError: Error | null = null;
      for (let attempt = 0; attempt < MAX_CLIENT_RETRIES; attempt++) {
        setClarifyingStatus((prev) => ({ ...prev, retryCount: attempt, waitingSeconds: 0 }));
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
          response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clarify-industry`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${await getSessionToken()}`,
              },
              body: JSON.stringify({
                industry_name: industryName,
                industry_description: industryDescription || undefined,
              }),
              signal: controller.signal,
            },
          );
          clearTimeout(timeoutId);
          if (
            response.ok ||
            (response.status !== 429 && response.status !== 503 && response.status !== 504)
          )
            break;
          if (response.status === 429) {
            const waitTime = Math.min(30, 10 * (attempt + 1));
            setClarifyingStatus((prev) => ({ ...prev, waitingSeconds: waitTime }));
            for (let s = waitTime; s > 0; s--) {
              setClarifyingStatus((prev) => ({ ...prev, waitingSeconds: s }));
              await new Promise((r) => setTimeout(r, 1000));
            }
            continue;
          }
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            lastError = new Error('Request timed out. The AI service may be busy.');
            const waitTime = 10;
            setClarifyingStatus((prev) => ({ ...prev, waitingSeconds: waitTime }));
            for (let s = waitTime; s > 0; s--) {
              setClarifyingStatus((prev) => ({ ...prev, waitingSeconds: s }));
              await new Promise((r) => setTimeout(r, 1000));
            }
            continue;
          }
          throw err;
        }
      }
      if (!response) throw lastError || new Error('Failed to connect to AI service');
      if (!response.ok) {
        if (response.status === 402) {
          toast.error('AI credits depleted.', { duration: 10000 });
          setClarifyingStatus({ isLoading: false, retryCount: 0, waitingSeconds: 0, error: null });
          setState('idle');
          return;
        }
        if (response.status === 429) {
          toast.warning('Rate limit reached.');
          setClarifyingStatus({ isLoading: false, retryCount: 0, waitingSeconds: 0, error: null });
          setState('idle');
          return;
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setClarifyingQuestions(data.questions || []);
      setClarifyingStatus({ isLoading: false, retryCount: 0, waitingSeconds: 0, error: null });
      const initialAnswers: Record<string, string | string[]> = {};
      (data.questions || []).forEach((q: ClarifyQuestion) => {
        initialAnswers[q.id] = q.type === 'multiSelect' ? [] : '';
      });
      setClarifyAnswers(initialAnswers);
    } catch (error) {
      toast.error(`Failed to get clarifying questions: ${(error as Error).message}`);
      setClarifyingStatus({
        isLoading: false,
        retryCount: 0,
        waitingSeconds: 0,
        error: (error as Error).message,
      });
      setState('idle');
    }
  };

  const handleSelectOption = (questionId: string, option: string, isMulti: boolean) => {
    setClarifyAnswers((prev) => {
      if (isMulti) {
        const current = (prev[questionId] as string[]) || [];
        return current.includes(option)
          ? { ...prev, [questionId]: current.filter((o) => o !== option) }
          : { ...prev, [questionId]: [...current, option] };
      }
      return { ...prev, [questionId]: option };
    });
  };
  const handleTextAnswer = (questionId: string, value: string) => {
    setClarifyAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleConfirmAndGenerate = () => {
    const context: ClarificationContext = {};
    clarifyingQuestions.forEach((q) => {
      const answer = clarifyAnswers[q.id];
      if (q.id === 'segment')
        context.segments = Array.isArray(answer) ? answer : [answer].filter(Boolean);
      else if (q.id === 'examples') context.example_companies = answer as string;
      else if (q.id === 'geography') context.geography_focus = answer as string;
      else if (q.id === 'size') context.revenue_range = answer as string;
      else context[q.id] = answer;
    });
    handleGenerate(context);
  };
  const handleSkipClarification = () => {
    handleGenerate({});
  };

  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(13);
  const [savedProgress, setSavedProgress] = useState<{
    industryName: string;
    batchIndex: number;
    content: string;
    clarificationContext: ClarificationContext;
  } | null>(null);

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
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
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

  const handleCancel = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    setState('idle');
    setClarifyingQuestions([]);
    setClarifyAnswers({});
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
      const { data, error } = await invokeWithTimeout<any>('extract-buyer-criteria', {
        body: {
          universe_id: universeId,
          guide_content: guideContent,
          source_name: `${universeName || industryName} M&A Guide`,
          industry_name: universeName || industryName,
        },
        timeoutMs: 120_000,
      });
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
      if (!data?.success) throw new Error(data?.error || 'Extraction failed');
      const mappedCriteria: ExtractedCriteria = {
        size_criteria: data.criteria?.size_criteria,
        geography_criteria: data.criteria?.geography_criteria,
        service_criteria: data.criteria?.service_criteria,
        buyer_types_criteria: data.criteria?.buyer_types_criteria,
      };
      setExtractedCriteria(mappedCriteria);
      onGuideGenerated(guideContent, mappedCriteria, data.target_buyer_types);
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

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">M&A Research Guide</CardTitle>
              <CardDescription>
                {existingContent && existingContent.length > 100
                  ? `${wordCount.toLocaleString()} word industry research guide`
                  : 'Generate comprehensive 30,000+ word industry research guide'}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {state === 'complete' && (
              <Badge variant="default" className="bg-green-600">
                <Check className="h-3 w-3 mr-1" />
                Complete
              </Badge>
            )}
            {wordCount > 0 && state !== 'complete' && (
              <Badge variant="secondary">{wordCount.toLocaleString()} words</Badge>
            )}
            {(state === 'idle' || state === 'complete' || state === 'error') && !isOpen && (
              <Button
                size="sm"
                variant={existingContent && existingContent.length > 100 ? 'outline' : 'default'}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(true);
                }}
              >
                <Sparkles className="h-4 w-4 mr-1" />
                {existingContent && existingContent.length > 100 ? 'View Guide' : 'Run AI Research'}
              </Button>
            )}
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          </div>
        </div>
        {!isOpen && existingContent && existingContent.length > 100 && (
          <div className="mt-3 p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground line-clamp-2">
              {existingContent.replace(/[#*`]/g, '').substring(0, 200)}...
            </p>
          </div>
        )}
      </CardHeader>

      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {showDuplicateWarning && (
              <div className="flex items-center justify-between p-4 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    A guide already exists (
                    {(existingContent?.split(/\s+/).length || 0).toLocaleString()} words)
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Regenerating will replace the existing content.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" onClick={proceedWithClarification}>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Regenerate Anyway
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowDuplicateWarning(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {savedProgress && state === 'idle' && !showDuplicateWarning && (
              <div className="flex items-center justify-between p-4 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800">
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Previous generation was interrupted at phase {savedProgress.batchIndex + 1} of
                    13
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {savedProgress.content.split(/\s+/).length.toLocaleString()} words generated
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => resumeGeneration(savedProgress)}>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Resume
                  </Button>
                  <Button size="sm" variant="ghost" onClick={clearProgress}>
                    Start Over
                  </Button>
                </div>
              </div>
            )}

            {generationSummary && state !== 'generating' && (
              <GenerationSummaryPanel
                summary={generationSummary}
                onResume={generationSummary.isRecoverable ? handleErrorResume : undefined}
                onDismiss={() => setGenerationSummary(null)}
                hasCheckpoint={
                  !!savedProgress || (content.length > 0 && generationSummary.wordCount > 0)
                }
              />
            )}

            {state === 'error' && errorDetails && !generationSummary && (
              <GuideGenerationErrorPanel
                errorDetails={errorDetails}
                onRetry={handleErrorRetry}
                onResume={handleErrorResume}
                onCancel={handleErrorCancel}
                hasCheckpoint={
                  !!savedProgress ||
                  (content.length > 0 &&
                    errorDetails.savedWordCount !== undefined &&
                    errorDetails.savedWordCount > 0)
                }
                totalBatches={totalBatches}
              />
            )}

            {(state === 'idle' || state === 'complete' || (state === 'error' && !errorDetails)) && (
              <div className="space-y-4">
                <div className="flex gap-4 items-end">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="industry-name">Industry Name</Label>
                    <Input
                      id="industry-name"
                      placeholder="e.g., Collision Repair, HVAC, Pest Control, Restoration"
                      value={industryName}
                      onChange={(e) => setIndustryName(e.target.value)}
                    />
                  </div>
                  <Button onClick={handleStartClarification} disabled={!industryName.trim()}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    {state === 'complete' ? 'Regenerate' : 'Generate Guide'}
                  </Button>
                  <span className="text-xs text-muted-foreground self-center">or</span>
                  <Button
                    variant="outline"
                    onClick={() => guideFileInputRef.current?.click()}
                    disabled={isUploadingGuide}
                  >
                    {isUploadingGuide ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Upload Guide
                  </Button>
                  <input
                    ref={guideFileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt,.html,.htm"
                    className="hidden"
                    onChange={handleUploadGuide}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry-description">
                    Industry Description{' '}
                    <span className="text-muted-foreground text-xs">(optional)</span>
                  </Label>
                  <Textarea
                    id="industry-description"
                    placeholder="Provide a 2-3 sentence description..."
                    value={industryDescription}
                    onChange={(e) => setIndustryDescription(e.target.value)}
                    className="min-h-[80px] resize-none"
                  />
                </div>
              </div>
            )}

            {state === 'clarifying' && (
              <ClarificationPanel
                questions={clarifyingQuestions}
                answers={clarifyAnswers}
                onSelectOption={handleSelectOption}
                onTextAnswer={handleTextAnswer}
                onConfirm={handleConfirmAndGenerate}
                onSkip={handleSkipClarification}
                onCancel={handleCancel}
                clarifyingStatus={clarifyingStatus}
                onCancelLoading={() => {
                  setClarifyingStatus({
                    isLoading: false,
                    retryCount: 0,
                    waitingSeconds: 0,
                    error: null,
                  });
                  setState('idle');
                }}
              />
            )}

            <GenerationProgress
              state={state}
              currentBatch={currentBatch}
              totalBatches={totalBatches}
              currentPhase={currentPhase}
              totalPhases={totalPhases}
              phaseName={phaseName}
              wordCount={wordCount}
              onCancel={handleCancel}
              qualityResult={qualityResult}
              missingElements={missingElements}
            />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      <GuideCompletionDialog
        open={showCompletionDialog}
        onOpenChange={setShowCompletionDialog}
        industryName={industryName}
        wordCount={wordCount}
        documentUrl={completedDocumentUrl || undefined}
      />
    </Card>
  );
};
