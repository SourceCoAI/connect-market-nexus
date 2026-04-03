import { useState, useRef, useEffect } from 'react';
import { FolderOpen, MessageCircleQuestion, ChevronRight, Send, Loader2, Info } from 'lucide-react';
import { format } from 'date-fns';
import { AgreementSigningModal } from '@/components/pandadoc/AgreementSigningModal';
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
  ndaCovered: boolean;
  ndaStatus: string;
  feeStatus: string;
  connectionApproved: boolean;
  onExploreDataRoom?: () => void;
}

function resolveDocLabel(covered: boolean, status: string): { label: string; dot: 'signed' | 'pending' | 'none' } {
  if (covered) return { label: 'Signed', dot: 'signed' };
  const s = (status || '').toLowerCase();
  if (s === 'sent' || s === 'redlined' || s === 'under_review') return { label: 'Sent', dot: 'pending' };
  return { label: 'Not requested', dot: 'none' };
}

export function ListingSidebarActions({
  listingId,
  feeCovered,
  ndaCovered,
  ndaStatus,
  feeStatus,
  connectionApproved,
  onExploreDataRoom,
}: ListingSidebarActionsProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [chatOpen, setChatOpen] = useState(false);
  const [message, setMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const canExploreDataRoom = feeCovered && connectionApproved;
  const canAskQuestion = feeCovered;

  const { data: lastAccess } = useDataRoomLastAccess(listingId);
  const { data: inquiryRequest } = useDealInquiry(listingId);
  const createInquiry = useCreateInquiry();
  const sendMsg = useSendMessage();
  const markRead = useMarkMessagesReadByBuyer();

  const threadId = inquiryRequest?.id;
  const { data: messages = [] } = useConnectionMessages(threadId);

  const visibleMessages = messages.filter(
    (m) => m.message_type !== 'system' && m.message_type !== 'decision',
  );

  useEffect(() => {
    if (chatOpen && threadId) {
      markRead.mutate(threadId);
    }
  }, [chatOpen, threadId]);

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

  const getDataRoomTooltip = () => {
    if (!feeCovered) return 'Sign your Fee Agreement to unlock the data room.';
    if (!connectionApproved) return 'Request a connection to access the data room.';
    return '';
  };

  const getQuestionTooltip = () => {
    if (!feeCovered) return 'Sign your Fee Agreement to ask questions about this deal.';
    return '';
  };

  const [showAgreementModal, setShowAgreementModal] = useState(false);

  const fee = resolveDocLabel(feeCovered, feeStatus);
  const nda = resolveDocLabel(ndaCovered, ndaStatus);

  const feeNeedsRequest = fee.dot === 'none';
  const ndaNeedsRequest = nda.dot === 'none';
  const bothNeedRequest = feeNeedsRequest && ndaNeedsRequest;

  const StatusDot = ({ variant }: { variant: 'signed' | 'pending' | 'none' }) => (
    <div
      className={cn(
        'h-1.5 w-1.5 rounded-full',
        variant === 'signed' && 'bg-emerald-500',
        variant === 'pending' && 'bg-foreground/30',
        variant === 'none' && 'bg-transparent border border-foreground/20',
      )}
    />
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-5">
        {/* Documents Section */}
        <div>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-3">
            Documents
          </p>
          <div className="space-y-0">
            {/* Fee Agreement */}
            <div className="flex items-center justify-between py-2.5 border-b border-dashed border-border/40">
              <span className="text-sm text-foreground">Fee Agreement</span>
              <div className="flex items-center gap-1.5">
                <StatusDot variant={fee.dot} />
                <span
                  className={cn(
                    'text-xs',
                    fee.dot === 'signed' && 'text-emerald-600',
                    fee.dot === 'pending' && 'text-foreground/50',
                    fee.dot === 'none' && 'text-muted-foreground',
                  )}
                >
                  {fee.label}
                </span>
                {feeNeedsRequest && !bothNeedRequest && (
                  <button
                    onClick={() => setShowAgreementModal(true)}
                    className="text-[11px] font-medium text-foreground hover:text-foreground/70 transition-colors ml-1"
                  >
                    Request
                  </button>
                )}
              </div>
            </div>
            {/* NDA */}
            <div className="flex items-center justify-between py-2.5">
              <span className="text-sm text-foreground">NDA</span>
              <div className="flex items-center gap-1.5">
                <StatusDot variant={nda.dot} />
                <span
                  className={cn(
                    'text-xs',
                    nda.dot === 'signed' && 'text-emerald-600',
                    nda.dot === 'pending' && 'text-foreground/50',
                    nda.dot === 'none' && 'text-muted-foreground',
                  )}
                >
                  {nda.label}
                </span>
                {ndaNeedsRequest && !bothNeedRequest && (
                  <button
                    onClick={() => setShowAgreementModal(true)}
                    className="text-[11px] font-medium text-foreground hover:text-foreground/70 transition-colors ml-1"
                  >
                    Request
                  </button>
                )}
              </div>
            </div>
          </div>
          {bothNeedRequest && (
            <button
              onClick={() => setShowAgreementModal(true)}
              className="text-xs font-medium text-foreground hover:text-foreground/70 transition-colors mt-2"
            >
              Request documents →
            </button>
          )}
        </div>

        {/* Actions Section */}
        <div>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest mb-3">
            Actions
          </p>
          <div className="space-y-0">
            {/* Explore Data Room */}
            <div
              className={cn(
                'flex items-center gap-3 py-3 border-b border-dashed border-border/40 transition-colors',
                canExploreDataRoom ? 'cursor-pointer group' : 'opacity-50',
              )}
              onClick={() => canExploreDataRoom && onExploreDataRoom?.()}
              role="button"
              tabIndex={canExploreDataRoom ? 0 : -1}
            >
              <FolderOpen size={15} className="shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-foreground">Explore data room</span>
                {lastAccess && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Viewed {format(new Date(lastAccess), 'MMM d, yyyy')}
                  </p>
                )}
              </div>
              {!canExploreDataRoom ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="shrink-0 cursor-help opacity-100" style={{ opacity: 1 }}>
                      <Info size={14} className="text-muted-foreground hover:text-foreground transition-colors" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-[220px]">
                    <p className="text-xs">{getDataRoomTooltip()}</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <ChevronRight size={14} className="shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
              )}
            </div>

            {/* Ask a Question */}
            <div
              className={cn(
                'flex items-center gap-3 py-3 transition-colors',
                canAskQuestion ? 'cursor-pointer group' : 'opacity-50',
              )}
              onClick={() => canAskQuestion && setChatOpen((o) => !o)}
              role="button"
              tabIndex={canAskQuestion ? 0 : -1}
            >
              <MessageCircleQuestion size={15} className="shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
              <div className="flex-1 min-w-0">
                <span className="text-sm text-foreground">Ask a question</span>
              </div>
              {!canAskQuestion ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="shrink-0 cursor-help" style={{ opacity: 1 }}>
                      <Info size={14} className="text-muted-foreground hover:text-foreground transition-colors" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-[220px]">
                    <p className="text-xs">{getQuestionTooltip()}</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <ChevronRight
                  size={14}
                  className={cn(
                    'shrink-0 text-muted-foreground group-hover:text-foreground transition-all',
                    chatOpen && 'rotate-90',
                  )}
                />
              )}
            </div>
          </div>
        </div>

        {/* Inline Chat Panel */}
        {chatOpen && canAskQuestion && (
          <div className="rounded-lg border border-border/40 overflow-hidden">
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
                            ? 'ml-auto bg-foreground text-background'
                            : 'bg-muted text-foreground',
                        )}
                      >
                        <p>{msg.body}</p>
                        <p
                          className={cn(
                            'text-[10px] mt-1',
                            isMe ? 'text-background/60' : 'text-muted-foreground',
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

            <div className="p-3">
              <div className="flex gap-2 items-end">
                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type your question..."
                  className="min-h-[60px] max-h-[100px] text-xs resize-none bg-background border-border/60"
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
                  className="shrink-0 h-8 w-8 bg-foreground hover:bg-foreground/90 text-background"
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

        {/* Agreement Signing Modal */}
        <AgreementSigningModal
          open={showAgreementModal}
          onOpenChange={setShowAgreementModal}
        />
      </div>
    </TooltipProvider>
  );
}
