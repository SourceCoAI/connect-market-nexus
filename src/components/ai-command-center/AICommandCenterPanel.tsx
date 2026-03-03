/**
 * AI Command Center Panel
 * Floating chat panel with streaming, tool status, UI actions, and confirmations.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sparkles,
  Send,
  X,
  Minimize2,
  Trash2,
  ChevronUp,
  Square,
  History,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useAICommandCenter,
  type PageContext,
  type UIActionPayload,
  type Conversation,
} from '@/hooks/useAICommandCenter';
import { useProactiveAlerts } from '@/hooks/useProactiveAlerts';
import {
  EmptyState,
  MessageBubble,
  FollowUpSuggestions,
  ConversationHistoryPanel,
} from './ChatMessages';
import { StreamingIndicator } from './ToolStatus';

// ---------- Props ----------

interface AICommandCenterPanelProps {
  pageContext?: PageContext;
  onUIAction?: (action: UIActionPayload) => void;
  className?: string;
}

// ---------- Smart suggestions per context ----------

function getSuggestions(page?: string): string[] {
  switch (page) {
    case 'deal_detail':
      return [
        'Give me a quick summary of this deal',
        'Who are the top buyers for this deal?',
        'What tasks are overdue?',
        'Prep me for my next meeting',
      ];
    case 'buyers_list':
    case 'remarketing_buyers':
      return [
        'Select all buyers in Texas',
        'Filter to PE firms with fee agreements',
        'Who are the most active acquirers?',
        'Show buyers targeting $5M+ revenue',
      ];
    case 'remarketing_deals':
    case 'remarketing':
      return [
        'Which deals should I prioritize this week?',
        'Show deals that need enrichment',
        'Compare our top scoring deals',
        'What happened this week?',
      ];
    case 'universe_detail':
      return [
        'How well do the buyers fit this universe?',
        'Which buyers should I add to this universe?',
        'Show the score breakdown for top buyers',
        'What does the industry guide say?',
      ];
    case 'universes':
      return [
        'Which universes have the most buyers?',
        'Show universes with pending scores',
        'Compare universe criteria',
        'Find universes for HVAC deals',
      ];
    case 'pipeline':
      return [
        'Give me a pipeline summary',
        'Which deals need attention?',
        'Show me CP Target deals',
        'What happened this week?',
      ];
    default:
      return [
        'Give me my daily briefing',
        'Show pipeline health',
        'What tasks do I have today?',
        'Find buyers in the Southeast',
      ];
  }
}

// ---------- Component ----------

export function AICommandCenterPanel({
  pageContext,
  onUIAction,
  className,
}: AICommandCenterPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Feature 2: Proactive alert badge count
  const { data: alertCounts } = useProactiveAlerts();

  const {
    messages,
    isLoading,
    streamingContent,
    currentPhase,
    routeInfo,
    activeTools,
    error,
    conversationHistory,
    activeConversationDbId,
    isLoadingHistory,
    sendMessage,
    confirmAction,
    denyAction,
    clearMessages,
    stopStreaming,
    onUIAction: registerUIAction,
    switchConversation,
    startNewConversation,
    deleteConversation,
    loadConversationHistory,
  } = useAICommandCenter(pageContext);

  // Register UI action handler
  useEffect(() => {
    if (onUIAction) {
      registerUIAction(onUIAction);
    }
  }, [onUIAction, registerUIAction]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent, activeTools]);

  // Focus input when opened and refresh conversation history
  useEffect(() => {
    if (isOpen && !isMinimized) {
      if (inputRef.current) {
        setTimeout(() => inputRef.current?.focus(), 100);
      }
      // Refresh conversation history whenever the panel is opened
      loadConversationHistory();
    }
  }, [isOpen, isMinimized, loadConversationHistory]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || isLoading) return;
      sendMessage(input);
      setInput('');
      // Reset textarea height after send
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
      }
    },
    [input, isLoading, sendMessage],
  );

  // Auto-resize textarea as content changes
  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, []);

  // Enter to send, Shift+Enter for newline
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!input.trim() || isLoading) return;
        sendMessage(input);
        setInput('');
        if (inputRef.current) {
          inputRef.current.style.height = 'auto';
        }
      }
    },
    [input, isLoading, sendMessage],
  );

  const handleSuggestion = useCallback(
    (text: string) => {
      setInput('');
      sendMessage(text);
    },
    [sendMessage],
  );

  const handleSelectConversation = useCallback(
    (conversation: Conversation) => {
      switchConversation(conversation);
      setShowHistory(false);
    },
    [switchConversation],
  );

  const handleNewConversation = useCallback(() => {
    startNewConversation();
    setShowHistory(false);
  }, [startNewConversation]);

  // Listen for external open events (daily briefing auto-launch, draft outreach, etc.)
  useEffect(() => {
    const handleExternalOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setIsOpen(true);
      setIsMinimized(false);
      if (detail?.query) {
        // Daily briefing and other auto-launch sources should start a fresh
        // conversation so they don't append to a stale session.
        if (detail.source === 'daily_briefing_auto_launch') {
          startNewConversation();
        }
        // Small delay to ensure panel is rendered (and new conversation state
        // is flushed) before sending message
        setTimeout(() => {
          sendMessage(detail.query);
        }, 300);
      }
    };

    window.addEventListener('ai-command-center:open', handleExternalOpen);
    return () => window.removeEventListener('ai-command-center:open', handleExternalOpen);
  }, [sendMessage, startNewConversation]);

  // ---------- Floating bubble (closed) ----------
  if (!isOpen) {
    return (
      <div className={cn('fixed bottom-8 right-8 z-50', className)}>
        <div className="relative">
          <Button
            onClick={() => setIsOpen(true)}
            size="lg"
            className="rounded-full h-14 w-14 shadow-lg hover:scale-105 transition-transform bg-[#0E101A] hover:bg-[#000000] text-[#DEC76B]"
          >
            <Sparkles className="h-6 w-6" />
          </Button>
          {alertCounts && alertCounts.total > 0 && (
            <span
              className={cn(
                'absolute -top-1 -right-1 flex items-center justify-center rounded-full text-[10px] font-bold text-white min-w-[20px] h-5 px-1',
                alertCounts.critical > 0 ? 'bg-red-500 animate-pulse' : 'bg-amber-500',
              )}
            >
              {alertCounts.total > 9 ? '9+' : alertCounts.total}
            </span>
          )}
        </div>
      </div>
    );
  }

  // ---------- Minimized bar ----------
  if (isMinimized) {
    return (
      <div className={cn('fixed bottom-8 right-8 z-50', className)}>
        <Button
          onClick={() => setIsMinimized(false)}
          className="gap-2 shadow-lg rounded-full px-4 bg-[#0E101A] hover:bg-[#000000] text-[#DEC76B]"
        >
          <Sparkles className="h-4 w-4" />
          AI Command Center
          {messages.length > 0 && (
            <Badge variant="secondary" className="ml-1 bg-white/20 text-white">
              {messages.length}
            </Badge>
          )}
          <ChevronUp className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  // ---------- Full panel ----------
  return (
    <div className={cn('fixed bottom-8 right-8 z-50', className)}>
      <Card
        className="w-[640px] max-w-[calc(100vw-64px)] h-[800px] max-h-[85vh] flex flex-col shadow-2xl border-[#DEC76B]/30"
        style={{ backgroundColor: '#FCF9F0' }}
      >
        {/* Header */}
        <CardHeader className="pb-3 bg-[#0E101A] text-[#FCF9F0] rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              <CardTitle className="text-base font-semibold">AI Command Center</CardTitle>
              {routeInfo && (
                <Badge variant="outline" className="text-xs border-white/30 text-white/80">
                  {routeInfo.tier}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/10"
                onClick={handleNewConversation}
                title="New conversation"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-7 w-7 hover:bg-white/10',
                  showHistory ? 'text-[#DEC76B]' : 'text-white/80 hover:text-white',
                )}
                onClick={() => {
                  const opening = !showHistory;
                  setShowHistory(opening);
                  if (opening) {
                    loadConversationHistory();
                  }
                }}
                title="Conversation history"
              >
                <History className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/10"
                onClick={clearMessages}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/10"
                onClick={() => setIsMinimized(true)}
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-white/80 hover:text-white hover:bg-white/10"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {pageContext?.page && (
            <p className="text-xs text-white/60 mt-1">
              Context: {pageContext.page}
              {pageContext.entity_id
                ? ` (${pageContext.entity_type} ${pageContext.entity_id.substring(0, 8)}...)`
                : ''}
            </p>
          )}
        </CardHeader>

        {/* History Panel */}
        {showHistory ? (
          <ConversationHistoryPanel
            conversations={conversationHistory}
            activeConversationId={activeConversationDbId}
            isLoading={isLoadingHistory}
            onSelect={handleSelectConversation}
            onNewConversation={handleNewConversation}
            onDelete={deleteConversation}
            onBack={() => setShowHistory(false)}
          />
        ) : (
          <>
            {/* Messages */}
            <ScrollArea
              className="flex-1 p-4"
              ref={scrollRef}
              style={{ backgroundColor: '#FCF9F0' }}
            >
              <div className="space-y-4">
                {/* Empty state */}
                {messages.length === 0 && !isLoading && (
                  <EmptyState
                    suggestions={getSuggestions(pageContext?.page)}
                    onSuggestion={handleSuggestion}
                  />
                )}

                {/* Message list */}
                {messages.map((msg, idx) => (
                  <MessageBubble
                    key={msg.id}
                    message={msg}
                    onConfirm={confirmAction}
                    onDeny={denyAction}
                    userQuery={
                      msg.role === 'assistant' && idx > 0 ? messages[idx - 1]?.content : undefined
                    }
                  />
                ))}

                {/* Streaming content */}
                {isLoading && (
                  <StreamingIndicator
                    content={streamingContent}
                    phase={currentPhase}
                    tools={activeTools}
                  />
                )}

                {/* Follow-up suggestions after last assistant message */}
                {!isLoading &&
                  messages.length > 0 &&
                  messages[messages.length - 1]?.role === 'assistant' && (
                    <FollowUpSuggestions
                      category={messages[messages.length - 1]?.metadata?.category}
                      onSuggestion={handleSuggestion}
                    />
                  )}

                {/* Error */}
                {error && (
                  <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
                    {error}
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Input */}
            <div
              className="p-3 border-t border-[#DEC76B]/20"
              style={{ backgroundColor: '#FCF9F0' }}
            >
              <form onSubmit={handleSubmit} className="flex items-end gap-2">
                <Textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleTextareaChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything about deals, buyers, pipeline..."
                  disabled={isLoading}
                  rows={1}
                  className="flex-1 min-h-[40px] max-h-[160px] resize-none overflow-y-auto py-2.5"
                />
                {isLoading ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="flex-shrink-0"
                    onClick={stopStreaming}
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={!input.trim()}
                    size="icon"
                    className="flex-shrink-0 bg-[#0E101A] hover:bg-[#000000] text-[#DEC76B]"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                )}
              </form>
              <p className="text-[10px] text-muted-foreground mt-1 text-center">
                Press Enter to send, Shift+Enter for new line
              </p>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

export default AICommandCenterPanel;
