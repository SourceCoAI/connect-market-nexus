/**
 * AI Tool Calling & Execution
 * Handles SSE stream processing, tool call tracking, confirmation flow,
 * and sending messages to the AI orchestrator.
 */

import { useCallback, useRef } from 'react';
import { supabase, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '@/integrations/supabase/client';
import type {
  AIMessage,
  ToolCallInfo,
  UIActionPayload,
  ConfirmationRequest,
  PageContext,
  AICommandCenterState,
} from './useAICommandCenter';

type UIActionHandler = (action: UIActionPayload) => void;

export interface AIToolCallingActions {
  sendMessage: (query: string) => Promise<void>;
  confirmAction: () => Promise<void>;
  denyAction: () => void;
  stopStreaming: () => void;
  onUIAction: (handler: UIActionHandler) => void;
}

export function useAIToolCalling(
  messages: AIMessage[],
  isLoading: boolean,
  pageContext: PageContext | undefined,
  conversationIdRef: React.MutableRefObject<string>,
  pendingConfirmation: ConfirmationRequest | null,
  abortControllerRef: React.MutableRefObject<AbortController | null>,
  setMessages: React.Dispatch<React.SetStateAction<AIMessage[]>>,
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
  setStreamingContent: React.Dispatch<React.SetStateAction<string>>,
  setCurrentPhase: React.Dispatch<React.SetStateAction<string>>,
  setRouteInfo: React.Dispatch<React.SetStateAction<AICommandCenterState['routeInfo']>>,
  setActiveTools: React.Dispatch<React.SetStateAction<ToolCallInfo[]>>,
  setPendingConfirmation: React.Dispatch<React.SetStateAction<ConfirmationRequest | null>>,
  setError: React.Dispatch<React.SetStateAction<string | null>>,
): AIToolCallingActions {
  const uiActionHandlerRef = useRef<UIActionHandler | null>(null);

  // Register a handler for UI actions (select_rows, filter, navigate)
  const onUIAction = useCallback((handler: UIActionHandler) => {
    uiActionHandlerRef.current = handler;
  }, []);

  // Process SSE stream from the orchestrator
  const processSSEStream = useCallback(async (response: Response) => {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    const toolCalls: ToolCallInfo[] = [];
    const uiActions: UIActionPayload[] = [];
    let confirmation: ConfirmationRequest | null = null;
    let meta: AIMessage['metadata'] = {};
    let pendingEventType = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.replace(/\r$/, '');

        // SSE event type line
        if (trimmed.startsWith('event: ')) {
          pendingEventType = trimmed.slice(7).trim();
          continue;
        }

        // Skip empty lines and comments
        if (!trimmed || trimmed.startsWith(':')) {
          pendingEventType = '';
          continue;
        }

        if (!trimmed.startsWith('data: ')) continue;
        const jsonStr = trimmed.slice(6).trim();
        if (!jsonStr) continue;

        const eventType = pendingEventType || 'message';
        pendingEventType = '';

        try {
          const data = JSON.parse(jsonStr);

          switch (eventType) {
            case 'status':
              setCurrentPhase(data.phase || '');
              break;

            case 'routed':
              setRouteInfo(data);
              meta = { ...meta, category: data.category, tier: data.tier };
              break;

            case 'text':
              fullText += data.text || '';
              setStreamingContent(fullText);
              break;

            case 'tool_use':
              // Tool call started by Claude
              break;

            case 'tool_start': {
              const tool: ToolCallInfo = { id: data.id, name: data.name, status: 'running' };
              toolCalls.push(tool);
              setActiveTools([...toolCalls]);
              break;
            }

            case 'tool_result': {
              const idx = toolCalls.findIndex((t) => t.id === data.id);
              if (idx >= 0) {
                toolCalls[idx].status = data.success ? 'success' : 'error';
                toolCalls[idx].hasUIAction = data.has_ui_action;
                setActiveTools([...toolCalls]);
              }
              break;
            }

            case 'ui_action': {
              const action = data as UIActionPayload;
              uiActions.push(action);
              // Dispatch to the registered handler
              uiActionHandlerRef.current?.(action);
              break;
            }

            case 'confirmation_required':
              confirmation = data as ConfirmationRequest;
              setPendingConfirmation(confirmation);
              break;

            case 'error':
              setError(data.message || 'Unknown error');
              break;

            case 'done':
              meta = {
                ...meta,
                cost: data.cost,
                toolCount: data.tool_calls,
                durationMs: data.duration_ms,
              };
              break;
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    // Add the assistant message
    if (fullText || toolCalls.length > 0 || uiActions.length > 0 || confirmation) {
      // Generate fallback content when tools executed but Claude returned no text
      let content = fullText;
      if (!content && toolCalls.length > 0 && !confirmation) {
        const succeeded = toolCalls.filter((t) => t.status === 'success');
        const failed = toolCalls.filter((t) => t.status === 'error');
        const parts: string[] = [];
        if (succeeded.length > 0) {
          parts.push(
            `Executed ${succeeded.length} tool${succeeded.length > 1 ? 's' : ''}: ${succeeded.map((t) => t.name.replace(/_/g, ' ')).join(', ')}.`,
          );
        }
        if (failed.length > 0) {
          parts.push(
            `${failed.length} tool${failed.length > 1 ? 's' : ''} failed: ${failed.map((t) => t.name.replace(/_/g, ' ')).join(', ')}.`,
          );
        }
        content = parts.join(' ') || 'Processing complete.';
      }

      const assistantMsg: AIMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content,
        timestamp: new Date(),
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        uiActions: uiActions.length > 0 ? uiActions : undefined,
        pendingConfirmation: confirmation || undefined,
        metadata: meta,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    }
  }, [setCurrentPhase, setRouteInfo, setStreamingContent, setActiveTools, setPendingConfirmation, setError, setMessages]);

  // Send a message
  const sendMessage = useCallback(
    async (query: string) => {
      if (!query.trim() || isLoading) return;

      // Cancel any in-flight request
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      setError(null);
      setPendingConfirmation(null);

      // Add user message
      const userMsg: AIMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: query.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      setStreamingContent('');
      setCurrentPhase('routing');
      setActiveTools([]);

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          throw new Error('You must be logged in to use the AI Command Center');
        }

        // Build conversation history for context
        const history = messages.slice(-10).map((m) => ({
          role: m.role,
          content: m.content,
        }));

        const fetchOptions = {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionData.session.access_token}`,
            apikey: SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            query: query.trim(),
            conversation_id: conversationIdRef.current,
            history,
            page_context: pageContext,
          }),
          signal: abortControllerRef.current.signal,
        };

        // Retry up to 2 times on network errors (Failed to fetch / TypeError)
        let response: Response | undefined;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            response = await fetch(`${SUPABASE_URL}/functions/v1/ai-command-center`, fetchOptions);
            break;
          } catch (fetchErr) {
            if (fetchErr instanceof Error && fetchErr.name === 'AbortError') throw fetchErr;
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
            }
          }
        }

        if (!response) {
          throw new Error(
            'Unable to reach the AI service. Please check your internet connection and try again.',
          );
        }

        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        }
        if (response.status === 401 || response.status === 403) {
          throw new Error('Unauthorized. Please ensure you have admin access.');
        }
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error((err as Record<string, string>).error || 'Failed to get response');
        }

        // Process SSE stream
        await processSSEStream(response);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        const message = err instanceof Error ? err.message : 'An error occurred';
        setError(message);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `Sorry, something went wrong: ${message}`,
            timestamp: new Date(),
          },
        ]);
      } finally {
        setIsLoading(false);
        setStreamingContent('');
        setCurrentPhase('');
        setActiveTools([]);
      }
    },
    [isLoading, messages, pageContext, processSSEStream, conversationIdRef],
  );

  // Confirm a pending action
  const confirmAction = useCallback(async () => {
    if (!pendingConfirmation) return;

    const confirmed = { ...pendingConfirmation };
    setPendingConfirmation(null);
    setIsLoading(true);
    setStreamingContent('');
    setCurrentPhase('executing_confirmed_action');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error('Not authenticated');

      const history = messages.slice(-10).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch(`${SUPABASE_URL}/functions/v1/ai-command-center`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session.access_token}`,
          apikey: SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({
          query: messages[messages.length - 2]?.content || '',
          conversation_id: conversationIdRef.current,
          history,
          page_context: pageContext,
          confirmed_action: {
            tool_id: confirmed.tool_id,
            tool_name: confirmed.tool_name,
            args: confirmed.args,
          },
        }),
      });

      if (!response.ok) throw new Error('Failed to execute confirmed action');
      await processSSEStream(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Action failed';
      setError(message);
    } finally {
      setIsLoading(false);
      setStreamingContent('');
      setCurrentPhase('');
    }
  }, [pendingConfirmation, messages, pageContext, processSSEStream, conversationIdRef]);

  // Deny a pending action
  const denyAction = useCallback(() => {
    if (!pendingConfirmation) return;
    setPendingConfirmation(null);
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Action cancelled: ${pendingConfirmation.description}`,
        timestamp: new Date(),
      },
    ]);
  }, [pendingConfirmation, setMessages]);

  // Stop streaming
  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
    setCurrentPhase('');
  }, [setIsLoading, setCurrentPhase]);

  return {
    sendMessage,
    confirmAction,
    denyAction,
    stopStreaming,
    onUIAction,
  };
}
