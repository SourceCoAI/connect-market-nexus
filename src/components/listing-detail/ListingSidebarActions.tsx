import { useState, useRef, useEffect } from 'react';
import { FolderOpen, MessageCircleQuestion, ChevronRight, Send, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useDealInquiry, useCreateInquiry, useDataRoomLastAccess } from '@/hooks/marketplace/use-deal-inquiry';
import {
  useConnectionMessages,
  useSendMessage,
  useMarkMessagesReadByBuyer,
} from '@/hooks/use-connection-messages';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface ListingSidebarActionsProps {
  listingId: string;
  feeCovered: boolean;
  connectionApproved: boolean;
  /** Scroll to data room section on the page */
  onExploreDataRoom?: () => void;
}

export function ListingSidebarActions({
  listingId,
  feeCovered,
  connectionApproved,
  onExploreDataRoom,
}: ListingSidebarActionsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [chatOpen, setChatOpen] = useState(false);
  const [message, setMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Gating
  const canExploreDataRoom = feeCovered && connectionApproved;
  const canAskQuestion = feeCovered;

  // Data room last access
  const { data: lastAccess } = useDataRoomLastAccess(listingId);

  // Inquiry thread
  const { data: inquiryRequest } = useDealInquiry(listingId);
  const createInquiry = useCreateInquiry();
  const sendMsg = useSendMessage();
  const markRead = useMarkMessagesReadByBuyer();

  const threadId = inquiryRequest?.id;
  const { data: messages = [] } = useConnectionMessages(threadId);

  // Filter to user-visible messages only
  const visibleMessages = messages.filter(
    (m) => m.message_type !== 'system' && m.message_type !== 'decision',
  );

  // Mark read when chat opens
  useEffect(() => {
    if (chatOpen && threadId) {
      markRead.mutate(threadId);
    }
  }, [chatOpen, threadId]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleMessages.length, chatOpen]);

  const handleSendMessage = async () => {
    const body = message.trim();
    if (!body) return;

    try {
      let requestId = threadId;

      // Create inquiry request if none exists
      if (!requestId) {
        requestId = await createInquiry.mutateAsync(listingId);
      }

      await sendMsg.mutateAsync({
        connection_request_id: requestId!,
        body,
        sender_role: 'buyer',
      });

      setMessage('');
    } catch (err) {
      console.error('Failed to send message:', err);
      toast({
        title: 'Failed to send',
        description: 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  const isSending = sendMsg.isPending || createInquiry.isPending;

  // Tooltip helpers
  const getDataRoomTooltip = () => {
    if (!feeCovered) return 'Sign your Fee Agreement to unlock the data room.';
    if (!connectionApproved) return 'Request a connection to access the data room.';
    return '';
  };

  const getQuestionTooltip = () => {
    if (!feeCovered) return 'Sign your Fee Agreement to ask questions about this deal.';
    return '';
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="border border-border/60 rounded-lg overflow-hidden divide-y divide-border/40">
        {/* Explore Data Room Row */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => canExploreDataRoom && onExploreDataRoom?.()}
              disabled={!canExploreDataRoom}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                canExploreDataRoom
                  ? 'hover:bg-accent/50 cursor-pointer'
                  : 'opacity-50 cursor-not-allowed',
              )}
            >
              <FolderOpen size={16} className="shrink-0 text-primary" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-foreground">Explore data room</span>
                {lastAccess && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Viewed {format(new Date(lastAccess), 'MMM d, yyyy')}
                  </p>
                )}
              </div>
              <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
            </button>
          </TooltipTrigger>
          {!canExploreDataRoom && (
            <TooltipContent side="left" className="max-w-[220px]">
              <p className="text-xs">{getDataRoomTooltip()}</p>
            </TooltipContent>
          )}
        </Tooltip>

        {/* Ask a Question Row */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => {
                if (canAskQuestion) setChatOpen((o) => !o);
              }}
              disabled={!canAskQuestion}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                canAskQuestion
                  ? 'hover:bg-accent/50 cursor-pointer'
                  : 'opacity-50 cursor-not-allowed',
              )}
            >
              <MessageCircleQuestion size={16} className="shrink-0 text-primary" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-foreground">Ask a question</span>
              </div>
              <ChevronRight
                size={14}
                className={cn(
                  'shrink-0 text-muted-foreground transition-transform',
                  chatOpen && 'rotate-90',
                )}
              />
            </button>
          </TooltipTrigger>
          {!canAskQuestion && (
            <TooltipContent side="left" className="max-w-[220px]">
              <p className="text-xs">{getQuestionTooltip()}</p>
            </TooltipContent>
          )}
        </Tooltip>

        {/* Inline Chat Panel */}
        {chatOpen && canAskQuestion && (
          <div className="bg-muted/30 border-t border-border/40">
            {/* Message History */}
            {visibleMessages.length > 0 && (
              <ScrollArea className="max-h-[240px] p-3" ref={scrollRef as never}>
                <div className="space-y-2.5">
                  {visibleMessages.map((msg) => {
                    const isMe = msg.sender_id === user?.id;
                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          'max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed',
                          isMe
                            ? 'ml-auto bg-primary text-primary-foreground'
                            : 'bg-background border border-border text-foreground',
                        )}
                      >
                        <p>{msg.body}</p>
                        <p
                          className={cn(
                            'text-[10px] mt-1',
                            isMe ? 'text-primary-foreground/70' : 'text-muted-foreground',
                          )}
                        >
                          {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}

            {/* Input */}
            <div className="p-3 pt-1">
              <div className="flex gap-2 items-end">
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type your question..."
                  className="min-h-[60px] max-h-[100px] text-xs resize-none bg-background"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <Button
                  size="icon"
                  variant="default"
                  className="shrink-0 h-8 w-8"
                  disabled={!message.trim() || isSending}
                  onClick={handleSendMessage}
                >
                  {isSending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Send size={14} />
                  )}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                Your message will be sent to the SourceCo team. We typically respond within 24 hours.
              </p>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
