/**
 * DealDetailHeader — Minimal white header for the deal detail panel.
 *
 * Title left, EBITDA right, category/location as small text below.
 * Status badge as a small pill. "View listing" link inline.
 */

import { cn } from '@/lib/utils';
import { formatCompactCurrency } from '@/lib/utils';
import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';

interface DealDetailHeaderProps {
  listingId: string;
  title: string;
  category?: string;
  location?: string;
  acquisitionType?: string | null;
  ebitda?: number;
  revenue?: number;
  requestStatus: 'pending' | 'approved' | 'rejected' | 'on_hold';
  ndaSigned?: boolean;
  hasCim?: boolean;
}

function getStatusConfig(status: string): { label: string; className: string } {
  switch (status) {
    case 'approved':
      return { label: 'Connected', className: 'bg-[#0E101A] text-white' };
    case 'rejected':
      return { label: 'Not Selected', className: 'bg-[#F5F3EE] text-[#0E101A]/40' };
    case 'on_hold':
      return { label: 'On Hold', className: 'bg-[#FBF7EC] text-[#8B6F47] border border-[#E5DDD0]' };
    default:
      return {
        label: 'Under Review',
        className: 'bg-[#FBF7EC] text-[#8B6F47] border border-[#E5DDD0]',
      };
  }
}

export function DealDetailHeader({
  listingId,
  title,
  category,
  location,
  ebitda,
  revenue,
  requestStatus,
}: DealDetailHeaderProps) {
  const status = getStatusConfig(requestStatus);
  const ebitdaMargin =
    ebitda && revenue && revenue > 0 ? ((ebitda / revenue) * 100).toFixed(0) : null;

  return (
    <div className="px-4 sm:px-6 py-5 border-b border-[#F0EDE6]">
      {/* Top: Title + Status + View link */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-[#0E101A] truncate">{title}</h2>
            <span
              className={cn(
                'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0',
                status.className,
              )}
            >
              {status.label}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {category && <span className="text-[12px] text-[#0E101A]/40">{category}</span>}
            {location && (
              <>
                <span className="text-[#0E101A]/15">·</span>
                <span className="text-[12px] text-[#0E101A]/40">{location}</span>
              </>
            )}
            <Link
              to={`/listing/${listingId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-[#0E101A]/30 hover:text-[#0E101A]/60 transition-colors ml-1"
            >
              View listing <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* EBITDA */}
        {ebitda && (
          <div className="text-right shrink-0">
            <div className="text-lg font-semibold text-[#0E101A] tabular-nums">
              {formatCompactCurrency(ebitda)}
            </div>
            <div className="text-[11px] text-[#0E101A]/35">
              EBITDA{ebitdaMargin ? ` · ${ebitdaMargin}% margin` : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
