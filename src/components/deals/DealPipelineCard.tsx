/**
 * DealPipelineCard — Minimal sidebar card for buyer's deal pipeline.
 *
 * Clean 3-line layout: Title, category/EBITDA, status + timestamp.
 * Gold dot for unread. Gold left-border on selected.
 * No icon boxes — lightweight and scannable.
 */

import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { ConnectionRequest } from '@/types';

function formatEbitdaCompact(ebitda: number): string {
  if (ebitda >= 1_000_000) return `$${(ebitda / 1_000_000).toFixed(1)}M`;
  if (ebitda >= 1_000) return `$${Math.round(ebitda / 1_000)}K`;
  return `$${ebitda}`;
}

function getStatusLabel(
  status: string,
  ndaSigned?: boolean,
): { label: string; needsAction: boolean } {
  switch (status) {
    case 'pending':
      if (ndaSigned === false) return { label: 'Action Needed', needsAction: true };
      return { label: 'Under Review', needsAction: false };
    case 'approved':
      return { label: 'Connected', needsAction: false };
    case 'rejected':
      return { label: 'Not Selected', needsAction: false };
    case 'on_hold':
      return { label: 'On Hold', needsAction: false };
    default:
      return { label: 'Under Review', needsAction: false };
  }
}

function isGeneralInquiry(listing?: ConnectionRequest['listing']): boolean {
  if (!listing) return true;
  const noCategory = !listing.category || listing.category === 'Internal';
  const noEbitda = !listing.ebitda || listing.ebitda === 0;
  return noCategory && noEbitda;
}

interface DealPipelineCardProps {
  request: ConnectionRequest;
  isSelected: boolean;
  unreadCount: number;
  ndaSigned?: boolean;
  hasCim?: boolean;
  onSelect: () => void;
  pendingAction?: string;
}

export function DealPipelineCard({
  request,
  isSelected,
  unreadCount,
  ndaSigned,
  onSelect,
}: DealPipelineCardProps) {
  const isRejected = request.status === 'rejected';
  const statusLabel = getStatusLabel(request.status, ndaSigned);
  const isGeneral = isGeneralInquiry(request.listing);

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full text-left rounded-lg transition-all duration-150 px-3.5 py-3 relative group',
        isSelected ? 'bg-[#FAFAF8]' : 'bg-transparent hover:bg-[#FAFAF8]/60',
        isRejected && 'opacity-45',
      )}
    >
      {/* Gold left accent */}
      {isSelected && (
        <div className="absolute left-0 top-2.5 bottom-2.5 w-[2px] rounded-r-full bg-[#DEC76B]" />
      )}

      {/* Row 1: Title + Unread dot */}
      <div className="flex items-center gap-2">
        <h3 className="text-[13px] font-semibold text-[#0E101A] truncate leading-tight flex-1 min-w-0">
          {request.listing?.title || 'Untitled'}
        </h3>
        {unreadCount > 0 && <div className="h-2 w-2 rounded-full bg-[#DEC76B] shrink-0" />}
      </div>

      {/* Row 2: Category + EBITDA (skip for General Inquiry) */}
      {!isGeneral && (
        <div className="flex items-center gap-1.5 mt-1">
          {request.listing?.category && request.listing.category !== 'Internal' && (
            <span className="text-[11px] text-[#0E101A]/35 truncate">
              {request.listing.category}
            </span>
          )}
          {request.listing?.ebitda && request.listing.ebitda > 0 && (
            <>
              {request.listing?.category && request.listing.category !== 'Internal' && (
                <span className="text-[#0E101A]/15">·</span>
              )}
              <span className="text-[11px] font-medium text-[#0E101A]/50">
                {formatEbitdaCompact(request.listing.ebitda)} EBITDA
              </span>
            </>
          )}
        </div>
      )}
      {isGeneral && (
        <div className="mt-1">
          <span className="text-[11px] text-[#0E101A]/30">General Inquiry</span>
        </div>
      )}

      {/* Row 3: Status + Timestamp */}
      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-1.5">
          {statusLabel.needsAction && (
            <div className="h-1.5 w-1.5 rounded-full bg-[#DEC76B] shrink-0" />
          )}
          <span
            className={cn(
              'text-[10px] font-semibold uppercase tracking-wide',
              request.status === 'approved'
                ? 'text-[#0E101A]'
                : request.status === 'rejected'
                  ? 'text-[#0E101A]/30'
                  : statusLabel.needsAction
                    ? 'text-[#8B6F47]'
                    : 'text-[#0E101A]/40',
            )}
          >
            {statusLabel.label}
          </span>
        </div>
        <span className="text-[10px] text-[#0E101A]/25">
          {formatDistanceToNow(new Date(request.updated_at || request.created_at), {
            addSuffix: true,
          })}
        </span>
      </div>
    </button>
  );
}
