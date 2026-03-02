import { useState, useEffect, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  MessageSquare,
  Send,
  ArrowLeft,
  Building2,
  FileText,
  Archive,
  ExternalLink,
  UserCheck,
  PanelRightOpen,
  PanelRightClose,
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
  onBack: () => void;
  adminProfiles?: Record<string, unknown> | null;
}

// ─── Component ───

export function ThreadView({ thread, onBack, adminProfiles }: ThreadViewProps) {
  const { data: messages = [], isLoading } = useConnectionMessages(thread.connection_request_id);
  const sendMsg = useSendMessage();
  const markRead = useMarkMessagesReadByAdmin();
  const updateState = useUpdateConversationState();
  const claimThread = useClaimThread();
  const navigate = useNavigate();
  const [newMessage, setNewMessage] = useState('');
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
    sendMsg.mutate({
      connection_request_id: thread.connection_request_id,
      body: newMessage.trim(),
      sender_role: 'admin',
    });
    setNewMessage('');
  };

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

  const conversationStateLabel = (() => {
    switch (thread.conversation_state) {
      case 'waiting_on_admin':
        return { label: 'Needs Reply', color: 'text-destructive bg-destructive/10' };
      case 'waiting_on_buyer':
        return { label: 'Waiting on Buyer', color: 'text-amber-600 bg-amber-50' };
      case 'claimed':
        return { label: 'Claimed', color: 'text-primary bg-primary/10' };
      case 'closed':
        return { label: 'Closed', color: 'text-muted-foreground bg-muted' };
      default:
        return { label: 'New', color: 'text-blue-600 bg-blue-50' };
    }
  })();

  const claimedByName =
    thread.claimed_by && adminProfiles?.[thread.claimed_by]
      ? `${(adminProfiles[thread.claimed_by] as { first_name?: string; last_name?: string }).first_name || ''} ${(adminProfiles[thread.claimed_by] as { first_name?: string; last_name?: string }).last_name || ''}`.trim()
      : null;

  return (
    <div className="flex h-full min-h-0">
    <div className="flex flex-col flex-1 min-h-0 min-w-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border flex-shrink-0">
        <Button variant="ghost" size="sm" onClick={onBack} className="md:hidden h-8 w-8 p-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground truncate">{thread.buyer_name}</h2>
            <span
              className={cn(
                'px-1.5 py-0.5 rounded text-[10px] font-medium',
                conversationStateLabel.color,
              )}
            >
              {conversationStateLabel.label}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {thread.buyer_company && (
              <span className="flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {thread.buyer_company}
              </span>
            )}
            {thread.deal_title && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {thread.deal_title}
                </span>
              </>
            )}
            {claimedByName && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="flex items-center gap-1">
                  <UserCheck className="w-3 h-3" />
                  {claimedByName}
                </span>
              </>
            )}
          </div>
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
      <ScrollArea className="flex-1" style={{ backgroundColor: '#FCF9F0' }}>
        <div className="px-5 py-4 space-y-3">
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
                      className="bg-muted/40 italic text-sm px-3 py-1.5 rounded-full max-w-[80%]"
                      style={{ color: '#3a3a3a' }}
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
                <div
                  key={msg.id}
                  className={cn(
                    'max-w-[80%] rounded-xl px-4 py-3 space-y-1 shadow-sm',
                    isAdmin ? 'ml-auto border' : 'mr-auto border',
                  )}
                  style={
                    isAdmin
                      ? { backgroundColor: '#F7F4DD', borderColor: '#E5DDD0', color: '#0E101A' }
                      : { backgroundColor: '#FFFFFF', borderColor: '#E5DDD0', color: '#0E101A' }
                  }
                >
                  <div className="flex items-center gap-2 text-[11px]" style={{ color: '#5A5A5A' }}>
                    <span className="font-medium">{isAdmin ? 'You' : msg.senderName}</span>
                    <span>·</span>
                    <span>
                      {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                    </span>
                    {msg.isInquiry && (
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                        style={{ backgroundColor: '#DEC76B', color: '#0E101A' }}
                      >
                        Initial Inquiry
                      </span>
                    )}
                    {msg.body.startsWith('\u{1F4C4} Question about NDA') && (
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                        style={{ backgroundColor: '#DBEAFE', color: '#1E40AF' }}
                      >
                        NDA Question
                      </span>
                    )}
                    {msg.body.startsWith('\u{1F4C4} Question about Fee Agreement') && (
                      <span
                        className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                        style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}
                      >
                        Fee Agreement
                      </span>
                    )}
                  </div>
                  <p
                    className="text-base whitespace-pre-wrap leading-relaxed"
                    style={{ color: '#0E101A' }}
                  >
                    {msg.body}
                  </p>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Compose bar */}
      {thread.conversation_state !== 'closed' ? (
        <div className="px-5 py-3 flex-shrink-0" style={{ borderTop: '1px solid #E5DDD0' }}>
          <div
            className="flex items-end gap-3 rounded-lg border-2 p-2"
            style={{ borderColor: '#E5DDD0', backgroundColor: '#FFFFFF' }}
          >
            <Textarea
              placeholder="Type a message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="min-h-[50px] max-h-[120px] resize-none text-sm flex-1 border-0 shadow-none focus-visible:ring-0 p-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSend();
              }}
            />
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!newMessage.trim() || sendMsg.isPending}
              className="h-9 px-4"
              style={{ backgroundColor: '#0E101A', color: '#FFFFFF' }}
            >
              <Send className="w-3.5 h-3.5 mr-1.5" />
              Send
            </Button>
          </div>
          <p className="text-[10px] mt-1" style={{ color: '#9A9A9A' }}>
            Cmd/Ctrl + Enter to send
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
