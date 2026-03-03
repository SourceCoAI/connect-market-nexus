/**
 * AI Conversation History Management
 * Handles loading, saving, switching, and archiving conversations.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  saveConversation,
  getRecentConversations,
  archiveConversation,
  type ChatMessage as PersistChatMessage,
  type Conversation,
} from '@/integrations/supabase/chat-persistence';
import type { AIMessage, PageContext } from './useAICommandCenter';

export type { Conversation };

export interface AIConversationActions {
  conversationHistory: Conversation[];
  activeConversationDbId: string | null;
  isLoadingHistory: boolean;
  conversationIdRef: React.MutableRefObject<string>;
  loadConversationHistory: () => Promise<void>;
  persistToDatabase: (msgs: AIMessage[]) => Promise<void>;
  switchConversation: (conversation: Conversation) => void;
  startNewConversation: () => void;
  deleteConversation: (conversationId: string) => Promise<void>;
  /** Persist messages to sessionStorage + chat_analytics (call from an effect) */
  persistMessagesEffect: (
    messages: AIMessage[],
    isLoading: boolean,
  ) => void;
}

export function useAIConversation(
  pageContext: PageContext | undefined,
  setMessages: React.Dispatch<React.SetStateAction<AIMessage[]>>,
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>,
  setStreamingContent: React.Dispatch<React.SetStateAction<string>>,
  setCurrentPhase: React.Dispatch<React.SetStateAction<string>>,
  setRouteInfo: React.Dispatch<React.SetStateAction<{ category: string; tier: string; confidence: number; bypassed: boolean } | null>>,
  setActiveTools: React.Dispatch<React.SetStateAction<import('./useAICommandCenter').ToolCallInfo[]>>,
  setPendingConfirmation: React.Dispatch<React.SetStateAction<import('./useAICommandCenter').ConfirmationRequest | null>>,
  setError: React.Dispatch<React.SetStateAction<string | null>>,
  abortControllerRef: React.MutableRefObject<AbortController | null>,
): AIConversationActions {
  const [conversationHistory, setConversationHistory] = useState<Conversation[]>([]);
  const [activeConversationDbId, setActiveConversationDbId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const conversationIdRef = useRef<string>(crypto.randomUUID());
  const persistedRef = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track whether we're restoring from sessionStorage to avoid re-persisting stale data
  const restoringRef = useRef(false);

  // Load persisted conversation from sessionStorage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem('ai-cc-messages');
    const savedId = sessionStorage.getItem('ai-cc-conversation-id');
    const savedDbId = sessionStorage.getItem('ai-cc-db-id');
    if (saved && savedId) {
      try {
        restoringRef.current = true;
        const parsed = JSON.parse(saved) as AIMessage[];
        setMessages(parsed.map((m) => ({ ...m, timestamp: new Date(m.timestamp) })));
        conversationIdRef.current = savedId;
        if (savedDbId) {
          setActiveConversationDbId(savedDbId);
        }
        persistedRef.current = true;
        // Clear restoring flag after the current render cycle so the
        // persistMessagesEffect triggered by setMessages doesn't re-save.
        requestAnimationFrame(() => {
          restoringRef.current = false;
        });
      } catch {
        restoringRef.current = false;
        /* ignore corrupt data */
      }
    }
  }, []);

  const loadConversationHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const { success, conversations } = await getRecentConversations(20);
      if (success && conversations) {
        setConversationHistory(conversations);
      }
    } catch (err) {
      console.error('[useAIConversation] Failed to load history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  // Load conversation history from database on mount
  useEffect(() => {
    loadConversationHistory();
  }, []);

  // Persist activeConversationDbId to sessionStorage so it survives page reloads
  useEffect(() => {
    if (activeConversationDbId) {
      sessionStorage.setItem('ai-cc-db-id', activeConversationDbId);
    } else {
      sessionStorage.removeItem('ai-cc-db-id');
    }
  }, [activeConversationDbId]);

  // Save current conversation to database (debounced)
  const persistToDatabase = useCallback(
    async (msgs: AIMessage[]) => {
      if (msgs.length < 2) return; // Need at least 1 exchange
      try {
        const persistMessages: PersistChatMessage[] = msgs.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : String(m.timestamp),
        }));

        const contextType =
          pageContext?.page === 'deal_detail'
            ? ('deal' as const)
            : pageContext?.page === 'buyers_list' || pageContext?.page === 'remarketing'
              ? ('buyers' as const)
              : ('command_center' as const);

        const { success, conversationId: newId } = await saveConversation({
          context: {
            type: contextType,
            dealId: contextType === 'deal' ? pageContext?.entity_id : undefined,
          },
          messages: persistMessages,
          conversationId: activeConversationDbId || undefined,
        });

        if (success && newId && !activeConversationDbId) {
          setActiveConversationDbId(newId);
        }

        // Refresh history list
        await loadConversationHistory();
      } catch (err) {
        console.error('[useAIConversation] Save error:', err);
      }
    },
    [activeConversationDbId, pageContext, loadConversationHistory],
  );

  // Switch to a past conversation
  const switchConversation = useCallback((conversation: Conversation) => {
    abortControllerRef.current?.abort();
    setIsLoading(false);
    setStreamingContent('');
    setCurrentPhase('');
    setActiveTools([]);
    setPendingConfirmation(null);
    setError(null);

    const loadedMessages: AIMessage[] = conversation.messages.map((m, idx) => ({
      id: `loaded-${conversation.id}-${idx}`,
      role: m.role,
      content: m.content,
      timestamp: new Date(m.timestamp),
    }));

    setMessages(loadedMessages);
    setActiveConversationDbId(conversation.id);
    conversationIdRef.current = conversation.id;

    // Update sessionStorage
    try {
      sessionStorage.setItem('ai-cc-messages', JSON.stringify(loadedMessages));
      sessionStorage.setItem('ai-cc-conversation-id', conversation.id);
    } catch {
      /* storage full */
    }
  }, []);

  // Start a new conversation
  const startNewConversation = useCallback(() => {
    abortControllerRef.current?.abort();
    setMessages([]);
    setStreamingContent('');
    setCurrentPhase('');
    setRouteInfo(null);
    setActiveTools([]);
    setPendingConfirmation(null);
    setError(null);
    setActiveConversationDbId(null);
    conversationIdRef.current = crypto.randomUUID();
    sessionStorage.removeItem('ai-cc-messages');
    sessionStorage.removeItem('ai-cc-conversation-id');
    sessionStorage.removeItem('ai-cc-db-id');
  }, []);

  // Archive a conversation from history
  const deleteConversation = useCallback(
    async (conversationId: string) => {
      const { success } = await archiveConversation(conversationId);
      if (success) {
        setConversationHistory((prev) => prev.filter((c) => c.id !== conversationId));
        if (conversationId === activeConversationDbId) {
          startNewConversation();
        }
      }
    },
    [activeConversationDbId, startNewConversation],
  );

  // Persist messages to sessionStorage + database on change
  const persistMessagesEffect = useCallback(
    (messages: AIMessage[], loading: boolean) => {
      if (messages.length === 0 || loading) return;
      // Skip persistence when we're restoring from sessionStorage to avoid
      // creating duplicate database rows on page reload.
      if (restoringRef.current) return;
      // SessionStorage for instant reload
      try {
        sessionStorage.setItem('ai-cc-messages', JSON.stringify(messages.slice(-20)));
        sessionStorage.setItem('ai-cc-conversation-id', conversationIdRef.current);
      } catch {
        /* storage full -- ignore */
      }

      // Database persistence (async, non-blocking)
      const lastMsg = messages[messages.length - 1];
      if (lastMsg && !persistedRef.current) {
        persistedRef.current = true;
      }
      // Save the last message to chat_analytics for audit trail
      if (lastMsg?.role === 'assistant' && lastMsg.metadata) {
        supabase
          .from('chat_analytics')
          .insert({
            conversation_id: conversationIdRef.current,
            query_text:
              messages.length >= 2 ? messages[messages.length - 2]?.content?.substring(0, 500) : '',
            response_text: lastMsg.content?.substring(0, 2000) || '',
            query_intent: lastMsg.metadata.category || null,
            tools_called: lastMsg.toolCalls?.map((t) => t.name) || [],
            response_time_ms: lastMsg.metadata.durationMs || null,
            tokens_total: null,
          } as never)
          .then(() => {}); // Fire and forget
      }

      // Save full conversation to chat_conversations (debounced)
      if (lastMsg?.role === 'assistant') {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => {
          persistToDatabase(messages);
        }, 1500);
      }
    },
    [persistToDatabase],
  );

  return {
    conversationHistory,
    activeConversationDbId,
    isLoadingHistory,
    conversationIdRef,
    loadConversationHistory,
    persistToDatabase,
    switchConversation,
    startNewConversation,
    deleteConversation,
    persistMessagesEffect,
  };
}
