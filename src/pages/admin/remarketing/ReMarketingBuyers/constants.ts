import type { BuyerType } from '@/types/remarketing';

export const BUYER_TYPES: { value: BuyerType; label: string }[] = [
  { value: 'pe_firm', label: 'PE Firm' },
  { value: 'platform', label: 'Platform' },
  { value: 'strategic', label: 'Strategic' },
  { value: 'family_office', label: 'Family Office' },
  { value: 'independent_sponsor', label: 'Independent Sponsor' },
  { value: 'search_fund', label: 'Search Fund' },
  { value: 'other', label: 'Other' },
];

// Sponsor-type buyer types that get the PE firm page treatment
export const SPONSOR_TYPES: BuyerType[] = [
  'pe_firm',
  'independent_sponsor',
  'search_fund',
  'family_office',
];

export const isSponsorType = (buyerType: string | null | undefined): boolean =>
  SPONSOR_TYPES.includes(buyerType as BuyerType);

export type BuyerTab = 'all' | 'pe_firm' | 'platform' | 'needs_agreements' | 'unsigned_agreements';

// Helper to find a PE firm record by name in the buyers list
export const findPeFirmByName = (buyers: unknown[], firmName: string): unknown | null => {
  return (
    buyers?.find((b: unknown) => {
      const buyer = b as { buyer_type?: string; company_name?: string };
      return buyer.buyer_type === 'pe_firm' && buyer.company_name === firmName;
    }) || null
  );
};

export const PAGE_SIZE = 50;

export const getBuyerTypeLabel = (type: string | null) => {
  const found = BUYER_TYPES.find((t) => t.value === type);
  return found?.label || type || '-';
};
