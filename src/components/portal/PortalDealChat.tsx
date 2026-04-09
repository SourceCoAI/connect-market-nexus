import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send as SendIcon, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePortalMessages, useSendPortalMessage } from '@/hooks/portal/use-portal-messages';
import { cn } from '@/lib/utils';

interface PortalDealChatProps {
  pushId: string;
  portalOrgId: string;
  senderType: 'admin' | 'portal_user';
  senderName?: string;
}

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  const time = date.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit' });

  if (diffDays === 0) return time;
  if (diffDays === 1) return `Yesterday ${time}`;
  if (diffDays < 7) {
    return `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
  }
  return `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${time}`;
}

export function PortalDealChat({ pushId, portalOrgId, senderType, senderName }: PortalDealChatProps) {
  const { data: messages, isLoading } = usePortalMessages(pushId);
  const sendMessage = useSendPortalMessage();
  const [newMessage, setNewMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const prevMessageCount = useRef(0);

  // Auto-scroll when new messages arrive (if user is at bottom)
  useEffect(() => {
    const count = messages?.length || 0;
    if (count > prevMessageCount.current && isAtBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevMessageCount.current = count;
  }, [messages, isAtBottom]);

  // Initial scroll to bottom
  useEffect(() => {
    if (scrollRef.current && messages && messages.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!messages]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < 40);
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setIsAtBottom(true);
    }
  };

  const handleSend = async () => {
    const text = newMessage.trim();
    if (!text) return;
    setNewMessage('');
    await sendMessage.mutateAsync({
      push_id: pushId,
      portal_org_id: portalOrgId,
      sender_type: senderType,
      sender_name: senderName,
      message: text,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  // Group consecutive messages from same sender
  const groupedMessages = (messages || []).map((msg, i, arr) => ({
    ...msg,
    isFirstInGroup: i === 0 || arr[i - 1].sender_type !== msg.sender_type,
    isLastInGroup: i === arr.length - 1 || arr[i + 1].sender_type !== msg.sender_type,
  }));

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2 shrink-0">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Messages
          {messages && messages.length > 0 && (
            <span className="text-xs text-muted-foreground font-normal">({messages.length})</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 flex-1 min-h-0">
        {/* Message area */}
        <div className="relative">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="max-h-[400px] min-h-[200px] overflow-y-auto space-y-1 pr-1 scroll-smooth"
          >
            {isLoading ? (
              <p className="text-xs text-muted-foreground text-center py-8">Loading messages...</p>
            ) : !messages || messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">No messages yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {senderType === 'portal_user'
                    ? 'Have a question about this deal? Ask here.'
                    : 'Send a message to the client about this deal.'}
                </p>
              </div>
            ) : (
              groupedMessages.map((msg) => {
                const isMe = msg.sender_type === senderType;
                return (
                  <div
                    key={msg.id}
                    className={cn(
                      'flex flex-col',
                      isMe ? 'items-end' : 'items-start',
                      msg.isFirstInGroup && 'mt-3',
                    )}
                  >
                    {/* Sender name — only on first message in group */}
                    {msg.isFirstInGroup && (
                      <span className={cn(
                        'text-[10px] font-medium mb-0.5 px-1',
                        isMe ? 'text-primary/70' : 'text-muted-foreground',
                      )}>
                        {msg.sender_name || (msg.sender_type === 'admin' ? 'SourceCo' : 'Client')}
                      </span>
                    )}
                    <div
                      className={cn(
                        'max-w-[85%] px-3 py-2 text-sm whitespace-pre-wrap',
                        isMe
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted',
                        // Rounded corners — adjust based on position in group
                        msg.isFirstInGroup && msg.isLastInGroup
                          ? 'rounded-lg'
                          : msg.isFirstInGroup
                            ? isMe ? 'rounded-lg rounded-br-sm' : 'rounded-lg rounded-bl-sm'
                            : msg.isLastInGroup
                              ? isMe ? 'rounded-lg rounded-tr-sm' : 'rounded-lg rounded-tl-sm'
                              : isMe ? 'rounded-lg rounded-r-sm' : 'rounded-lg rounded-l-sm',
                      )}
                    >
                      {msg.message}
                    </div>
                    {/* Timestamp — only on last message in group */}
                    {msg.isLastInGroup && (
                      <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
                        {formatMessageTime(msg.created_at)}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Scroll to bottom button */}
          {!isAtBottom && messages && messages.length > 5 && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-background border shadow-md rounded-full p-1.5 hover:bg-muted transition-colors"
            >
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Input area */}
        <div className="flex gap-2 pt-2 border-t shrink-0">
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={2000}
            placeholder={
              senderType === 'portal_user'
                ? 'Ask a question about this deal...'
                : 'Reply to the client...'
            }
            rows={2}
            className="min-h-[44px] max-h-[120px] resize-none text-sm"
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={sendMessage.isPending || !newMessage.trim()}
            className="shrink-0 self-end h-9 w-9 p-0"
          >
            <SendIcon className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
