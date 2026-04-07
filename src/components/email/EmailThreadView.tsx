/**
 * EmailThreadView: Displays the full conversation within an email thread.
 * Shows each message with sender, timestamp, and full body content.
 */

import { useState } from 'react';
import DOMPurify from 'dompurify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowUpRight, ArrowDownLeft, Paperclip, ChevronDown, ChevronUp, Reply } from 'lucide-react';
import type { EmailThread, EmailMessage } from '@/types/email';

interface EmailThreadViewProps {
  thread: EmailThread;
  onReply?: (messageId: string) => void;
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MessageBubble({ message, onReply }: { message: EmailMessage; onReply?: (id: string) => void }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const isOutbound = message.direction === 'outbound';

  return (
    <div className={`rounded-lg border p-3 ${isOutbound ? 'bg-blue-50/50 dark:bg-blue-950/20' : 'bg-muted/30'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {isOutbound ? (
            <ArrowUpRight className="h-3.5 w-3.5 text-blue-500 shrink-0" />
          ) : (
            <ArrowDownLeft className="h-3.5 w-3.5 text-green-500 shrink-0" />
          )}
          <span className="text-xs font-medium truncate">{message.from_address}</span>
          <span className="text-[10px] text-muted-foreground">
            {isOutbound ? 'to' : 'from'}
          </span>
          <span className="text-xs truncate text-muted-foreground">
            {isOutbound ? message.to_addresses.join(', ') : message.from_address}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[10px] text-muted-foreground">{formatFullDate(message.sent_at)}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        </div>
      </div>

      {message.cc_addresses.length > 0 && (
        <div className="text-[10px] text-muted-foreground mt-1 ml-5">
          CC: {message.cc_addresses.join(', ')}
        </div>
      )}

      {isExpanded && (
        <>
          <div className="mt-2 ml-5">
            {message.body_html ? (
              <div
                className="prose prose-sm max-w-none dark:prose-invert text-xs [&_*]:text-xs"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(message.body_html, { ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'img'], ALLOWED_ATTR: ['href', 'target', 'rel', 'src', 'alt', 'style', 'class'], ADD_ATTR: ['target'], FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'] }) }}
              />
            ) : (
              <p className="text-xs whitespace-pre-wrap">{message.body_text}</p>
            )}
          </div>

          {message.has_attachments && message.attachment_metadata.length > 0 && (
            <div className="mt-2 ml-5 flex flex-wrap gap-1.5">
              {message.attachment_metadata.map((att, i) => (
                <Badge key={i} variant="outline" className="text-[10px] gap-1">
                  <Paperclip className="h-2.5 w-2.5" />
                  {att.name} ({formatFileSize(att.size)})
                </Badge>
              ))}
              <span className="text-[10px] text-muted-foreground italic ml-1">
                Available in Outlook
              </span>
            </div>
          )}

          {onReply && (
            <div className="mt-2 ml-5">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => onReply(message.microsoft_message_id)}
              >
                <Reply className="h-3 w-3 mr-1" />
                Reply
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function EmailThreadView({ thread, onReply }: EmailThreadViewProps) {
  return (
    <div className="space-y-2">
      {thread.messages.map((message) => (
        <MessageBubble key={message.id} message={message} onReply={onReply} />
      ))}
    </div>
  );
}
