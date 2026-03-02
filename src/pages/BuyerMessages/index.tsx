import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Inbox, MessageSquarePlus } from 'lucide-react';
import { cn } from '@/lib/utils';

import { useBuyerThreads, useFirmAgreementStatus } from './useMessagesData';
import { ConversationList } from './ConversationList';
import { ReferencePanel } from './ReferencePanel';
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
  useFirmAgreementStatus(); // keep data warm for reference picker
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    searchParams.get('deal') || null,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [showGeneralChat, setShowGeneralChat] = useState(false);

  // Lifted reference state for the ReferencePanel ↔ MessageInput coordination
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

  // Clear reference when switching threads
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

  // Build available documents list for the reference picker
  const availableDocuments = useMemo(() => {
    const docs: Array<{ type: 'nda' | 'fee_agreement'; label: string }> = [];
    docs.push({ type: 'nda', label: 'NDA' });
    docs.push({ type: 'fee_agreement', label: 'Fee Agreement' });
    return docs;
  }, []);

  const hasActiveView = selectedThreadId && selectedThread;

  return (
    <div
      className="h-[calc(100vh-80px)] flex flex-col"
      style={{ fontFamily: 'Montserrat, Inter, sans-serif' }}
    >
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: '#0E101A' }}>
            Messages{totalUnread > 0 ? ` (${totalUnread})` : ''}
          </h1>
          <Button
            onClick={handleSelectGeneral}
            size="sm"
            variant="ghost"
            className="gap-1.5 text-xs hover:bg-[#FAFAF8]"
            style={{ color: '#0E101A' }}
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            New Message
          </Button>
        </div>
      </div>

      {/* Main content */}
      {error ? (
        <div className="flex-1 px-6 pb-6 pt-4">
          <div
            className="rounded-xl flex flex-col items-center justify-center py-16"
            style={{ border: '1px solid #F0EDE6' }}
          >
            <p className="text-sm text-destructive mb-1">Failed to load messages</p>
            <p className="text-xs" style={{ color: '#9A9A9A' }}>
              Please try refreshing the page.
            </p>
          </div>
        </div>
      ) : isLoading ? (
        <div className="flex-1 px-6 pb-6 pt-4">
          <BuyerMessagesSkeleton />
        </div>
      ) : (
        <div
          className="flex-1 min-h-0 mx-6 mb-6 rounded-xl overflow-hidden flex flex-col"
          style={{ border: '1px solid #F0EDE6', backgroundColor: '#FFFFFF' }}
        >
          {/* Pending agreement banner -- inside container */}
          <div className="flex-shrink-0">
            <PendingAgreementBanner />
          </div>

          <div className="flex-1 min-h-0 flex">
          {/* Conversation List (left panel) */}
          <ConversationList
            threads={threads}
            filteredThreads={filteredThreads}
            selectedThreadId={selectedThreadId}
            showGeneralChat={showGeneralChat}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSelectThread={handleSelectThread}
            onSelectGeneral={handleSelectGeneral}
          />

          {/* Thread View (center panel) */}
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
                  <Inbox className="h-10 w-10 mx-auto mb-3" style={{ color: '#E5DDD0' }} />
                  <p className="text-sm font-medium" style={{ color: '#9A9A9A' }}>
                    Select a conversation
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Reference Panel (right panel) -- desktop only */}
          <ReferencePanel
            threads={threads}
            documents={availableDocuments}
            activeReference={reference}
            onSelectReference={setReference}
          />
          </div>
        </div>
      )}
    </div>
  );
}
