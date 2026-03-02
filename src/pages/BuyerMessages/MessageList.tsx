import { forwardRef } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, CheckCheck } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

import { MessageBody, TypingIndicator } from './MessageBody';

// ─── MessageList ───

interface MessageListProps {
  messages: Array<{
    id: string;
    body: string;
    created_at: string;
    sender_role?: string;
    message_type?: string;
    is_read_by_admin?: boolean;
    sender?: { first_name?: string } | null;
  }>;
  isLoading: boolean;
  isAdminTyping?: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
}

export const MessageList = forwardRef<HTMLDivElement, MessageListProps>(
  function MessageList({ messages, isLoading, isAdminTyping = false, messagesEndRef }) {
    return (
      <ScrollArea className="flex-1 bg-white">
        <div className="px-5 py-4 space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-12 w-3/4 rounded-2xl" />
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <MessageSquare className="w-8 h-8 mx-auto mb-2" style={{ color: '#E5DDD0' }} />
                <p className="text-sm" style={{ color: '#9A9A9A' }}>
                  No messages yet
                </p>
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isSystem = msg.message_type === 'decision' || msg.message_type === 'system';
              const isBuyer = msg.sender_role === 'buyer';

              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <div
                      className="italic text-xs px-3 py-1.5 rounded-full"
                      style={{ color: '#9A9A9A' }}
                    >
                      <MessageBody body={msg.body} variant="system" />
                      <span className="opacity-60 text-[10px] ml-2">
                        {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={cn('flex flex-col', isBuyer ? 'items-end' : 'items-start')}
                >
                  {/* Sender + time above bubble */}
                  <div
                    className="flex items-center gap-1.5 text-[10px] mb-1 px-1"
                    style={{ color: '#CBCBCB' }}
                  >
                    <span className="font-medium">
                      {isBuyer ? 'You' : msg.sender?.first_name || 'SourceCo'}
                    </span>
                    <span>&middot;</span>
                    <span>
                      {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                    </span>
                  </div>

                  <div
                    className={cn(
                      'max-w-[75%] px-4 py-3',
                      isBuyer
                        ? 'rounded-[16px] rounded-br-[6px]'
                        : 'rounded-[16px] rounded-bl-[6px]',
                    )}
                    style={
                      isBuyer
                        ? { backgroundColor: '#0E101A', color: '#FFFFFF' }
                        : { backgroundColor: '#F8F8F6', color: '#0E101A' }
                    }
                  >
                    <div className="text-sm leading-relaxed">
                      <MessageBody body={msg.body} variant={isBuyer ? 'buyer' : 'admin'} />
                    </div>
                  </div>

                  {/* Read receipt -- subtle icon only */}
                  {isBuyer && msg.is_read_by_admin && (
                    <div className="mt-0.5 mr-1">
                      <CheckCheck className="h-3 w-3" style={{ color: '#DEC76B' }} />
                    </div>
                  )}
                </div>
              );
            })
          )}
          {isAdminTyping && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
    );
  },
);
