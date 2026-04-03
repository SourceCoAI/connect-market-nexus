import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

import { useBuyerThreads, useFirmAgreementStatus } from './useMessagesData';
import { ConversationList } from './ConversationList';
import {
  BuyerThreadView,
  GeneralChatView,
  PendingAgreementBanner,
  BuyerMessagesSkeleton,
} from './MessageThread';
import type { MessageReference } from './types';

// ─── Main Component ───

export default function BuyerMessages() {
  const { data: threads = [], isLoading, error } = useBuyerThreads();
  useFirmAgreementStatus();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    searchParams.get('deal') || null,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [showGeneralChat, setShowGeneralChat] = useState(false);
  const [reference, setReference] = useState<MessageReference | null>(null);

  useEffect(() => {
    const dealParam = searchParams.get('deal');
    if (dealParam === 'general') {
      setShowGeneralChat(true);
      setSelectedThreadId(null);
    } else if (dealParam && threads.find((t) => t.connection_request_id === dealParam)) {
      setSelectedThreadId(dealParam);
      setShowGeneralChat(false);
    }
  }, [searchParams, threads]);

  useEffect(() => {
    if (!isLoading && !selectedThreadId && !showGeneralChat) {
      setShowGeneralChat(true);
    }
  }, [isLoading, selectedThreadId, showGeneralChat]);

  useEffect(() => {
    setReference(null);
  }, [selectedThreadId, showGeneralChat]);

  const handleSelectThread = (requestId: string) => {
    setSelectedThreadId(requestId);
    setShowGeneralChat(false);
    setSearchParams({ deal: requestId });
  };

  const handleSelectGeneral = () => {
    setShowGeneralChat(true);
    setSelectedThreadId(null);
    setSearchParams({ deal: 'general' });
  };

  const selectedThread = threads.find((t) => t.connection_request_id === selectedThreadId);

  const filteredThreads = useMemo(() => {
    if (!searchQuery.trim()) return threads;
    const q = searchQuery.toLowerCase();
    return threads.filter(
      (t) =>
        t.deal_title.toLowerCase().includes(q) ||
        (t.deal_category || '').toLowerCase().includes(q) ||
        t.last_message_body.toLowerCase().includes(q),
    );
  }, [threads, searchQuery]);

  const totalUnread = useMemo(() => threads.reduce((sum, t) => sum + t.unread_count, 0), [threads]);

  const availableDocuments = useMemo(() => {
    const docs: Array<{ type: 'nda' | 'fee_agreement'; label: string }> = [];
    docs.push({ type: 'nda', label: 'NDA' });
    docs.push({ type: 'fee_agreement', label: 'Fee Agreement' });
    return docs;
  }, []);

  const hasActiveView = selectedThreadId && selectedThread;

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col">
      {/* Main content -- full bleed */}
      {error ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-destructive mb-1">Failed to load messages</p>
            <p className="text-xs" style={{ color: '#9A9A9A' }}>
              Please try refreshing the page.
            </p>
          </div>
        </div>
      ) : isLoading ? (
        <div className="flex-1 px-6 py-6">
          <BuyerMessagesSkeleton />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col" style={{ backgroundColor: '#FFFFFF' }}>
          {/* Agreement banner -- slim strip */}
          <PendingAgreementBanner />

          {/* Two-column layout */}
          <div className="flex-1 min-h-0 flex">
            {/* Conversation List */}
            <ConversationList
              threads={threads}
              filteredThreads={filteredThreads}
              selectedThreadId={selectedThreadId}
              showGeneralChat={showGeneralChat}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              onSelectThread={handleSelectThread}
              onSelectGeneral={handleSelectGeneral}
              onReferenceChange={setReference}
              totalUnread={totalUnread}
            />

            {/* Thread View */}
            <div
              className={cn(
                'flex-1 flex flex-col min-h-0',
                !hasActiveView && !showGeneralChat ? 'hidden md:flex' : 'flex',
              )}
            >
              {showGeneralChat ? (
                <GeneralChatView
                  onBack={() => {
                    setShowGeneralChat(false);
                    setSearchParams({});
                  }}
                  allThreads={threads}
                  availableDocuments={availableDocuments}
                  reference={reference}
                  onReferenceChange={setReference}
                />
              ) : hasActiveView ? (
                <BuyerThreadView
                  thread={selectedThread!}
                  onBack={() => {
                    setSelectedThreadId(null);
                    setSearchParams({});
                  }}
                  allThreads={threads}
                  availableDocuments={availableDocuments}
                  reference={reference}
                  onReferenceChange={setReference}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <Inbox className="h-8 w-8 mx-auto mb-3" style={{ color: '#E5DDD0' }} />
                    <p className="text-[13px] font-medium" style={{ color: '#9A9A9A' }}>
                      Select a conversation
                    </p>
                    <p className="text-[11px] mt-1" style={{ color: '#CBCBCB' }}>
                      Choose a deal or message the team
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
