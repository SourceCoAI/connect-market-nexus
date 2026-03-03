/**
 * Chat message display/rendering components for AI Command Center.
 * Includes MessageBubble, EmptyState, FollowUpSuggestions,
 * ConversationHistoryPanel, and ConversationHistoryItem.
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sparkles,
  Loader2,
  Bot,
  User,
  CheckCircle,
  XCircle,
  MousePointerClick,
  ThumbsUp,
  ThumbsDown,
  Plus,
  ChevronLeft,
  MessageSquare,
  Archive,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { type AIMessage, type Conversation } from '@/hooks/useAICommandCenter';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ToolBadge } from './ToolStatus';

// ---------- EmptyState ----------

export function EmptyState({
  suggestions,
  onSuggestion,
}: {
  suggestions: string[];
  onSuggestion: (text: string) => void;
}) {
  return (
    <div className="text-center py-8">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[#F7F4DD] mb-4">
        <Sparkles className="h-6 w-6 text-[#DEC76B]" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">AI Command Center</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Search any deal, buyer, or lead. Take actions. Get insights.
      </p>
      <div className="flex flex-wrap gap-2 justify-center">
        {suggestions.map((s, i) => (
          <button
            key={i}
            onClick={() => onSuggestion(s)}
            className="text-sm px-3 py-1.5 rounded-full border border-[#DEC76B]/40 text-[#0E101A] hover:bg-[#F7F4DD] transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- MessageBubble ----------

export function MessageBubble({
  message,
  onConfirm,
  onDeny,
  userQuery,
}: {
  message: AIMessage;
  onConfirm: () => void;
  onDeny: () => void;
  userQuery?: string;
}) {
  const isUser = message.role === 'user';
  const [feedbackGiven, setFeedbackGiven] = React.useState<number | null>(null);

  const submitFeedback = async (rating: number) => {
    setFeedbackGiven(rating);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      await supabase.from('chat_feedback').insert({
        user_id: sessionData.session?.user?.id,
        query: userQuery || '',
        response: message.content?.substring(0, 2000) || '',
        rating,
        category: message.metadata?.category || null,
      } as never);
      toast.success(rating > 0 ? 'Thanks for the feedback!' : "Thanks — we'll improve this.");
    } catch {
      // Non-critical, don't block UX
    }
  };

  return (
    <div className={cn('flex gap-2', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-[#F7F4DD] flex items-center justify-center flex-shrink-0 mt-0.5">
          <Bot className="h-4 w-4 text-[#DEC76B]" />
        </div>
      )}

      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 border',
          isUser
            ? 'bg-[#F7F4DD] border-[#E5DDD0] text-[#0E101A]'
            : 'bg-[#FCF9F0] border-[#E5DDD0] text-[#0E101A]',
        )}
      >
        {/* Tool call indicators */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {message.toolCalls.map((tool) => (
              <ToolBadge key={tool.id} tool={tool} />
            ))}
          </div>
        )}

        {/* UI action indicators */}
        {message.uiActions && message.uiActions.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {message.uiActions.map((action, i) => (
              <Badge
                key={i}
                variant="outline"
                className="text-xs gap-1 border-[#DEC76B]/50 text-[#0E101A]"
              >
                <MousePointerClick className="h-3 w-3" />
                {action.type === 'select_rows'
                  ? 'Selected rows'
                  : action.type === 'apply_filter'
                    ? 'Applied filter'
                    : action.type === 'sort_column'
                      ? 'Sorted column'
                      : action.type === 'navigate'
                        ? 'Navigated'
                        : action.type}
              </Badge>
            ))}
          </div>
        )}

        {/* Message content */}
        {message.content ? (
          <div className="text-base prose prose-base max-w-none [&_*]:text-[#0E101A] [&_a]:text-[#DEC76B]">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        ) : (
          !isUser &&
          !message.pendingConfirmation && (
            <div className="text-sm text-muted-foreground italic">Processing complete.</div>
          )
        )}

        {/* Confirmation prompt */}
        {message.pendingConfirmation && (
          <div className="mt-2 p-2 rounded bg-amber-50 border border-amber-200">
            <p className="text-xs font-medium text-amber-800 mb-2">
              Confirm action: {message.pendingConfirmation.description}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="default" className="h-7 text-xs" onClick={onConfirm}>
                <CheckCircle className="h-3 w-3 mr-1" /> Confirm
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onDeny}>
                <XCircle className="h-3 w-3 mr-1" /> Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Timestamp + Feedback */}
        <div className="flex items-center justify-between mt-1">
          <p className="text-[10px] text-muted-foreground">
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {message.metadata?.cost != null && (
              <span className="ml-2">${message.metadata.cost.toFixed(4)}</span>
            )}
          </p>
          {/* Feedback buttons for assistant messages */}
          {!isUser && message.content && !message.pendingConfirmation && (
            <div className="flex items-center gap-1">
              {feedbackGiven === null ? (
                <>
                  <button
                    onClick={() => submitFeedback(1)}
                    className="p-0.5 rounded hover:bg-green-100 text-muted-foreground hover:text-green-600 transition-colors"
                    title="Good response"
                  >
                    <ThumbsUp className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => submitFeedback(-1)}
                    className="p-0.5 rounded hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors"
                    title="Poor response"
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </button>
                </>
              ) : (
                <span className="text-[10px] text-muted-foreground">
                  {feedbackGiven > 0 ? '\uD83D\uDC4D' : '\uD83D\uDC4E'}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {isUser && (
        <div className="w-7 h-7 rounded-full bg-[#0E101A] flex items-center justify-center flex-shrink-0 mt-0.5">
          <User className="h-4 w-4 text-[#DEC76B]" />
        </div>
      )}
    </div>
  );
}

// ---------- FollowUpSuggestions ----------

export function FollowUpSuggestions({
  category,
  onSuggestion,
}: {
  category?: string;
  onSuggestion: (text: string) => void;
}) {
  const suggestions: Record<string, string[]> = {
    PIPELINE_ANALYTICS: [
      'Which deals need attention?',
      'Show deals by industry',
      'What changed this week?',
    ],
    DEAL_STATUS: [
      'Who are the top buyers for this deal?',
      'Show me the deal timeline',
      'Any overdue tasks?',
    ],
    BUYER_SEARCH: [
      'Score these buyers against our top deal',
      'Show engagement history',
      'Draft outreach to top matches',
    ],
    CONTACTS: [
      'Enrich missing contact emails',
      'Push contacts to dialer',
      'Find more contacts at this firm',
    ],
    MEETING_INTEL: [
      'Summarize key takeaways',
      'What action items came up?',
      'Search for pricing discussions',
    ],
    DAILY_BRIEFING: [
      'Show my overdue tasks',
      'Any new buyer engagement?',
      'Which deals went quiet?',
    ],
    ENGAGEMENT: [
      'Who viewed our data room?',
      'Show pass reasons this month',
      'Which buyers are most engaged?',
    ],
    OUTREACH_DRAFT: ['Refine the tone', 'Make it shorter', 'Add deal metrics to the draft'],
    FOLLOW_UP: ['Show stale deals', 'Create follow-up tasks', 'Who needs a call this week?'],
    REMARKETING: [
      'Show score breakdown for these buyers',
      'Draft outreach to the top match',
      'Which buyers are still pending?',
    ],
    BUYER_UNIVERSE: [
      'Which buyers fit best in this universe?',
      'Show deals linked to this universe',
      'Compare buyer alignment scores',
    ],
    BUYER_ANALYSIS: [
      "Explain this buyer's score breakdown",
      'Show acquisition history',
      'Find similar buyers',
    ],
  };

  const items = suggestions[category || ''] || [
    'Show pipeline summary',
    'Find top buyers',
    'Give me my briefing',
  ];

  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {items.map((s, i) => (
        <button
          key={i}
          onClick={() => onSuggestion(s)}
          className="text-xs px-2.5 py-1 rounded-full border border-[#DEC76B]/30 text-[#0E101A]/70 hover:bg-[#F7F4DD] hover:text-[#0E101A] transition-colors"
        >
          {s}
        </button>
      ))}
    </div>
  );
}

