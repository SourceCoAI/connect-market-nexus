import type { BuyerType } from '@/types/remarketing';
import { REMARKETING_BUYER_TYPE_OPTIONS } from '@/types/remarketing';

export const BUYER_TYPES = REMARKETING_BUYER_TYPE_OPTIONS;

// Sponsor-type buyer types that get the PE firm page treatment
export const SPONSOR_TYPES: BuyerType[] = [
  'private_equity',
  'independent_sponsor',
  'search_fund',
  'family_office',
];

export const isSponsorType = (buyerType: string | null | undefined): boolean =>
  SPONSOR_TYPES.includes(buyerType as BuyerType);

export type BuyerTab = 'all' | 'private_equity' | 'corporate' | 'needs_review' | 'needs_agreements' | 'unsigned_agreements' | 'needs_pe_link';

// Helper to find a PE firm record by name in the buyers list
export const findPeFirmByName = (buyers: unknown[], firmName: string): unknown | null => {
  return (
    buyers?.find((b: unknown) => {
      const buyer = b as { buyer_type?: string; company_name?: string };
      return buyer.buyer_type === 'private_equity' && buyer.company_name === firmName;
    }) || null
  );
};

export const PAGE_SIZE = 50;

export const getBuyerTypeLabel = (type: string | null) => {
  const found = BUYER_TYPES.find((t) => t.value === type);
  return found?.label || type || '-';
};
