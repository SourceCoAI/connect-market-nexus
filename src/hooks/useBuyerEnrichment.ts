/**
 * useBuyerEnrichment
 *
 * Manages batch enrichment of buyers by website, tracking per-buyer status,
 * progress counts, cancellation, and credit/rate-limit awareness.
 *
 * Returns: { progress, enrichBuyers, cancel, reset }
 *
 * Tables: buyers (read/write via edge function)
 */

import { useState, useCallback } from 'react';
import { toast } from 'sonner';

export interface EnrichmentStatus {
  buyerId: string;
  status: 'pending' | 'enriching' | 'success' | 'error' | 'warning';
  error?: string;
  errorCode?: string;
  fieldsExtracted?: number;
}

export interface EnrichmentProgress {
  current: number;
  total: number;
  successful: number;
  failed: number;
  statuses: Map<string, EnrichmentStatus>;
  isRunning: boolean;
  isCancelled: boolean;
  creditsDepleted: boolean;
  rateLimited: boolean;
  resetTime?: string;
}

export interface EnrichmentSummary {
  total: number;
  successful: number;
  failed: number;
  warnings: number;
  results: Array<{
    buyerId: string;
    buyerName?: string;
    status: 'success' | 'error' | 'warning';
    error?: string;
    errorCode?: string;
    fieldsExtracted?: number;
  }>;
  creditsDepleted?: boolean;
  rateLimited?: boolean;
  resetTime?: string;
}

export function useBuyerEnrichment(universeId?: string) {
  const [progress, setProgress] = useState<EnrichmentProgress>({
    current: 0,
    total: 0,
    successful: 0,
    failed: 0,
    statuses: new Map(),
    isRunning: false,
    isCancelled: false,
    creditsDepleted: false,
    rateLimited: false,
  });

  const enrichBuyers = useCallback(
    async (
      buyers: Array<{
        id: string;
        platform_website?: string | null;
        pe_firm_website?: string | null;
        company_website?: string | null;
      }>,
    ) => {
      const enrichableBuyers = buyers.filter(
        (b) => b.platform_website || b.pe_firm_website || b.company_website,
      );

      if (enrichableBuyers.length === 0) {
        toast.info('No buyers with websites to enrich');
        return;
      }

      setProgress((prev) => ({
        ...prev,
        current: 0,
        total: enrichableBuyers.length,
        isRunning: true,
        isCancelled: false,
        creditsDepleted: false,
        rateLimited: false,
      }));

      try {
        const { queueBuyerEnrichment } = await import('@/lib/remarketing/queueEnrichment');
        const queued = await queueBuyerEnrichment(
          enrichableBuyers.map((b) => b.id),
          universeId,
        );

        // Note: Don't set isRunning to false here — the queue-based progress hooks
        // (useBuyerEnrichmentProgress / useBuyerEnrichmentQueue) track actual completion.
        // We just report what was queued.
        setProgress((prev) => ({
          ...prev,
          current: queued,
          total: enrichableBuyers.length,
          successful: queued,
          isRunning: false,
        }));

        const summary: EnrichmentSummary = {
          total: enrichableBuyers.length,
          successful: queued,
          failed: 0,
          warnings: 0,
          results: [],
          creditsDepleted: false,
          rateLimited: false,
        };

        return { successful: queued, failed: 0, creditsDepleted: false, summary };
      } catch (error) {
        toast.error('Failed to queue enrichment');
        setProgress((prev) => ({ ...prev, isRunning: false }));
        return { successful: 0, failed: enrichableBuyers.length, creditsDepleted: false };
      }
    },
    [universeId],
  );

  const cancel = useCallback(() => {
    setProgress((prev) => ({ ...prev, isCancelled: true, isRunning: false }));
  }, []);

  const reset = useCallback(() => {
    setProgress({
      current: 0,
      total: 0,
      successful: 0,
      failed: 0,
      statuses: new Map(),
      isRunning: false,
      isCancelled: false,
      creditsDepleted: false,
      rateLimited: false,
    });
  }, []);

  return {
    progress,
    enrichBuyers,
    cancel,
    reset,
  };
}
