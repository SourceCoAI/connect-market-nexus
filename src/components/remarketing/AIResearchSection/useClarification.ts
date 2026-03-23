import { useState } from 'react';
import { toast } from 'sonner';

import type { ClarifyQuestion, ClarificationContext } from './types';
import { getSessionToken } from './helpers';

export interface ClarifyingStatus {
  isLoading: boolean;
  retryCount: number;
  waitingSeconds: number;
  error: string | null;
}

interface UseClarificationParams {
  industryName: string;
  industryDescription: string;
  existingContent?: string;
  onGenerate: (context: ClarificationContext) => void;
}

export const useClarification = ({
  industryName,
  industryDescription,
  existingContent,
  onGenerate,
}: UseClarificationParams) => {
  const [clarifyingQuestions, setClarifyingQuestions] = useState<ClarifyQuestion[]>([]);
  const [clarifyAnswers, setClarifyAnswers] = useState<Record<string, string | string[]>>({});
  const [clarifyingStatus, setClarifyingStatus] = useState<ClarifyingStatus>({
    isLoading: false,
    retryCount: 0,
    waitingSeconds: 0,
    error: null,
  });
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);

  const proceedWithClarification = async (setState: (state: 'idle' | 'clarifying') => void) => {
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

  const handleStartClarification = async (setState: (state: 'idle' | 'clarifying') => void) => {
    if (!industryName.trim()) {
      toast.error('Please enter an industry name');
      return;
    }
    if (existingContent && existingContent.length > 1000) {
      setShowDuplicateWarning(true);
      return;
    }
    await proceedWithClarification(setState);
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
    onGenerate(context);
  };

  const handleSkipClarification = () => {
    onGenerate({});
  };

  const resetClarification = () => {
    setClarifyingQuestions([]);
    setClarifyAnswers({});
  };

  const cancelClarifyingLoading = (setState: (state: 'idle') => void) => {
    setClarifyingStatus({
      isLoading: false,
      retryCount: 0,
      waitingSeconds: 0,
      error: null,
    });
    setState('idle');
  };

  return {
    clarifyingQuestions,
    clarifyAnswers,
    clarifyingStatus,
    showDuplicateWarning,
    setShowDuplicateWarning,
    handleStartClarification,
    proceedWithClarification,
    handleSelectOption,
    handleTextAnswer,
    handleConfirmAndGenerate,
    handleSkipClarification,
    resetClarification,
    cancelClarifyingLoading,
  };
};
