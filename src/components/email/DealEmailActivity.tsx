/**
 * DealEmailActivity: Shows Smartlead email activity for a deal.
 * Queries smartlead_reply_inbox by linked_deal_id.
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Mail, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { useDealEmailActivity } from '@/hooks/email';
import type { SmartleadReplyRecord } from '@/hooks/email/useEmailMessages';

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

const CATEGORY_COLORS: Record<string, string> = {
  meeting_request: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  interested: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  question: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  referral: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  not_now: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  not_interested: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  unsubscribe: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  out_of_office: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  negative_hostile: 'bg-red-200 text-red-900 dark:bg-red-900/40 dark:text-red-200',
  neutral: 'bg-muted text-muted-foreground',
};

function getCategoryLabel(cat: string): string {
  return cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function ReplyItem({ record }: { record: SmartleadReplyRecord }) {
  const replyPreview = record.reply_body ? stripHtml(record.reply_body) : '';
  const sentPreview = record.sent_message_body ? stripHtml(record.sent_message_body) : '';
  const category = record.manual_category || record.ai_category || 'neutral';
  const timestamp = record.time_replied || record.event_timestamp || record.created_at;
  const leadName = [record.lead_first_name, record.lead_last_name].filter(Boolean).join(' ');

  return (
    <div className="flex items-start gap-3 py-2.5 border-b last:border-b-0">
      <div className="mt-0.5 shrink-0">
        <ArrowDownLeft className="h-4 w-4 text-green-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-medium truncate">
              {leadName || record.from_email || 'Unknown'}
            </span>
            {record.lead_company_name && (
              <span className="text-[10px] text-muted-foreground shrink-0">
                ({record.lead_company_name})
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
            {formatDate(timestamp)}
          </span>
        </div>
        <p className="text-xs font-medium mt-0.5">{record.subject || '(No subject)'}</p>
        
        {/* Reply body */}
        {replyPreview && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            <span className="font-medium text-foreground/70">Reply:</span>{' '}
            {replyPreview.slice(0, 150)}{replyPreview.length > 150 ? '...' : ''}
          </p>
        )}
        
        {/* Original sent message */}
        {sentPreview && !replyPreview && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            <span className="font-medium text-foreground/70">Sent:</span>{' '}
            {sentPreview.slice(0, 120)}{sentPreview.length > 120 ? '...' : ''}
          </p>
        )}

        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <Badge className={`text-[10px] px-1.5 py-0 ${CATEGORY_COLORS[category] || CATEGORY_COLORS.neutral}`}>
            {getCategoryLabel(category)}
          </Badge>
          {record.ai_sentiment && record.ai_sentiment !== 'neutral' && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {record.ai_sentiment}
            </Badge>
          )}
          {record.campaign_name && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 max-w-[200px] truncate">
              {record.campaign_name}
            </Badge>
          )}
          {record.recategorized_by && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700">
              Recategorized
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}

export function DealEmailActivity({ dealId, dealTitle }: DealEmailActivityProps) {
  const { data: replies, isLoading, error } = useDealEmailActivity(dealId);

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
          {replies && replies.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {replies.length}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Failed to load email activity.
          </p>
        ) : !replies || replies.length === 0 ? (
          <div className="text-center py-8">
            <Mail className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              No email activity for {dealTitle || 'this deal'} yet.
            </p>
          </div>
        ) : (
          <div className="divide-y-0">
            {replies.map((record) => (
              <ReplyItem key={record.id} record={record} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
