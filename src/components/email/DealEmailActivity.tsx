/**
 * DealEmailActivity: Aggregated email activity feed across all contacts tied to a deal.
 * Shows a timeline of all email interactions on a deal.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, ArrowUpRight, ArrowDownLeft, Paperclip } from 'lucide-react';
import { useDealEmailActivity } from '@/hooks/email';
import type { EmailMessage } from '@/types/email';

interface DealEmailActivityProps {
  dealId: string;
  dealTitle?: string;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function EmailActivityItem({ message }: { message: EmailMessage }) {
  const isOutbound = message.direction === 'outbound';
  const preview = message.body_text || stripHtml(message.body_html || '');

  return (
    <div className="flex items-start gap-3 py-2.5 border-b last:border-b-0">
      <div className="mt-0.5 shrink-0">
        {isOutbound ? (
          <ArrowUpRight className="h-4 w-4 text-blue-500" />
        ) : (
          <ArrowDownLeft className="h-4 w-4 text-green-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-medium truncate">{message.from_address}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {isOutbound ? 'sent to' : 'received from'}
            </span>
            <span className="text-xs truncate text-muted-foreground">
              {isOutbound ? message.to_addresses[0] : message.from_address}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
            {formatDate(message.sent_at)}
          </span>
        </div>
        <p className="text-xs font-medium mt-0.5">{message.subject || '(No subject)'}</p>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          {preview.slice(0, 120)}{preview.length > 120 ? '...' : ''}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <Badge variant={isOutbound ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
            {isOutbound ? 'Outbound' : 'Inbound'}
          </Badge>
          {message.has_attachments && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
              <Paperclip className="h-2.5 w-2.5" />
              Attachments
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

export function DealEmailActivity({ dealId, dealTitle }: DealEmailActivityProps) {
  const { data: emails, isLoading, error } = useDealEmailActivity(dealId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email Activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4" />
          Email Activity
          {emails && emails.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {emails.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Failed to load email activity.
          </p>
        ) : !emails || emails.length === 0 ? (
          <div className="text-center py-8">
            <Mail className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              No email activity for {dealTitle || 'this deal'} yet.
            </p>
          </div>
        ) : (
          <div className="divide-y-0">
            {emails.map((email) => (
              <EmailActivityItem key={email.id} message={email} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
