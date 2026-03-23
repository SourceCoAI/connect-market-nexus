import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, ArrowLeft, Loader2, CheckCheck } from 'lucide-react';
import { useConnectionMessages, useMarkMessagesReadByBuyer } from '@/hooks/use-connection-messages';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

import { useResolvedThreadId } from './useMessagesData';
import { MessageBody } from './MessageBody';
import { MessageInput } from './MessageInput';
import type { MessageReference } from './types';
import { encodeReference } from './types';
import type { BuyerThread } from './helpers';

// ─── GeneralChatView ───

interface GeneralChatViewProps {
  onBack: () => void;
  allThreads?: BuyerThread[];
  availableDocuments?: Array<{ type: 'nda' | 'fee_agreement'; label: string }>;
  /** External reference state from parent (ReferencePanel) */
  reference?: MessageReference | null;
  onReferenceChange?: (ref: MessageReference | null) => void;
}

export function GeneralChatView({
  onBack,
  allThreads = [],
  availableDocuments = [],
  reference: externalReference,
  onReferenceChange: externalOnReferenceChange,
}: GeneralChatViewProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Use external reference state if provided, else local
  const [localReference, setLocalReference] = useState<MessageReference | null>(null);
  const reference = externalOnReferenceChange ? (externalReference ?? null) : localReference;
  const setReference = externalOnReferenceChange || setLocalReference;

  const { data: resolvedThread, isLoading: resolving } = useResolvedThreadId();
  const threadId = resolvedThread?.connection_request_id;

  const { data: existingMessages = [] } = useConnectionMessages(threadId || '');
  const markRead = useMarkMessagesReadByBuyer();

  // Mark admin messages as read when the thread is opened / new messages arrive
  const unreadCount = existingMessages.filter(
    (m) => m.sender_role === 'admin' && !m.is_read_by_buyer,
  ).length;

  useEffect(() => {
    if (threadId && unreadCount > 0) {
      markRead.mutate(threadId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, unreadCount]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [existingMessages]);

  const handleSend = async () => {
    if ((!newMessage.trim() && !attachment) || sending || !user?.id || !threadId) return;
    setSending(true);

    let body = newMessage.trim();

    // Prepend reference tag if present
    if (reference) {
      body = `${encodeReference(reference)}\n${body}`;
    }

    if (attachment) {
      setUploading(true);
      try {
        const bucketPath = `general/${user.id}/${Date.now()}-${attachment.name}`;
        const { error: uploadError } = await supabase.storage
          .from('message-attachments')
          .upload(bucketPath, attachment);

        if (uploadError) {
          toast({
            title: 'Upload failed',
            description: `Could not upload ${attachment.name}. Message sent without attachment.`,
            variant: 'destructive',
          });
        } else {
          const { data: urlData } = supabase.storage
            .from('message-attachments')
            .getPublicUrl(bucketPath);
          if (urlData?.publicUrl) {
            body = body
              ? `${body}\n[📎 ${attachment.name}](${urlData.publicUrl})`
              : `[📎 ${attachment.name}](${urlData.publicUrl})`;
          }
        }
      } catch {
        toast({
          title: 'Upload failed',
          description: `Could not upload ${attachment.name}. Message sent without attachment.`,
          variant: 'destructive',
        });
      } finally {
        setUploading(false);
      }
    }

    if (!body) {
      setSending(false);
      return;
    }

    try {
      const { error } = await supabase.from('connection_messages').insert({
        connection_request_id: threadId,
        sender_id: user.id,
        body,
        sender_role: 'buyer',
        is_read_by_buyer: true,
      });
      if (error) throw error;

      // Notify admin of new buyer message (fire-and-forget)
      supabase.functions
        .invoke('notify-admin-new-message', {
          body: {
            connection_request_id: threadId,
            message_preview: body.substring(0, 200),
          },
        })
        .catch(console.error);

      setNewMessage('');
      setAttachment(null);
      setReference(null);
      queryClient.invalidateQueries({ queryKey: ['buyer-message-threads'] });
      queryClient.invalidateQueries({ queryKey: ['connection-messages', threadId] });
    } catch (err) {
      console.error('Error sending message:', err);
      toast({
        title: 'Failed to Send',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  if (resolving) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: '#CBCBCB' }} />
        <p className="text-xs" style={{ color: '#9A9A9A' }}>
          Loading...
        </p>
      </div>
    );
  }

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
        <div
          className="h-7 w-7 rounded-full flex items-center justify-center text-[9px] font-semibold tracking-wide"
          style={{ backgroundColor: '#0E101A', color: '#FFFFFF' }}
        >
          SC
        </div>
        <h2 className="text-[13px] font-semibold" style={{ color: '#0E101A' }}>
          SourceCo Team
        </h2>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 bg-white">
        <div className="px-5 py-4 space-y-4">
          {existingMessages.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <MessageSquare className="h-8 w-8 mx-auto mb-2" style={{ color: '#E5DDD0' }} />
                <p className="text-sm" style={{ color: '#9A9A9A' }}>
                  Send a message to start a conversation.
                </p>
              </div>
            </div>
          ) : (
            existingMessages.map((msg) => {
              const isBuyer = msg.sender_role === 'buyer';
              return (
                <div
                  key={msg.id}
                  className={cn('flex flex-col', isBuyer ? 'items-end' : 'items-start')}
                >
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

                  {isBuyer && msg.is_read_by_admin && (
                    <div className="mt-0.5 mr-1">
                      <CheckCheck className="h-3 w-3" style={{ color: '#DEC76B' }} />
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <MessageInput
        value={newMessage}
        onChange={(e) => setNewMessage(e.target.value)}
        onSend={handleSend}
        isSending={sending}
        isUploading={uploading}
        attachment={attachment}
        onAttachmentChange={setAttachment}
        placeholder="Message the SourceCo team..."
        reference={reference}
        onReferenceChange={setReference}
        threads={allThreads}
        documents={availableDocuments}
      />
    </div>
  );
}
