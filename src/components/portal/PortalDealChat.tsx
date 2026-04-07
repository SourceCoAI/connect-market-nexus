import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send as SendIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePortalMessages, useSendPortalMessage } from '@/hooks/portal/use-portal-messages';

interface PortalDealChatProps {
  pushId: string;
  portalOrgId: string;
  senderType: 'admin' | 'portal_user';
  senderName?: string;
}

export function PortalDealChat({ pushId, portalOrgId, senderType, senderName }: PortalDealChatProps) {
  const { data: messages, isLoading } = usePortalMessages(pushId);
  const sendMessage = useSendPortalMessage();
  const [newMessage, setNewMessage] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!newMessage.trim()) return;
    await sendMessage.mutateAsync({
      push_id: pushId,
      portal_org_id: portalOrgId,
      sender_type: senderType,
      sender_name: senderName,
      message: newMessage.trim(),
    });
    setNewMessage('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Messages
          {messages && messages.length > 0 && (
            <span className="text-xs text-muted-foreground font-normal">({messages.length})</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          ref={scrollRef}
          className="max-h-[300px] overflow-y-auto space-y-2 pr-1"
        >
          {isLoading ? (
            <p className="text-xs text-muted-foreground text-center py-4">Loading messages...</p>
          ) : !messages || messages.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No messages yet. Start the conversation.
            </p>
          ) : (
            messages.map((msg) => {
              const isMe = msg.sender_type === senderType;
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      isMe
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    {msg.message}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] text-muted-foreground">
                      {msg.sender_name || (msg.sender_type === 'admin' ? 'SourceCo' : 'Client')}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(msg.created_at).toLocaleString(undefined, {
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex gap-2 pt-1 border-t">
          <Textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            className="min-h-[36px] resize-none text-sm"
          />
          <Button
            size="sm"
            onClick={handleSend}
            disabled={sendMessage.isPending || !newMessage.trim()}
            className="shrink-0 self-end"
          >
            <SendIcon className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
