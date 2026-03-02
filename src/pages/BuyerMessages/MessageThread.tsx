import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, ExternalLink, Inbox } from 'lucide-react';
import {
  useConnectionMessages,
  useSendMessage,
  useMarkMessagesReadByBuyer,
} from '@/hooks/use-connection-messages';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

import type { BuyerThread } from './helpers';
import type { MessageReference } from './types';
import { encodeReference } from './types';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

// Re-export components consumed by index.tsx
export { GeneralChatView } from './GeneralChatView';
export { PendingAgreementBanner } from './AgreementSection';

// ─── BuyerThreadView ───

interface BuyerThreadViewProps {
  thread: BuyerThread;
  onBack: () => void;
  allThreads?: BuyerThread[];
  availableDocuments?: Array<{ type: 'nda' | 'fee_agreement'; label: string }>;
  /** External reference state from parent (ReferencePanel) */
  reference?: MessageReference | null;
  onReferenceChange?: (ref: MessageReference | null) => void;
}

export function BuyerThreadView({
  thread,
  onBack,
  allThreads = [],
  availableDocuments = [],
  reference: externalReference,
  onReferenceChange: externalOnReferenceChange,
}: BuyerThreadViewProps) {
  const { data: messages = [], isLoading } = useConnectionMessages(thread.connection_request_id);
  const sendMsg = useSendMessage();
  const markRead = useMarkMessagesReadByBuyer();
  useToast();
  const [newMessage, setNewMessage] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Use external reference state if provided, else local
  const [localReference, setLocalReference] = useState<MessageReference | null>(null);
  const reference = externalOnReferenceChange ? (externalReference ?? null) : localReference;
  const setReference = externalOnReferenceChange || setLocalReference;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isRejected = thread.request_status === 'rejected';

  // ─── Typing indicator state ───
  const [isAdminTyping, setIsAdminTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buyerTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    const channelName = `typing:${thread.connection_request_id}`;
    const channel = supabase.channel(channelName);

    channel
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload?.role === 'admin') {
          setIsAdminTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => {
            setIsAdminTyping(false);
          }, 3000);
        }
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (buyerTypingTimeoutRef.current) clearTimeout(buyerTypingTimeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [thread.connection_request_id]);

  const broadcastTyping = useCallback(() => {
    if (!channelRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { role: 'buyer' },
    });
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setNewMessage(e.target.value);
      if (!buyerTypingTimeoutRef.current) {
        broadcastTyping();
      }
      if (buyerTypingTimeoutRef.current) clearTimeout(buyerTypingTimeoutRef.current);
      buyerTypingTimeoutRef.current = setTimeout(() => {
        buyerTypingTimeoutRef.current = null;
      }, 1000);
    },
    [broadcastTyping],
  );

  useEffect(() => {
    setIsAdminTyping(false);
  }, [messages.length]);

  useEffect(() => {
    if (thread.connection_request_id && thread.unread_count > 0) {
      markRead.mutate(thread.connection_request_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.connection_request_id, thread.unread_count]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAdminTyping]);

  const handleSend = async () => {
    if ((!newMessage.trim() && !attachment) || isRejected) return;

    let body = newMessage.trim();

    // Prepend reference tag if present
    if (reference) {
      body = `${encodeReference(reference)}\n${body}`;
    }

    if (attachment) {
      setUploading(true);
      try {
        const filePath = `${thread.connection_request_id}/${Date.now()}-${attachment.name}`;
        const { error: uploadError } = await supabase.storage
          .from('message-attachments')
          .upload(filePath, attachment);

        if (uploadError) {
          body = body
            ? `${body}\n[📎 ${attachment.name}](attachment://${attachment.name})`
            : `[📎 ${attachment.name}](attachment://${attachment.name})`;
        } else {
          const { data: urlData } = supabase.storage
            .from('message-attachments')
            .getPublicUrl(filePath);
          const publicUrl = urlData?.publicUrl || `attachment://${attachment.name}`;
          body = body
            ? `${body}\n[📎 ${attachment.name}](${publicUrl})`
            : `[📎 ${attachment.name}](${publicUrl})`;
        }
      } catch {
        body = body
          ? `${body}\n[📎 ${attachment.name}](attachment://${attachment.name})`
          : `[📎 ${attachment.name}](attachment://${attachment.name})`;
      } finally {
        setUploading(false);
      }
    }

    if (!body) return;

    sendMsg.mutate({
      connection_request_id: thread.connection_request_id,
      body,
      sender_role: 'buyer',
    });
    setNewMessage('');
    setAttachment(null);
    setReference(null);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-3.5 flex-shrink-0"
        style={{ borderBottom: '1px solid #F0EDE6' }}
      >
        <Button variant="ghost" size="sm" onClick={onBack} className="md:hidden h-8 w-8 p-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-[13px] font-semibold truncate" style={{ color: '#0E101A' }}>
            {thread.deal_title}
          </h2>
        </div>
        <Link
          to={`/my-deals?deal=${thread.connection_request_id}`}
          className="text-[11px] flex items-center gap-1 shrink-0 hover:opacity-70 transition-opacity"
          style={{ color: '#9A9A9A' }}
        >
          View deal <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* Messages */}
      <MessageList
        messages={messages.map(m => ({
          ...m,
          sender: m.sender ? { first_name: m.sender.first_name ?? undefined } : undefined,
        }))}
        isLoading={isLoading}
        isAdminTyping={isAdminTyping}
        messagesEndRef={messagesEndRef}
      />

      {/* Compose bar */}
      {isRejected ? (
        <div className="px-5 py-3 text-center" style={{ borderTop: '1px solid #F0EDE6' }}>
          <p className="text-xs" style={{ color: '#9A9A9A' }}>
            This deal is no longer active.
          </p>
        </div>
      ) : (
        <MessageInput
          value={newMessage}
          onChange={handleInputChange}
          onSend={handleSend}
          isSending={sendMsg.isPending}
          isUploading={uploading}
          attachment={attachment}
          onAttachmentChange={setAttachment}
          placeholder="Message SourceCo about this deal..."
          reference={reference}
          onReferenceChange={setReference}
          threads={allThreads}
          documents={availableDocuments}
        />
      )}
    </div>
  );
}

// ─── BuyerMessagesSkeleton ───

export function BuyerMessagesSkeleton() {
  return (
    <div
      className="flex min-h-[500px]"
      style={{ backgroundColor: '#FFFFFF' }}
    >
      <div className="w-[300px] p-5 space-y-5" style={{ borderRight: '1px solid #F0EDE6' }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-3.5 w-[120px]" />
              <Skeleton className="h-3 w-[180px]" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex-1 flex items-center justify-center">
        <Inbox className="h-8 w-8" style={{ color: '#E5DDD0' }} />
      </div>
    </div>
  );
}
