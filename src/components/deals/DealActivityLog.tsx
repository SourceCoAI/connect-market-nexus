/**
 * DealActivityLog — System notification timeline for a single deal.
 * Quiet luxury palette: dots use #0E101A, #DEC76B, emerald, #E5DDD0.
 */

import { Skeleton } from '@/components/ui/skeleton';
import { Info } from 'lucide-react';
import { useConnectionMessages } from '@/hooks/use-connection-messages';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface DealActivityLogProps {
  requestId: string;
  requestStatus: 'pending' | 'approved' | 'rejected' | 'on_hold';
}

function getDotColor(body: string): string {
  const lower = body.toLowerCase();
  if (
    lower.includes('approved') ||
    lower.includes('selected') ||
    lower.includes('signed') ||
    lower.includes('accepted')
  ) {
    return 'bg-emerald-500';
  }
  if (lower.includes('rejected') || lower.includes('declined') || lower.includes('not selected')) {
    return 'bg-[#E5DDD0]';
  }
  if (lower.includes('nda') || lower.includes('fee agreement')) {
    return 'bg-[#DEC76B]';
  }
  return 'bg-[#0E101A]';
}

export function DealActivityLog({
  requestId,
  requestStatus: _requestStatus,
}: DealActivityLogProps) {
  const { data: allMessages = [], isLoading } = useConnectionMessages(requestId);
  const systemMessages = allMessages.filter(
    (msg) => msg.message_type === 'system' || msg.message_type === 'decision',
  );

  return (
    <div className="border border-[#F0EDE6] rounded-xl overflow-hidden bg-white">
      {/* Subtitle */}
      <div className="px-5 pt-4 pb-2">
        <p className="text-[11px] text-[#0E101A]/30">Automated notifications and system events</p>
      </div>

      {/* Timeline */}
      <div className="min-h-[200px] max-h-[500px] overflow-y-auto px-5 py-2">
        {isLoading ? (
          <div className="space-y-3 py-3">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-3/4 rounded-lg" />
          </div>
        ) : systemMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6">
            <div className="rounded-full bg-[#F8F6F1] p-3 mb-3">
              <Info className="h-5 w-5 text-[#0E101A]/20" />
            </div>
            <p className="text-[13px] font-medium text-[#0E101A]/60 mb-1">No activity yet</p>
            <p className="text-[11px] text-[#0E101A]/30 text-center max-w-xs">
              System notifications like agreement requests, status changes, and deal updates will
              appear here.
            </p>
          </div>
        ) : (
          <div>
            {systemMessages.map((msg, index) => {
              const dotColor = getDotColor(msg.body);
              const isLast = index === systemMessages.length - 1;
              return (
                <div
                  key={msg.id}
                  className={cn(
                    'flex items-start gap-3 py-3',
                    !isLast && 'border-b border-[#F0EDE6]',
                  )}
                >
                  <div className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', dotColor)} />
                  <p className="flex-1 text-[13px] text-[#0E101A]/60 leading-relaxed">{msg.body}</p>
                  <span className="text-[11px] text-[#0E101A]/25 shrink-0 whitespace-nowrap">
                    {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
