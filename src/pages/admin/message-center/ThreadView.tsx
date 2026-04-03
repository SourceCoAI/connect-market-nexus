import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  MessageSquare,
  Send,
  ArrowLeft,
  Archive,
  ExternalLink,
  UserCheck,
  PanelRightOpen,
  PanelRightClose,
  AtSign,
} from 'lucide-react';
import {
  useConnectionMessages,
  useSendMessage,
  useMarkMessagesReadByAdmin,
} from '@/hooks/use-connection-messages';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import type { InboxThread } from './types';
import { ThreadContextPanel } from './ThreadContextPanel';
import { MessageBody } from '@/pages/BuyerMessages/MessageBody';
import { ReferenceChip, ReferencePicker } from '@/pages/BuyerMessages/ReferencePicker';
import { encodeReference } from '@/pages/BuyerMessages/types';
import type { MessageReference } from '@/pages/BuyerMessages/types';

// ─── Hooks (used only by ThreadView) ───

function useUpdateConversationState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      requestId,
      state,
      claimedBy,
    }: {
      requestId: string;
      state: string;
      claimedBy?: string | null;
    }) => {
      const updates: Record<string, unknown> = { conversation_state: state };
      if (claimedBy !== undefined) {
        updates.claimed_by = claimedBy;
        updates.claimed_at = claimedBy ? new Date().toISOString() : null;
      }
      const { error } = await supabase
        .from('connection_requests')
        .update(updates as never)
        .eq('id', requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox-threads'] });
    },
  });
}

function useClaimThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, adminId }: { requestId: string; adminId: string | null }) => {
      const updates: Record<string, unknown> = {
        claimed_by: adminId,
        claimed_at: adminId ? new Date().toISOString() : null,
        conversation_state: adminId ? 'claimed' : 'new',
      };
      const { error } = await supabase
        .from('connection_requests')
        .update(updates as never)
        .eq('id', requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inbox-threads'] });
    },
  });
}

// ─── Props ───

export interface ThreadViewProps {
  thread: InboxThread;
  allBuyerThreads?: InboxThread[];
  onSelectThread?: (id: string) => void;
  onBack: () => void;
  adminProfiles?: Record<string, unknown> | null;
}

// ─── Component ───

