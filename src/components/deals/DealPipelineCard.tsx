/**
 * DealPipelineCard — Minimal sidebar card for buyer's deal pipeline.
 *
 * Clean 3-line layout: Title, category/EBITDA, status + timestamp.
 * Gold dot for unread. Gold left-border on selected.
 */

import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { ConnectionRequest } from '@/types';
import {
  TechnologyIcon, HealthcareIcon, ManufacturingIcon, FinanceIcon,
  RetailIcon, RealEstateIcon, FoodBeverageIcon, ProfessionalServicesIcon,
  ConstructionIcon, TransportationIcon, EducationIcon, HospitalityIcon,
  EnergyIcon, MediaIcon, AutomotiveIcon, AgricultureIcon,
  TelecommunicationsIcon, ConsumerGoodsIcon, BusinessServicesIcon,
  DefaultCategoryIcon,
} from '@/components/icons/CategoryIcons';

function getCategoryIcon(category?: string) {
  if (!category) return DefaultCategoryIcon;
  const cat = category.toLowerCase();
  if (cat.includes('technology') || cat.includes('software')) return TechnologyIcon;
  if (cat.includes('healthcare') || cat.includes('medical')) return HealthcareIcon;
  if (cat.includes('manufacturing')) return ManufacturingIcon;
  if (cat.includes('finance') || cat.includes('insurance')) return FinanceIcon;
  if (cat.includes('retail') || cat.includes('e-commerce')) return RetailIcon;
  if (cat.includes('real estate')) return RealEstateIcon;
  if (cat.includes('food') || cat.includes('beverage')) return FoodBeverageIcon;
  if (cat.includes('professional services')) return ProfessionalServicesIcon;
  if (cat.includes('construction')) return ConstructionIcon;
  if (cat.includes('transportation') || cat.includes('logistics')) return TransportationIcon;
  if (cat.includes('education')) return EducationIcon;
  if (cat.includes('hospitality') || cat.includes('tourism')) return HospitalityIcon;
  if (cat.includes('energy') || cat.includes('utilities')) return EnergyIcon;
  if (cat.includes('media') || cat.includes('entertainment')) return MediaIcon;
  if (cat.includes('automotive')) return AutomotiveIcon;
  if (cat.includes('agriculture')) return AgricultureIcon;
  if (cat.includes('telecommunications')) return TelecommunicationsIcon;
  if (cat.includes('consumer goods')) return ConsumerGoodsIcon;
  if (cat.includes('business services')) return BusinessServicesIcon;
  return DefaultCategoryIcon;
}

function formatEbitdaCompact(ebitda: number): string {
  if (ebitda >= 1_000_000) return `$${(ebitda / 1_000_000).toFixed(1)}M`;
  if (ebitda >= 1_000) return `$${Math.round(ebitda / 1_000)}K`;
  return `$${ebitda}`;
}

function getStatusLabel(status: string, ndaSigned?: boolean): string {
  switch (status) {
    case 'pending': return ndaSigned ? 'Under Review' : 'Pending';
    case 'approved': return 'Connected';
    case 'rejected': return 'Not Selected';
    default: return 'Under Review';
  }
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
  const CategoryIcon = getCategoryIcon(request.listing?.category);
  const isRejected = request.status === 'rejected';
  const statusLabel = getStatusLabel(request.status, ndaSigned);

  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full text-left rounded-lg border transition-all duration-150 px-4 py-3.5 relative group',
        isSelected
          ? 'border-[#0E101A] bg-white'
          : 'border-[#F0EDE6] bg-white hover:border-[#E5DDD0]',
        isRejected && 'opacity-50',
      )}
    >
      {/* Gold left accent */}
      {isSelected && (
        <div className="absolute left-0 top-3 bottom-3 w-[2px] rounded-r-full bg-[#DEC76B]" />
      )}

      {/* Row 1: Icon + Title + Unread dot */}
      <div className="flex items-center gap-3">
        <div className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-md',
          isSelected ? 'bg-[#0E101A]' : 'bg-[#F8F6F1]',
        )}>
          <CategoryIcon className={cn('h-4 w-4', isSelected ? 'text-[#DEC76B]' : 'text-[#0E101A]/50')} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-[#0E101A] truncate leading-tight">
              {request.listing?.title || 'Untitled'}
            </h3>
            {unreadCount > 0 && (
              <div className="h-2 w-2 rounded-full bg-[#DEC76B] shrink-0" />
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Category + EBITDA */}
      <div className="flex items-center gap-1.5 mt-1.5 pl-11">
        {request.listing?.category && (
          <span className="text-[11px] text-[#0E101A]/40 truncate">{request.listing.category}</span>
        )}
        {request.listing?.ebitda && (
          <>
            <span className="text-[#0E101A]/20">·</span>
            <span className="text-[11px] font-medium text-[#0E101A]/60">
              {formatEbitdaCompact(request.listing.ebitda)} EBITDA
            </span>
          </>
        )}
      </div>

      {/* Row 3: Status + Timestamp */}
      <div className="flex items-center justify-between mt-2 pl-11">
        <span className={cn(
          'text-[10px] font-semibold uppercase tracking-wide',
          request.status === 'approved' ? 'text-[#0E101A]' :
          request.status === 'rejected' ? 'text-[#0E101A]/30' :
          'text-[#8B6F47]',
        )}>
          {statusLabel}
        </span>
        <span className="text-[10px] text-[#0E101A]/30">
          {formatDistanceToNow(new Date(request.updated_at || request.created_at), { addSuffix: true })}
        </span>
      </div>
    </button>
  );
}