// ---------- ConversationHistoryPanel ----------

export function ConversationHistoryPanel({
  conversations,
  activeConversationId,
  isLoading,
  onSelect,
  onNewConversation,
  onDelete,
  onBack,
}: {
  conversations: Conversation[];
  activeConversationId: string | null;
  isLoading: boolean;
  onSelect: (conversation: Conversation) => void;
  onNewConversation: () => void;
  onDelete: (id: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col" style={{ backgroundColor: '#FCF9F0' }}>
      {/* History header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#DEC76B]/20">
        <button onClick={onBack} className="p-1 rounded hover:bg-[#F7F4DD] transition-colors">
          <ChevronLeft className="h-4 w-4 text-[#0E101A]" />
        </button>
        <h3 className="text-sm font-semibold text-[#0E101A] flex-1">Message History</h3>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 border-[#DEC76B]/40 hover:bg-[#F7F4DD]"
          onClick={onNewConversation}
        >
          <Plus className="h-3 w-3" />
          New Chat
        </Button>
      </div>

      {/* Conversation list */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-[#DEC76B]" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-12 px-4">
            <MessageSquare className="h-8 w-8 mx-auto mb-3 text-[#DEC76B]/50" />
            <p className="text-sm text-muted-foreground mb-1">No conversations yet</p>
            <p className="text-xs text-muted-foreground">Start a new chat to begin</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {conversations.map((conversation) => (
              <ConversationHistoryItem
                key={conversation.id}
                conversation={conversation}
                isActive={conversation.id === activeConversationId}
                onSelect={() => onSelect(conversation)}
                onDelete={() => onDelete(conversation.id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// ---------- ConversationHistoryItem ----------

function ConversationHistoryItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
}: {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [showDelete, setShowDelete] = React.useState(false);

  const timeAgo = React.useMemo(() => {
    const date = new Date(conversation.updated_at);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }, [conversation.updated_at]);

  // Get a preview from the first user message
  const preview = React.useMemo(() => {
    const firstUser = conversation.messages?.find((m) => m.role === 'user');
    if (!firstUser) return 'Empty conversation';
    return firstUser.content.length > 80
      ? firstUser.content.substring(0, 80) + '...'
      : firstUser.content;
  }, [conversation.messages]);

  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
      className={cn(
        'w-full text-left rounded-lg px-3 py-2.5 transition-colors relative group',
        isActive
          ? 'bg-[#F7F4DD] border border-[#DEC76B]/40'
          : 'hover:bg-[#F7F4DD]/50 border border-transparent',
      )}
    >
      <div className="flex items-start gap-2">
        <MessageSquare className="h-4 w-4 text-[#DEC76B] flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-[#0E101A] truncate">
              {conversation.title || 'Untitled'}
            </p>
            <span className="text-[10px] text-muted-foreground flex-shrink-0">{timeAgo}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{preview}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-muted-foreground">
              {conversation.message_count} message{conversation.message_count !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>
      {/* Delete button */}
      {showDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute top-2 right-2 p-1 rounded hover:bg-red-100 text-muted-foreground hover:text-red-600 transition-colors"
          title="Delete conversation"
        >
          <Archive className="h-3 w-3" />
        </button>
      )}
    </button>
  );
}