export function ThreadView({ thread, allBuyerThreads = [], onSelectThread, onBack, adminProfiles }: ThreadViewProps) {
  const { data: messages = [], isLoading } = useConnectionMessages(thread.connection_request_id);
  const sendMsg = useSendMessage();
  const markRead = useMarkMessagesReadByAdmin();
  const updateState = useUpdateConversationState();
  const claimThread = useClaimThread();
  const navigate = useNavigate();
  const [newMessage, setNewMessage] = useState('');
  const [reference, setReference] = useState<MessageReference | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showContext, setShowContext] = useState(true);

  // Get current admin ID for claim
  const [currentAdminId, setCurrentAdminId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentAdminId(data.user?.id || null));
  }, []);

  useEffect(() => {
    if (thread.connection_request_id && thread.unread_count > 0) {
      markRead.mutate(thread.connection_request_id);
    }
  }, [thread.connection_request_id, thread.unread_count]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!newMessage.trim()) return;
    let body = newMessage.trim();
    if (reference) {
      body = encodeReference(reference) + ' ' + body;
    }
    sendMsg.mutate({
      connection_request_id: thread.connection_request_id,
      body,
      sender_role: 'admin',
    });
    setNewMessage('');
    setReference(null);
  };

  // Build document and deal options for the admin reference picker
  const adminDocuments: Array<{ type: 'nda' | 'fee_agreement'; label: string }> = [
    { type: 'nda', label: 'NDA' },
    { type: 'fee_agreement', label: 'Fee Agreement' },
  ];
  const adminThreads = thread.deal_title && thread.listing_id
    ? [{ connection_request_id: thread.connection_request_id, deal_title: thread.deal_title, listing_id: thread.listing_id, request_status: thread.request_status, last_message_body: '', last_message_at: '', last_sender_role: '', unread_count: 0 }]
    : [];

  const allMessages = useMemo(() => {
    const combined: Array<{
      id: string;
      body: string;
      sender_role: string;
      senderName: string;
      created_at: string;
      message_type?: string;
      isInquiry?: boolean;
    }> = [];

    if (thread.user_message) {
      combined.push({
        id: 'inquiry',
        body: thread.user_message,
        sender_role: 'buyer',
        senderName: thread.buyer_name,
        created_at: thread.created_at,
        isInquiry: true,
      });
    }

    messages.forEach((msg) => {
      const isAdmin = msg.sender_role === 'admin';
      const senderName = msg.sender
        ? `${msg.sender.first_name || ''} ${msg.sender.last_name || ''}`.trim() ||
          msg.sender.email ||
          'Unknown'
        : isAdmin
          ? 'Admin'
          : thread.buyer_name;
      combined.push({
        id: msg.id,
        body: msg.body,
        sender_role: msg.sender_role,
        senderName,
        created_at: msg.created_at,
        message_type: msg.message_type,
      });
    });

    return combined;
  }, [thread, messages]);

  const claimedByName =
    thread.claimed_by && adminProfiles?.[thread.claimed_by]
      ? `${(adminProfiles[thread.claimed_by] as { first_name?: string; last_name?: string }).first_name || ''} ${(adminProfiles[thread.claimed_by] as { first_name?: string; last_name?: string }).last_name || ''}`.trim()
      : null;

  return (
    <div className="flex h-full min-h-0">
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #F0EDE6' }}>
        <Button variant="ghost" size="sm" onClick={onBack} className="md:hidden h-8 w-8 p-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold truncate" style={{ color: '#0E101A' }}>{thread.buyer_name}</h2>
          <p className="text-[11px] truncate mt-0.5" style={{ color: '#9A9A9A' }}>
            {[thread.buyer_company, thread.deal_title, claimedByName ? `Claimed by ${claimedByName}` : null].filter(Boolean).join(' · ')}
          </p>
        </div>

        {/* Quick actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Context panel toggle */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  onClick={() => setShowContext(!showContext)}
                >
                  {showContext ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{showContext ? 'Hide buyer context' : 'Show buyer context'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Pipeline link */}
          {thread.pipeline_deal_id && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => navigate(`/admin/pipeline?deal=${thread.pipeline_deal_id}`)}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View in Pipeline</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Claim / Unclaim */}
          {!thread.claimed_by && currentAdminId && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() =>
                      claimThread.mutate({
                        requestId: thread.connection_request_id,
                        adminId: currentAdminId,
                      })
                    }
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Claim this conversation</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {thread.claimed_by === currentAdminId && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      claimThread.mutate({ requestId: thread.connection_request_id, adminId: null })
                    }
                  >
                    Unclaim
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Release this conversation</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Close / Reopen */}
          {thread.conversation_state !== 'closed' && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() =>
                      updateState.mutate({
                        requestId: thread.connection_request_id,
                        state: 'closed',
                      })
                    }
                  >
                    <Archive className="w-3.5 h-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Close conversation</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {thread.conversation_state === 'closed' && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                updateState.mutate({
                  requestId: thread.connection_request_id,
                  state: 'new',
                })
              }
            >
              Reopen
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1" style={{ backgroundColor: '#FFFFFF' }}>
        <div className="px-5 py-4 space-y-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-3/4" />
              ))}
            </div>
          ) : allMessages.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <MessageSquare className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No messages yet</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  Send a message to start the conversation
                </p>
              </div>
            </div>
          ) : (
            allMessages.map((msg) => {
              const isAdmin = msg.sender_role === 'admin';
              const isSystem = msg.message_type === 'decision' || msg.message_type === 'system';

              if (isSystem) {
                return (
                  <div key={msg.id} className="flex justify-center">
                    <div
                      className="italic text-[11px] px-3 py-1.5 rounded-full max-w-[80%]"
                      style={{ backgroundColor: '#F8F8F6', color: '#9A9A9A' }}
                    >
                      {msg.body}
                      <span className="opacity-50 text-[10px] ml-2">
                        {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                );
              }

              return (
                <div key={msg.id} className={cn('max-w-[80%]', isAdmin ? 'ml-auto' : 'mr-auto')}>
                  {/* Sender + time label outside bubble */}
                  <div className={cn('flex items-center gap-1.5 mb-1 text-[10px]', isAdmin ? 'justify-end' : '')} style={{ color: '#CBCBCB' }}>
                    <span className="font-medium" style={{ color: '#9A9A9A' }}>{isAdmin ? 'You' : msg.senderName}</span>
                    <span>·</span>
                    <span>{formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}</span>
                    {msg.isInquiry && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold" style={{ backgroundColor: '#DEC76B', color: '#0E101A' }}>
                        Initial Inquiry
                      </span>
                    )}
                  </div>
                  <div
                    className="rounded-xl px-4 py-3 space-y-1"
                    style={
                      isAdmin
                        ? { backgroundColor: '#F8F8F6', color: '#0E101A' }
                        : { backgroundColor: '#FFFFFF', border: '1px solid #F0EDE6', color: '#0E101A' }
                    }
                  >
                    <MessageBody body={msg.body} variant={isAdmin ? 'admin' : 'buyer'} />
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Compose bar */}
      {thread.conversation_state !== 'closed' ? (
        <div className="px-5 py-3 flex-shrink-0" style={{ borderTop: '1px solid #F0EDE6' }}>
          {/* Reference chip */}
          {reference && (
            <div className="mb-2">
              <ReferenceChip
                reference={reference}
                variant="compose"
                onRemove={() => setReference(null)}
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Reference picker */}
            <ReferencePicker
              threads={adminThreads}
              documents={adminDocuments}
              onSelect={(ref) => setReference(ref)}
            >
              <button
                type="button"
                className="shrink-0 p-1.5 rounded-full hover:bg-muted transition-colors"
                title="Reference a document or deal"
              >
                <AtSign className="h-4 w-4" style={{ color: reference ? '#DEC76B' : '#CBCBCB' }} />
              </button>
            </ReferencePicker>

            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type a message..."
              className="flex-1 text-sm py-2 bg-transparent focus:outline-none"
              style={{ color: '#0E101A' }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!newMessage.trim() || sendMsg.isPending}
              className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full transition-colors disabled:opacity-30"
              style={{ backgroundColor: newMessage.trim() ? '#0E101A' : 'transparent' }}
            >
              <Send
                className="w-3.5 h-3.5"
                style={{ color: newMessage.trim() ? '#FFFFFF' : '#CBCBCB' }}
              />
            </button>
          </div>
          <p className="text-[10px] mt-1" style={{ color: '#9A9A9A' }}>
            Enter to send · @ to reference
          </p>
        </div>
      ) : (
        <div className="border-t border-border px-5 py-3 text-center">
          <p className="text-xs text-muted-foreground">This conversation is closed</p>
        </div>
      )}
    </div>
    {/* Buyer context panel */}
    {showContext && (
      <ThreadContextPanel
        userId={thread.user_id}
        buyerName={thread.buyer_name}
        buyerEmail={thread.buyer_email}
        buyerCompany={thread.buyer_company}
      />
    )}
    </div>
  );
}
