import { useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminConnectionRequest } from '@/types/admin';

export type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected' | 'on_hold';
export type BuyerTypeFilter =
  | 'all'
  | 'private_equity'
  | 'corporate'
  | 'family_office'
  | 'independent_sponsor'
  | 'search_fund'
  | 'individual_buyer';
export type NdaFilter = 'all' | 'signed' | 'not_signed' | 'sent';
export type FeeAgreementFilter = 'all' | 'signed' | 'not_signed' | 'sent';
export type SortOption =
  | 'newest'
  | 'oldest'
  | 'buyer_priority'
  | 'deal_size'
  | 'approval_date'
  | 'score_highest'
  | 'score_lowest';

export function usePipelineFilters(requests: AdminConnectionRequest[]) {
  // URL-persisted filter state (survives browser Back navigation)
  const [searchParams, setSearchParams] = useSearchParams();

  const statusFilter = (searchParams.get('status') as StatusFilter) ?? 'pending';
  const setStatusFilter = useCallback(
    (v: StatusFilter) => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v !== 'pending') n.set('status', v);
          else n.delete('status');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const buyerTypeFilter = (searchParams.get('buyerType') as BuyerTypeFilter) ?? 'all';
  const setBuyerTypeFilter = useCallback(
    (v: BuyerTypeFilter) => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v !== 'all') n.set('buyerType', v);
          else n.delete('buyerType');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const ndaFilter = (searchParams.get('nda') as NdaFilter) ?? 'all';
  const setNdaFilter = useCallback(
    (v: NdaFilter) => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v !== 'all') n.set('nda', v);
          else n.delete('nda');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const feeAgreementFilter = (searchParams.get('fee') as FeeAgreementFilter) ?? 'all';
  const setFeeAgreementFilter = useCallback(
    (v: FeeAgreementFilter) => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v !== 'all') n.set('fee', v);
          else n.delete('fee');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const sortOption = (searchParams.get('sortBy') as SortOption) ?? 'newest';
  const setSortOption = useCallback(
    (v: SortOption) => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v !== 'newest') n.set('sortBy', v);
          else n.delete('sortBy');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Buyer type priority mapping (higher number = higher priority)
  const getBuyerPriority = (buyerType: string | undefined): number => {
    switch (buyerType) {
      case 'private_equity':
        return 6;
      case 'independent_sponsor':
        return 5;
      case 'family_office':
        return 4;
      case 'corporate':
        return 3;
      case 'search_fund':
        return 2;
      case 'individual_buyer':
        return 1;
      default:
        return 0;
    }
  };

  const filteredAndSortedRequests = useMemo(() => {
    let filtered = requests;

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter((request) => request.status === statusFilter);
    }

    // Apply buyer type filter
    if (buyerTypeFilter !== 'all') {
      filtered = filtered.filter((request) => request.user?.buyer_type === buyerTypeFilter);
    }

    // Apply NDA filter — use only CR-level fields, never stale profile booleans
    if (ndaFilter !== 'all') {
      filtered = filtered.filter((request) => {
        switch (ndaFilter) {
          case 'signed':
            return !!request.lead_nda_signed;
          case 'not_signed':
            return !request.lead_nda_signed;
          case 'sent':
            return !!request.lead_nda_email_sent && !request.lead_nda_signed;
          default:
            return true;
        }
      });
    }

    // Apply Fee Agreement filter — use only CR-level fields, never stale profile booleans
    if (feeAgreementFilter !== 'all') {
      filtered = filtered.filter((request) => {
        switch (feeAgreementFilter) {
          case 'signed':
            return !!request.lead_fee_agreement_signed;
          case 'not_signed':
            return !request.lead_fee_agreement_signed;
          case 'sent':
            return !!request.lead_fee_agreement_email_sent && !request.lead_fee_agreement_signed;
          default:
            return true;
        }
      });
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      switch (sortOption) {
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();

        case 'buyer_priority': {
          const priorityA = getBuyerPriority(a.user?.buyer_type);
          const priorityB = getBuyerPriority(b.user?.buyer_type);
          if (priorityB !== priorityA) {
            return priorityB - priorityA; // Higher priority first
          }
          // If same priority, sort by newest
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }

        case 'deal_size': {
          const revenueA = a.listing?.revenue || 0;
          const revenueB = b.listing?.revenue || 0;
          if (revenueB !== revenueA) {
            return revenueB - revenueA; // Higher revenue first
          }
          // If same revenue, sort by newest
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }

        case 'approval_date':
          if (a.status === 'approved' && b.status === 'approved') {
            const approvalA = a.approved_at ? new Date(a.approved_at).getTime() : 0;
            const approvalB = b.approved_at ? new Date(b.approved_at).getTime() : 0;
            return approvalB - approvalA;
          }
          if (a.status === 'approved' && b.status !== 'approved') return -1;
          if (b.status === 'approved' && a.status !== 'approved') return 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();

        case 'score_highest': {
          const scoreA = ((a.user as unknown as Record<string, unknown>)?.buyer_quality_score as number) ?? -1;
          const scoreB = ((b.user as unknown as Record<string, unknown>)?.buyer_quality_score as number) ?? -1;
          if (scoreB !== scoreA) return scoreB - scoreA;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }

        case 'score_lowest': {
          const scoreA =
            ((a.user as unknown as Record<string, unknown>)?.buyer_quality_score as number) ?? Infinity;
          const scoreB =
            ((b.user as unknown as Record<string, unknown>)?.buyer_quality_score as number) ?? Infinity;
          if (scoreA !== scoreB) return scoreA - scoreB;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }

        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

    return sorted;
  }, [requests, statusFilter, buyerTypeFilter, ndaFilter, feeAgreementFilter, sortOption]);

  return {
    statusFilter,
    buyerTypeFilter,
    ndaFilter,
    feeAgreementFilter,
    sortOption,
    filteredAndSortedRequests,
    setStatusFilter,
    setBuyerTypeFilter,
    setNdaFilter,
    setFeeAgreementFilter,
    setSortOption,
  };
}
