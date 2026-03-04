import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const BUYER_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  private_equity: { label: 'PE Firm', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  pe_firm: { label: 'PE Firm', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  family_office: { label: 'Family Office', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  corporate: { label: 'Strategic', color: 'bg-green-100 text-green-700 border-green-200' },
  strategic: { label: 'Strategic', color: 'bg-green-100 text-green-700 border-green-200' },
  independent_sponsor: { label: 'Ind. Sponsor', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  search_fund: { label: 'Search Fund', color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
  individual_buyer: { label: 'Individual', color: 'bg-gray-100 text-gray-600 border-gray-200' },
};

interface BuyerTypeBadgeProps {
  buyerType: string | null | undefined;
  className?: string;
}

export function BuyerTypeBadge({ buyerType, className }: BuyerTypeBadgeProps) {
  if (!buyerType) return null;
  const config = BUYER_TYPE_CONFIG[buyerType] || {
    label: buyerType.replace(/_/g, ' '),
    color: 'bg-gray-100 text-gray-600 border-gray-200',
  };

  return (
    <Badge variant="outline" className={cn('text-[10px]', config.color, className)}>
      {config.label}
    </Badge>
  );
}
