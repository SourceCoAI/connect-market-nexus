/**
 * MessagesSection.tsx
 *
 * Tabbed card containing the Conversation Thread and Internal Notes.
 * Extracts the ConversationThread sub-component and the linkifyText helper.
 */
import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Send, Lock, Link2 } from 'lucide-react';
import { UserNotesSection } from '../UserNotesSection';
import {
  useConnectionMessages,
  useSendMessage,
  useMarkMessagesReadByAdmin,
} from '@/hooks/use-connection-messages';
import { formatDistanceToNow, format } from 'date-fns';

// ─── Helpers ───

function escapeHtmlChars(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function linkifyText(text: string): string {
  const urlRegex = /(https?:\/\/[^\s<]+)/g;
  // First escape the entire text to prevent XSS, then replace URLs with links
  const escaped = escapeHtmlChars(text);
  return escaped.replace(urlRegex, (url) => {
    const display = url.length > 60 ? url.substring(0, 57) + '...' : url;
    return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-primary underline hover:text-primary/80 break-all" onclick="event.stopPropagation()">${display}</a>`;
  });
}

// ─── Conversation Thread ───

function ConversationThread({
  connectionRequestId,
  buyerName,
  buyerInitials,
  buyerMessage,
  submittedAt,
}: {
  connectionRequestId: string;
  buyerName: string;
  buyerInitials: string;
  buyerMessage?: string;
  submittedAt?: string;
}) {
  const { data: messages = [] } = useConnectionMessages(connectionRequestId);
  const sendMsg = useSendMessage();
  const markRead = useMarkMessagesReadByAdmin();
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (connectionRequestId) {
      markRead.mutate(connectionRequestId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionRequestId, messages.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  const handleSend = () => {
    if (!newMessage.trim()) return;
    sendMsg.mutate({
      connection_request_id: connectionRequestId,
      body: newMessage.trim(),
      sender_role: 'admin',
    });
    setNewMessage('');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="min-h-[300px] max-h-[500px] overflow-y-auto p-6 space-y-5 bg-sourceco-muted/30">
        {/* Buyer's opening message — always first */}
        {buyerMessage && (
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-sourceco flex items-center justify-center text-sourceco-foreground text-xs font-bold shrink-0 shadow-sm">
                {buyerInitials}
              </div>
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-[15px] font-semibold text-foreground">{buyerName}</span>
                <span className="text-xs text-muted-foreground">
                  {submittedAt ? format(new Date(submittedAt), 'MMM d, yyyy') : ''}
                </span>
              </div>
              <Badge
                variant="outline"
                className="text-xs bg-sourceco/10 text-sourceco-muted-foreground border-sourceco/30 shrink-0 font-medium px-2.5 py-1"
              >
                <Link2 className="h-3 w-3 mr-1.5" />
                Connection Request
              </Badge>
            </div>
            <div className="ml-12">
              <div className="bg-sourceco-muted border border-sourceco/30 text-foreground rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm">
                <p
                  className="text-sm leading-relaxed whitespace-pre-wrap break-words"
                  dangerouslySetInnerHTML={{ __html: linkifyText(buyerMessage) }}
                />
              </div>
            </div>
          </div>
        )}

        {/* No messages empty state */}
        {messages.length === 0 && !buyerMessage && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
              <Send className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">
              No messages yet — respond below to start the conversation.
            </p>
          </div>
        )}

        {messages.length === 0 && buyerMessage && (
          <p className="text-sm text-muted-foreground italic text-center py-3">
            No replies yet — respond below to start the conversation.
          </p>
        )}

        {/* Subsequent messages */}
        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.message_type === 'decision' || msg.message_type === 'system' ? (
              <div className="bg-sourceco/10 border border-sourceco/30 rounded-lg px-5 py-3 text-center mx-auto max-w-lg">
                <p
                  className="text-sm text-foreground whitespace-pre-wrap break-words"
                  dangerouslySetInnerHTML={{ __html: linkifyText(msg.body) }}
                />
                <span className="text-xs text-muted-foreground mt-1 block">
                  {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                </span>
              </div>
            ) : msg.sender_role === 'admin' ? (
              <div className="flex flex-col items-end">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                  </span>
                  <span className="text-sm font-semibold text-foreground">You</span>
                  <div className="w-8 h-8 rounded-full bg-sourceco/20 flex items-center justify-center text-xs font-bold text-sourceco-muted-foreground">
                    SC
                  </div>
                </div>
                <div className="mr-10 bg-sourceco/10 border border-sourceco/20 text-foreground rounded-2xl rounded-tr-sm px-5 py-4 max-w-[85%] shadow-sm">
                  <p
                    className="text-sm leading-relaxed whitespace-pre-wrap break-words"
                    dangerouslySetInnerHTML={{ __html: linkifyText(msg.body) }}
                  />
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-full bg-sourceco flex items-center justify-center text-sourceco-foreground text-[10px] font-bold shadow-sm">
                    {buyerInitials}
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    {msg.sender?.first_name || buyerName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                  </span>
                </div>
                <div className="ml-10 bg-sourceco-muted/50 border border-sourceco/20 text-foreground rounded-2xl rounded-tl-sm px-5 py-4 max-w-[85%] shadow-sm">
                  <p
                    className="text-sm leading-relaxed whitespace-pre-wrap break-words"
                    dangerouslySetInnerHTML={{ __html: linkifyText(msg.body) }}
                  />
                </div>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-sourceco/20 p-5 bg-sourceco-muted/20">
        <div className="border border-sourceco/30 rounded-xl overflow-hidden focus-within:border-sourceco/60 focus-within:ring-2 focus-within:ring-sourceco/15 transition-all bg-background">
          <textarea
            rows={3}
            placeholder="Reply to this buyer..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
            className="w-full border-none resize-none text-sm text-foreground bg-transparent px-5 py-4 focus:outline-none placeholder:text-muted-foreground/60"
          />
          <div className="flex items-center justify-between px-4 py-3 border-t border-sourceco/15 bg-sourceco-muted/20">
            <span className="text-xs text-muted-foreground">⌘ + Enter to send</span>
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!newMessage.trim() || sendMsg.isPending}
              className="h-9 px-5 text-sm font-semibold bg-sourceco hover:bg-sourceco/90 text-sourceco-foreground shadow-sm"
            >
              <Send className="h-3.5 w-3.5 mr-2" />
              Send Reply
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Messages Section (Tabs: Thread + Notes) ───

interface MessagesSectionProps {
  requestId?: string;
  userId: string;
  buyerName: string;
  buyerInitials: string;
  userMessage?: string;
  createdAt?: string;
  activeTab: 'thread' | 'notes';
  setActiveTab: (tab: 'thread' | 'notes') => void;
}

export function MessagesSection({
  requestId,
  userId,
  buyerName,
  buyerInitials,
  userMessage,
  createdAt,
  activeTab,
  setActiveTab,
}: MessagesSectionProps) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      {/* Tab bar */}
      <div className="border-b border-border px-5 flex items-center bg-muted/30">
        <button
          className={`py-3 px-1 text-[13.5px] font-medium border-b-2 transition-colors mr-5 ${
            activeTab === 'thread'
              ? 'border-sourceco text-sourceco font-bold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('thread')}
        >
          Conversation Thread
        </button>
        <button
          className={`py-3 px-1 text-[13.5px] font-medium border-b-2 transition-colors ${
            activeTab === 'notes'
              ? 'border-sourceco text-sourceco font-bold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('notes')}
        >
          Internal Notes
        </button>
      </div>

      {activeTab === 'thread' && requestId && (
        <ConversationThread
          connectionRequestId={requestId}
          buyerName={buyerName}
          buyerInitials={buyerInitials}
          buyerMessage={userMessage}
          submittedAt={createdAt}
        />
      )}

      {activeTab === 'notes' && (
        <div className="p-5 bg-muted/20">
          <div className="bg-muted/50 border border-border rounded-lg px-4 py-2.5 mb-4 text-xs text-foreground flex items-center gap-2">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            Internal notes are only visible to your team — buyers cannot see these.
          </div>
          <UserNotesSection userId={userId} userName={buyerName} />
        </div>
      )}
    </div>
  );
}
