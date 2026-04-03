import { useState } from 'react';
import { useDealInquiry } from '@/hooks/marketplace/use-deal-inquiry';
import { useConnectionMessages } from '@/hooks/use-connection-messages';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

interface SavedListingMessagesProps {
  listingId: string;
}

export function SavedListingMessages({ listingId }: SavedListingMessagesProps) {
  const { user } = useAuth();
  const { data: inquiry } = useDealInquiry(listingId);
  const { data: messages = [] } = useConnectionMessages(inquiry?.id);
  const [expanded, setExpanded] = useState(false);

  const visibleMessages = messages.filter(
    (m) => m.message_type !== 'system' && m.message_type !== 'decision',
  );

  if (visibleMessages.length === 0) return null;

  const preview = visibleMessages.slice(-2);
  const displayMessages = expanded ? visibleMessages : preview;
  const hasMore = visibleMessages.length > 2;

  return (
    <div className="mt-2 rounded-lg border border-border/40 overflow-hidden">
      <div className="px-3 py-2 bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MessageCircle className="h-3 w-3" />
          <span>
            {visibleMessages.length} message{visibleMessages.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasMore && (
            <button
              onClick={() => setExpanded((o) => !o)}
              className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5 transition-colors"
            >
              {expanded ? (
                <>
                  Show less <ChevronUp className="h-3 w-3" />
                </>
              ) : (
                <>
                  Show all <ChevronDown className="h-3 w-3" />
                </>
              )}
            </button>
          )}
          <Link
            to="/my-deals?tab=messages"
            className="text-[11px] text-primary hover:underline"
          >
            Reply →
          </Link>
        </div>
      </div>
      <div className={cn('px-3 py-2 space-y-2', expanded && 'max-h-[300px] overflow-y-auto')}>
        {displayMessages.map((msg) => {
          const isMe = msg.sender_id === user?.id;
          return (
            <div key={msg.id} className="flex gap-2 items-start">
              <div
                className={cn(
                  'h-5 w-5 rounded-full flex items-center justify-center text-[9px] font-medium shrink-0 mt-0.5',
                  isMe ? 'bg-foreground text-background' : 'bg-primary/10 text-primary',
                )}
              >
                {isMe ? 'You' : 'SC'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground line-clamp-3">{msg.body}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
