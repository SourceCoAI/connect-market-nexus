import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Inbox } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { BuyerThread } from './helpers';
import { parseReferences } from './types';

// ─── ConversationList ───

interface ConversationListProps {
  threads: BuyerThread[];
  filteredThreads: BuyerThread[];
  selectedThreadId: string | null;
  showGeneralChat: boolean;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectThread: (requestId: string) => void;
  onSelectGeneral: () => void;
}

export function ConversationList({
  threads,
  filteredThreads,
  selectedThreadId,
  showGeneralChat,
  searchQuery,
  onSearchChange,
  onSelectThread,
  onSelectGeneral,
}: ConversationListProps) {
  return (
    <div
      className={cn(
        'w-[280px] flex-shrink-0 flex flex-col min-h-0',
        selectedThreadId || showGeneralChat ? 'hidden md:flex' : 'flex',
      )}
      style={{ borderRight: '1px solid #F0EDE6' }}
    >
      {/* Search */}
      <div className="px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #F0EDE6' }}>
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5"
            style={{ color: '#CBCBCB' }}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search..."
            className="w-full text-xs rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#E5DDD0]"
            style={{
              border: '1px solid #F0EDE6',
              backgroundColor: '#FFFFFF',
              color: '#0E101A',
            }}
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div>
          {/* General Inquiry -- always first */}
          <button
            onClick={onSelectGeneral}
            className={cn(
              'w-full text-left px-4 py-3.5 transition-colors',
              showGeneralChat ? '' : 'hover:bg-[#FAFAF8]',
            )}
            style={{
              borderBottom: '1px solid #F0EDE6',
              borderLeft: showGeneralChat ? '2px solid #DEC76B' : '2px solid transparent',
              backgroundColor: showGeneralChat ? '#FDFCF9' : undefined,
            }}
          >
            <span className="text-sm font-medium" style={{ color: '#0E101A' }}>
              SourceCo Team
            </span>
            <p className="text-[11px] mt-0.5" style={{ color: '#9A9A9A' }}>
              Ask us anything
            </p>
          </button>

          {/* Deal threads */}
          {filteredThreads.map((thread) => (
            <ThreadListItem
              key={thread.connection_request_id}
              thread={thread}
              isSelected={selectedThreadId === thread.connection_request_id}
              onClick={() => onSelectThread(thread.connection_request_id)}
            />
          ))}

          {filteredThreads.length === 0 && threads.length > 0 && (
            <div className="p-8 text-center">
              <p className="text-xs" style={{ color: '#9A9A9A' }}>
                No conversations match your search
              </p>
            </div>
          )}

          {threads.length === 0 && (
            <div className="p-8 text-center">
              <Inbox className="h-8 w-8 mx-auto mb-2" style={{ color: '#E5DDD0' }} />
              <p className="text-xs" style={{ color: '#9A9A9A' }}>
                No deal conversations yet
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ─── ThreadListItem ───

function ThreadListItem({
  thread,
  isSelected,
  onClick,
}: {
  thread: BuyerThread;
  isSelected: boolean;
  onClick: () => void;
}) {
  const timeLabel = formatDistanceToNow(new Date(thread.last_message_at), { addSuffix: false });
  const isUnread = thread.unread_count > 0;

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3.5 transition-colors',
        isSelected ? '' : 'hover:bg-[#FAFAF8]',
      )}
      style={{
        borderBottom: '1px solid #F0EDE6',
        borderLeft: isSelected ? '2px solid #DEC76B' : '2px solid transparent',
        backgroundColor: isSelected ? '#FDFCF9' : undefined,
      }}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {/* Row 1: Deal title + time */}
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn('text-sm truncate', isUnread ? 'font-semibold' : 'font-medium')}
              style={{ color: '#0E101A' }}
            >
              {thread.deal_title}
            </span>
            <span className="text-[10px] flex-shrink-0" style={{ color: '#CBCBCB' }}>
              {timeLabel}
            </span>
          </div>

          {/* Row 2: Last message preview */}
          <p
            className={cn('text-[11px] mt-1 truncate', isUnread ? 'font-medium' : '')}
            style={{ color: isUnread ? '#0E101A' : '#9A9A9A' }}
          >
            {thread.last_sender_role === 'buyer' && 'You: '}
            {parseReferences(thread.last_message_body || '').cleanBody || 'No messages yet'}
          </p>
        </div>

        {/* Unread badge */}
        {isUnread && (
          <span
            className="mt-1 flex-shrink-0 flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold"
            style={{ backgroundColor: '#DEC76B', color: '#0E101A' }}
          >
            {thread.unread_count}
          </span>
        )}
      </div>
    </button>
  );
}
