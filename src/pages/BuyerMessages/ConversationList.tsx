import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Inbox, X, MessageSquarePlus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { BuyerThread } from './helpers';
import { parseReferences } from './types';
import type { MessageReference } from './types';
import { NewMessagePicker } from './NewMessagePicker';

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
  onReferenceChange: (ref: MessageReference | null) => void;
  totalUnread?: number;
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
  onReferenceChange,
  totalUnread = 0,
}: ConversationListProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div
      className={cn(
        'w-full md:w-[300px] flex-shrink-0 flex flex-col min-h-0',
        selectedThreadId || showGeneralChat ? 'hidden md:flex' : 'flex',
      )}
      style={{ borderRight: '1px solid #F0EDE6' }}
    >
      {/* Header */}
      <div className="px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #F0EDE6' }}>
        {searchOpen ? (
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 shrink-0" style={{ color: '#CBCBCB' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search conversations..."
              className="flex-1 text-xs bg-transparent focus:outline-none"
              style={{ color: '#0E101A' }}
              autoFocus
            />
            <button
              onClick={() => {
                setSearchOpen(false);
                onSearchChange('');
              }}
              className="shrink-0 p-0.5 rounded hover:bg-[#F8F8F6]"
            >
              <X className="h-3.5 w-3.5" style={{ color: '#9A9A9A' }} />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <h1 className="text-[15px] font-semibold tracking-tight" style={{ color: '#0E101A' }}>
              Messages
              {totalUnread > 0 && (
                <span
                  className="ml-2 text-[11px] font-medium"
                  style={{ color: '#DEC76B' }}
                >
                  {totalUnread}
                </span>
              )}
            </h1>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setSearchOpen(true)}
                className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[#F8F8F6] transition-colors"
              >
                <Search className="h-3.5 w-3.5" style={{ color: '#9A9A9A' }} />
              </button>
              <NewMessagePicker
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                threads={threads}
                onSelectGeneral={onSelectGeneral}
                onSelectThread={onSelectThread}
                onReferenceChange={onReferenceChange}
              >
                <button
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-[#F8F8F6] transition-colors"
                  title="New message"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" style={{ color: '#9A9A9A' }} />
                </button>
              </NewMessagePicker>
            </div>
          </div>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="py-1">
          {/* SourceCo Team -- always first */}
          <button
            onClick={onSelectGeneral}
            className={cn(
              'w-full text-left px-5 py-3.5 transition-colors',
              showGeneralChat ? '' : 'hover:bg-[#FAFAF8]',
            )}
            style={{
              backgroundColor: showGeneralChat ? '#FAFAF8' : undefined,
            }}
          >
            <div className="flex items-center gap-3">
              {/* Avatar */}
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-[10px] font-semibold tracking-wide"
                style={{ backgroundColor: '#0E101A', color: '#FFFFFF' }}
              >
                SC
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[13px] font-medium block" style={{ color: '#0E101A' }}>
                  SourceCo Team
                </span>
                <p className="text-[11px] mt-0.5 truncate" style={{ color: '#9A9A9A' }}>
                  Ask us anything
                </p>
              </div>
            </div>
          </button>

          {/* Separator */}
          {filteredThreads.length > 0 && (
            <div className="mx-5 my-1" style={{ borderTop: '1px solid #F0EDE6' }} />
          )}

          {/* Deal threads */}
          {filteredThreads.map((thread) => (
            <ThreadListItem
              key={thread.connection_request_id}
              thread={thread}
              isSelected={selectedThreadId === thread.connection_request_id}
              onClick={() => onSelectThread(thread.connection_request_id)}
            />
          ))}

          {filteredThreads.length === 0 && threads.length > 0 && searchQuery && (
            <div className="p-8 text-center">
              <p className="text-xs" style={{ color: '#9A9A9A' }}>
                No conversations match
              </p>
            </div>
          )}

          {threads.length === 0 && (
            <div className="p-8 text-center">
              <Inbox className="h-6 w-6 mx-auto mb-2" style={{ color: '#E5DDD0' }} />
              <p className="text-[11px]" style={{ color: '#9A9A9A' }}>
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
        'w-full text-left px-5 py-3 transition-colors',
        isSelected ? '' : 'hover:bg-[#FAFAF8]',
      )}
      style={{
        backgroundColor: isSelected ? '#FAFAF8' : undefined,
      }}
    >
      <div className="flex items-start gap-3">
        {/* Deal initial avatar */}
        <div
          className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-[10px] font-medium"
          style={{
            backgroundColor: '#F8F8F6',
            color: '#9A9A9A',
          }}
        >
          {thread.deal_title.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          {/* Row 1: Deal title + time */}
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn('text-[13px] truncate', isUnread ? 'font-semibold' : 'font-medium')}
              style={{ color: '#0E101A' }}
            >
              {thread.deal_title}
            </span>
            <span className="text-[10px] flex-shrink-0" style={{ color: '#CBCBCB' }}>
              {timeLabel}
            </span>
          </div>

          {/* Row 2: Last message preview + unread dot */}
          <div className="flex items-center gap-2 mt-0.5">
            <p
              className={cn('text-[11px] truncate flex-1', isUnread ? 'font-medium' : '')}
              style={{ color: isUnread ? '#0E101A' : '#9A9A9A' }}
            >
              {thread.last_sender_role === 'buyer' && 'You: '}
              {parseReferences(thread.last_message_body || '').cleanBody || 'No messages yet'}
            </p>
            {isUnread && (
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ backgroundColor: '#DEC76B' }}
              />
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
