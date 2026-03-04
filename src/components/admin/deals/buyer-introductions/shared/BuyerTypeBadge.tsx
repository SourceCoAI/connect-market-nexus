import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const BUYER_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  private_equity: { label: 'Private Equity', color: 'bg-[#1B3A6B]/10 text-[#1B3A6B] border-[#1B3A6B]/20' },
  family_office: { label: 'Family Office', color: 'bg-[#5B2D8E]/10 text-[#5B2D8E] border-[#5B2D8E]/20' },
  corporate: { label: 'Strategic', color: 'bg-[#1A6B3A]/10 text-[#1A6B3A] border-[#1A6B3A]/20' },
  platform_co: { label: 'Platform Co.', color: 'bg-[#0D7A72]/10 text-[#0D7A72] border-[#0D7A72]/20' },
  independent_sponsor: { label: 'Ind. Sponsor', color: 'bg-[#C25B00]/10 text-[#C25B00] border-[#C25B00]/20' },
  search_fund: { label: 'Search Fund', color: 'bg-[#8B1A1A]/10 text-[#8B1A1A] border-[#8B1A1A]/20' },
  individual_buyer: { label: 'Individual', color: 'bg-[#4A4A4A]/10 text-[#4A4A4A] border-[#4A4A4A]/20' },
};

interface BuyerTypeBadgeProps {
  buyerType: string | null | undefined;
  isPeBacked?: boolean;
  className?: string;
}

export function BuyerTypeBadge({ buyerType, isPeBacked, className }: BuyerTypeBadgeProps) {
  if (!buyerType) return null;

  // PE-backed corporate → show as Platform Co.
  const effectiveType =
    buyerType === 'corporate' && isPeBacked
      ? 'platform_co'
      : buyerType;

  const config = BUYER_TYPE_CONFIG[effectiveType] || {
    label: effectiveType.replace(/_/g, ' '),
    color: 'bg-gray-100 text-gray-600 border-gray-200',
  };

  return (
    <Badge variant="outline" className={cn('text-[10px]', config.color, className)}>
      {config.label}
    </Badge>
  );
}
