/**
 * EmailThreadList: Displays a reverse-chronological list of email threads for a contact.
 * Each thread shows subject, preview, timestamp, and team member involved.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, ArrowUpRight, ArrowDownLeft, ChevronDown, ChevronUp, Paperclip } from 'lucide-react';
import { useEmailThreads, useLogEmailAccess } from '@/hooks/email';
import type { EmailThread } from '@/types/email';
import { EmailThreadView } from './EmailThreadView';

interface EmailThreadListProps {
  contactId: string;
  additionalContactIds?: string[];
  contactName?: string;
  onCompose?: () => void;
  onReply?: (messageId: string, subject: string, quote: string, fromAddress: string) => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

export function EmailThreadList({ contactId, additionalContactIds, contactName, onCompose, onReply }: EmailThreadListProps) {
  const { data: threads, isLoading, error } = useEmailThreads(contactId, additionalContactIds);
  const [expandedThread, setExpandedThread] = useState<string | null>(null);
  const logAccess = useLogEmailAccess();

  const handleThreadClick = (thread: EmailThread) => {
    const isExpanding = expandedThread !== thread.conversationId;
    setExpandedThread(isExpanding ? thread.conversationId : null);

    // Log access for each message in the thread being viewed
    if (isExpanding) {
      for (const msg of thread.messages) {
        logAccess.mutate({ emailMessageId: msg.id, action: 'viewed' });
      }
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <p>Failed to load email history. Please try again.</p>
        </CardContent>
      </Card>
    );
  }

  if (!threads || threads.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Mail className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground mb-4">
            No email history found for {contactName || 'this contact'}.
          </p>
          {onCompose && (
            <Button onClick={onCompose} size="sm">
              <Mail className="mr-2 h-4 w-4" />
              Send First Email
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {threads.map((thread) => {
        const isExpanded = expandedThread === thread.conversationId;
        const lastMsg = thread.messages[thread.messages.length - 1];
        const isOutbound = lastMsg.direction === 'outbound';
        const preview = lastMsg.body_text || stripHtml(lastMsg.body_html || '');

        return (
          <Card
            key={thread.conversationId}
            className={`cursor-pointer transition-colors hover:bg-muted/50 ${isExpanded ? 'ring-1 ring-primary/20' : ''}`}
          >
            <div
              className="px-4 py-3 flex items-start gap-3"
              onClick={() => handleThreadClick(thread)}
            >
              <div className="mt-1 shrink-0">
                {isOutbound ? (
                  <ArrowUpRight className="h-4 w-4 text-blue-500" />
                ) : (
                  <ArrowDownLeft className="h-4 w-4 text-green-500" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-medium truncate">{thread.subject}</h4>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDate(thread.lastMessageAt)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {preview.slice(0, 100)}
                  {preview.length > 100 ? '...' : ''}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  {thread.messageCount > 1 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {thread.messageCount} messages
                    </Badge>
                  )}
                  {lastMsg.has_attachments && (
                    <Paperclip className="h-3 w-3 text-muted-foreground" />
                  )}
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {isOutbound ? 'Sent' : 'Received'}
                  </Badge>
                </div>
              </div>

              <div className="shrink-0 mt-1">
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </div>

            {isExpanded && (
              <div className="border-t px-4 py-3">
                <EmailThreadView
                  thread={thread}
                  onReply={onReply ? (messageId) => {
                    const lastMsg = thread.messages[thread.messages.length - 1];
                    onReply(
                      messageId,
                      thread.subject,
                      lastMsg.body_html || lastMsg.body_text || '',
                      lastMsg.direction === 'inbound' ? lastMsg.from_address : lastMsg.to_addresses[0] || '',
                    );
                  } : undefined}
                />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
