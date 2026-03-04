import { useCallback, useState } from 'react';
import { useBuyerIntroductions } from '@/hooks/use-buyer-introductions';
import type { BuyerIntroduction } from '@/types/buyer-introductions';
import { toast } from 'sonner';

/**
 * Thin wrapper that delegates to the existing `updateStatus` mutation in
 * `useBuyerIntroductions`.  Setting `introduction_status` to
 * `fit_and_interested` automatically triggers the deal-creation flow
 * inside that hook (see `createDealFromIntroduction`), so we avoid
 * duplicating the logic here.
 */
export function useApproveForPipeline(listingId: string) {
  const { updateStatus, isUpdating } = useBuyerIntroductions(listingId);
  const [isPending, setIsPending] = useState(false);

  const approve = useCallback(
    (
      buyer: BuyerIntroduction,
      opts?: { onSuccess?: () => void },
    ) => {
      // Guard: already in pipeline
      if (buyer.introduction_status === 'fit_and_interested') {
        toast.info('This buyer is already in the deal pipeline');
        return;
      }

      setIsPending(true);

      updateStatus(
        {
          id: buyer.id,
          updates: {
            introduction_status: 'fit_and_interested',
            buyer_feedback: buyer.buyer_feedback || undefined,
            next_step: buyer.next_step || undefined,
            expected_next_step_date: buyer.expected_next_step_date || undefined,
          },
        },
        {
          onSuccess: () => {
            setIsPending(false);
            opts?.onSuccess?.();
          },
          onError: () => {
            setIsPending(false);
          },
        },
      );
    },
    [updateStatus],
  );

  return { approve, isPending: isPending || isUpdating };
}
