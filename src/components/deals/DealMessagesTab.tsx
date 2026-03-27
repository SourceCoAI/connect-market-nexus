/**
 * DealMessagesTab — Human-only message thread for a single deal.
 * Quiet luxury palette: #0E101A, #DEC76B, #F0EDE6.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare, Send, ArrowDown } from 'lucide-react';
import {
  useConnectionMessages,
  useSendMessage,
  useMarkMessagesReadByBuyer,
} from '@/hooks/use-connection-messages';
import { formatDistanceToNow } from 'date-fns';

interface DealMessagesTabProps {
  requestId: string;
  requestStatus: 'pending' | 'approved' | 'rejected' | 'on_hold';
}

export function DealMessagesTab({ requestId, requestStatus }: DealMessagesTabProps) {
  const { data: allMessages = [], isLoading: messagesLoading } = useConnectionMessages(requestId);
  const messages = allMessages.filter(
    (m) => m.message_type !== 'system' && m.message_type !== 'decision',
  );
  const sendMsg = useSendMessage();
  const markRead = useMarkMessagesReadByBuyer();
  const [newMessage, setNewMessage] = useState('');
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const canSend = requestStatus !== 'rejected';
  const isRejected = requestStatus === 'rejected';

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 100);
  }, []);

  useEffect(() => {
    if (requestId && messages.some((m) => !m.is_read_by_buyer && m.sender_role === 'admin')) {
      markRead.mutate(requestId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId, messages.length]);

  useEffect(() => {
    // Auto-scroll only if user is near bottom
    const el = scrollContainerRef.current;
    if (!el) { scrollToBottom(); return; }
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 150) scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = () => {
    if (!newMessage.trim() || !canSend) return;
    sendMsg.mutate(
      {
        connection_request_id: requestId,
        body: newMessage.trim(),
        sender_role: 'buyer',
      },
      {
        onError: () => {
          setNewMessage(newMessage.trim());
        },
      },
    );
    setNewMessage('');
  };

  return (
    <div className="border border-[#F0EDE6] rounded-xl overflow-hidden flex flex-col bg-white">
      {/* Rejected banner */}
      {isRejected && (
        <div className="px-5 py-2.5 bg-[#F8F6F1] border-b border-[#F0EDE6]">
          <p className="text-xs text-[#0E101A]/40">
            This deal is no longer active. Message history is available below.
          </p>
        </div>
      )}

      {/* Message thread */}
      <div className="min-h-[300px] max-h-[500px] overflow-y-auto px-5 py-4 space-y-3 flex-1 bg-[#FAFAF8]">
        {messagesLoading ? (
          <div className="space-y-3 py-4">
            <div className="flex justify-start">
              <Skeleton className="h-16 w-52 rounded-xl" />
            </div>
            <div className="flex justify-end">
              <Skeleton className="h-12 w-44 rounded-xl" />
            </div>
            <div className="flex justify-start">
              <Skeleton className="h-16 w-60 rounded-xl" />
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-12">
            <MessageSquare className="h-5 w-5 text-[#0E101A]/15 mb-2" />
            <p className="text-[13px] text-[#0E101A]/30 text-center">
              {canSend
                ? 'No messages yet. Send a message to the SourceCo team below.'
                : 'No messages in this conversation.'}
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isBuyer = msg.sender_role === 'buyer';
            return (
              <div key={msg.id} className={`flex ${isBuyer ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[80%]">
                  {/* Sender + time outside bubble */}
                  <div
                    className={`flex items-center gap-2 mb-1 ${isBuyer ? 'justify-end' : 'justify-start'}`}
                  >
                    <span
                      className={`font-semibold text-[11px] ${isBuyer ? 'text-[#DEC76B]' : 'text-[#0E101A]/60'}`}
                    >
                      {isBuyer ? 'You' : `${msg.sender?.first_name || 'SourceCo'} — SourceCo`}
                    </span>
                    <span className="text-[10px] text-[#0E101A]/25">
                      {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  {/* Bubble */}
                  <div
                    className={`rounded-2xl px-4 py-2.5 ${
                      isBuyer
                        ? 'bg-[#0E101A] text-white/85'
                        : 'bg-white border border-[#F0EDE6] text-[#0E101A]/70'
                    }`}
                  >
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose bar */}
      <div className="border-t border-[#F0EDE6] bg-white">
        {canSend ? (
          <div>
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Send a message to the deal team..."
              className="w-full px-4 py-3 text-[13px] text-[#0E101A]/70 placeholder:text-[#0E101A]/25 resize-none h-[72px] bg-white focus:outline-none font-[inherit]"
            />
            <div className="px-4 py-2 bg-[#FAFAF8] border-t border-[#F0EDE6] flex justify-end">
              <Button
                onClick={handleSend}
                disabled={!newMessage.trim() || sendMsg.isPending}
                size="sm"
                className="bg-[#0E101A] text-white hover:bg-[#0E101A]/85 text-xs font-semibold px-4 gap-1.5"
              >
                Send Message
                <Send className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[#0E101A]/30 text-center py-3">
            This deal is no longer active.
          </p>
        )}
      </div>
    </div>
  );
}
