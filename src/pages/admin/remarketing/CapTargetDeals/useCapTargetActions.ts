import { useState, useCallback, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
import {
  useGlobalGateCheck,
  useGlobalActivityMutations,
} from '@/hooks/remarketing/useGlobalActivityQueue';
import { useAuth } from '@/contexts/AuthContext';

import type { CapTargetDeal, SyncProgress, SyncSummary, CleanupResult } from './types';
import { hasInvalidWebsite } from './helpers';

export function useCapTargetActions(
  deals: CapTargetDeal[] | undefined,
  filteredDeals: CapTargetDeal[],
  selectedIds: Set<string>,
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>,
  refetch: () => void,
) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { startOrQueueMajorOp } = useGlobalGateCheck();
  const { completeOperation, updateProgress } = useGlobalActivityMutations();

  // ─── Dialog state ────────────────────────────────────────────────────
  const [dialerOpen, setDialerOpen] = useState(false);
  const [smartleadOpen, setSmartleadOpen] = useState(false);
  const [heyreachOpen, setHeyreachOpen] = useState(false);
  const [addToListOpen, setAddToListOpen] = useState(false);

  // ─── Loading states ──────────────────────────────────────────────────
  const [isPushing, setIsPushing] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncAbortRef = useRef<AbortController | null>(null);
  const scoringRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scoringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync progress / summary
  const [syncProgress, setSyncProgress] = useState<SyncProgress>({
    inserted: 0,
    updated: 0,
    skipped: 0,
    excluded: 0,
    page: 0,
  });
  const [syncSummaryOpen, setSyncSummaryOpen] = useState(false);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);

  // Cleanup state
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null);
  const [cleanupResultOpen, setCleanupResultOpen] = useState(false);
  const [showExclusionLog, setShowExclusionLog] = useState(false);

  // Archive & Delete state
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<{id: string; name: string} | null>(null);

  // Mark not fit state
  const [isMarkingNotFit, setIsMarkingNotFit] = useState(false);

  // Cleanup scoring refresh interval on unmount
  useEffect(() => {
    return () => {
      if (scoringRefreshRef.current) clearInterval(scoringRefreshRef.current);
      if (scoringTimeoutRef.current) clearTimeout(scoringTimeoutRef.current);
    };
  }, []);

  // ─── Push to All Deals (approve) ────────────────────────────────────
  const handlePushToAllDeals = useCallback(
    async (dealIds: string[]) => {
      if (dealIds.length === 0) return;
      setIsPushing(true);

      // Validate: only push deals that have a real company website
      const dealsToCheck = deals?.filter((d) => dealIds.includes(d.id)) ?? [];
      const invalidDeals = dealsToCheck.filter(hasInvalidWebsite);
      const validIds = dealIds.filter((id) => !invalidDeals.some((d) => d.id === id));

      if (invalidDeals.length > 0) {
        const names = invalidDeals
          .slice(0, 5)
          .map((d) => d.internal_company_name || d.title || 'Unknown')
          .join(', ');
        const extra = invalidDeals.length > 5 ? ` and ${invalidDeals.length - 5} more` : '';
        toast({
          title: 'Missing Company Website',
          description: `Cannot push deals without a valid company website: ${names}${extra}. Add a real domain first.`,
          variant: 'destructive',
        });
      }

      if (validIds.length > 0) {
        const { error } = await supabase
          .from('listings')
          .update({
            status: 'active',
            pushed_to_all_deals: true,
            pushed_to_all_deals_at: new Date().toISOString(),
          } as never)
          .in('id', validIds);

        if (error) {
          toast({ title: 'Error', description: 'Failed to approve deals' });
        } else {
          toast({
            title: 'Approved',
            description: `${validIds.length} deal${validIds.length !== 1 ? 's' : ''} pushed to Active Deals.`,
          });
        }
      }

      setIsPushing(false);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'captarget-deals'] });
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
    },
    [toast, queryClient, deals, setSelectedIds],
  );

  // ─── Bulk Enrich ────────────────────────────────────────────────────
  const handleBulkEnrich = useCallback(
    async (mode: 'unenriched' | 'all') => {
      if (!deals?.length) return;
      const targets = mode === 'unenriched' ? deals.filter((d) => !d.enriched_at) : deals;
      if (!targets.length) {
        sonnerToast.info('No deals to enrich');
        return;
      }
      setIsEnriching(true);

      let activityItem: { id: string } | null = null;
      try {
        const result = await startOrQueueMajorOp({
          operationType: 'deal_enrichment',
          totalItems: targets.length,
          description: `Enriching ${targets.length} CapTarget deals`,
          userId: user?.id || '',
          contextJson: { source: 'captarget' },
        });
        activityItem = result.item;
      } catch {
        /* Non-blocking */
      }

      // When mode='all', force re-enrichment so notes analysis runs on already-enriched deals
      const forceReEnrich = mode === 'all';

      const now = new Date().toISOString();
      const seen = new Set<string>();
      const rows = targets
        .filter((d) => {
          if (seen.has(d.id)) return false;
          seen.add(d.id);
          return true;
        })
        .map((d) => ({
          listing_id: d.id,
          status: 'pending' as const,
          attempts: 0,
          queued_at: now,
          ...(forceReEnrich ? { force: true } : {}),
        }));

      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error } = await supabase
          .from('enrichment_queue')
          .upsert(chunk, { onConflict: 'listing_id' });
        if (error) {
          sonnerToast.error(`Failed to queue enrichment (batch ${Math.floor(i / CHUNK) + 1})`);
          if (activityItem)
            completeOperation.mutate({ id: activityItem.id, finalStatus: 'failed' });
          setIsEnriching(false);
          return;
        }
      }
      sonnerToast.success(`Queued ${targets.length} deals for enrichment`);

      try {
        const { data: result, error: resultError } = await supabase.functions.invoke(
          'process-enrichment-queue',
          { body: { source: 'captarget_bulk' } },
        );
        if (resultError) throw resultError;
        if (result?.synced > 0 || result?.processed > 0) {
          const totalDone = (result?.synced || 0) + (result?.processed || 0);
          if (activityItem)
            updateProgress.mutate({ id: activityItem.id, completedItems: totalDone });
          if (result?.processed === 0) {
            sonnerToast.success(`All ${result.synced} deals were already enriched`);
            if (activityItem)
              completeOperation.mutate({ id: activityItem.id, finalStatus: 'completed' });
          }
        }
      } catch {
        /* Non-blocking */
      }

      setIsEnriching(false);
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'captarget-deals'] });
    },
    [deals, user, startOrQueueMajorOp, completeOperation, updateProgress, queryClient],
  );

  // ─── Bulk Score ─────────────────────────────────────────────────────
  const handleBulkScore = useCallback(
    async (mode: 'unscored' | 'all') => {
      if (!deals?.length) return;
      const totalCount =
        mode === 'unscored' ? deals.filter((d) => d.deal_total_score == null).length : deals.length;
      if (!totalCount) {
        sonnerToast.info('No deals to score');
        return;
      }
      setIsScoring(true);

      let activityItem: { id: string } | null = null;
      try {
        const result = await startOrQueueMajorOp({
          operationType: 'deal_enrichment',
          totalItems: totalCount,
          description: `Scoring ${totalCount} CapTarget deals`,
          userId: user?.id || '',
          contextJson: { source: 'captarget_scoring' },
        });
        activityItem = result.item;
      } catch {
        /* Non-blocking */
      }

      try {
        const { queueDealQualityScoring } = await import('@/lib/remarketing/queueScoring');
        await queueDealQualityScoring({
          batchSource: 'captarget',
          unscoredOnly: mode === 'unscored',
          globalQueueId: activityItem?.id,
        });
      } catch {
        // Toast shown by queue utility
        if (activityItem) completeOperation.mutate({ id: activityItem.id, finalStatus: 'failed' });
      }

      // Clear any previous scoring refresh interval
      if (scoringRefreshRef.current) clearInterval(scoringRefreshRef.current);
      if (scoringTimeoutRef.current) clearTimeout(scoringTimeoutRef.current);

      scoringRefreshRef.current = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ['remarketing', 'captarget-deals'] });
      }, 10000);
      scoringTimeoutRef.current = setTimeout(
        () => {
          if (scoringRefreshRef.current) {
            clearInterval(scoringRefreshRef.current);
            scoringRefreshRef.current = null;
          }
        },
        20 * 60 * 1000,
      );
      setIsScoring(false);
    },
    [deals, user, startOrQueueMajorOp, completeOperation, queryClient],
  );

  // ─── Enrich selected deals ──────────────────────────────────────────
  const handleEnrichSelected = useCallback(
    async (dealIds: string[], mode: 'all' | 'unenriched' = 'all') => {
      if (dealIds.length === 0) return;
      let targetIds = dealIds;
      if (mode === 'unenriched' && filteredDeals) {
        const enrichedSet = new Set(filteredDeals.filter((d) => d.enriched_at).map((d) => d.id));
        targetIds = dealIds.filter((id) => !enrichedSet.has(id));
        if (targetIds.length === 0) {
          sonnerToast.info('All selected deals are already enriched');
          return;
        }
      }
      setIsEnriching(true);

      // Force re-enrichment when mode='all' so notes analysis runs on already-enriched deals
      const forceReEnrich = mode === 'all';

      let activityItem: { id: string } | null = null;
      try {
        const result = await startOrQueueMajorOp({
          operationType: 'deal_enrichment',
          totalItems: targetIds.length,
          description: `Enriching ${targetIds.length} CapTarget deals`,
          userId: user?.id || '',
          contextJson: { source: 'captarget_selected' },
        });
        activityItem = result.item;
      } catch {
        /* Non-blocking */
      }

      const now = new Date().toISOString();
      try {
        await supabase.functions.invoke('process-enrichment-queue', {
          body: { action: 'cancel_pending', before: now },
        });
      } catch {
        /* Non-blocking */
      }

      const seen = new Set<string>();
      const rows = targetIds
        .filter((id) => {
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        })
        .map((id) => ({
          listing_id: id,
          status: 'pending' as const,
          attempts: 0,
          queued_at: now,
          ...(forceReEnrich ? { force: true } : {}),
        }));

      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error } = await supabase
          .from('enrichment_queue')
          .upsert(chunk, { onConflict: 'listing_id' });
        if (error) {
          sonnerToast.error('Failed to queue enrichment');
          if (activityItem)
            completeOperation.mutate({ id: activityItem.id, finalStatus: 'failed' });
          setIsEnriching(false);
          return;
        }
      }
      sonnerToast.success(`Queued ${rows.length} deals for enrichment`);
      setSelectedIds(new Set());

      try {
        const { data: result, error: resultError } = await supabase.functions.invoke(
          'process-enrichment-queue',
          { body: { source: 'captarget_selected' } },
        );
        if (resultError) throw resultError;
        if (result?.synced > 0 || result?.processed > 0) {
          const totalDone = (result?.synced || 0) + (result?.processed || 0);
          if (activityItem)
            updateProgress.mutate({ id: activityItem.id, completedItems: totalDone });
        }
      } catch {
        /* Non-blocking */
      }

      setIsEnriching(false);
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'captarget-deals'] });
    },
    [
      user,
      startOrQueueMajorOp,
      completeOperation,
      updateProgress,
      queryClient,
      filteredDeals,
      setSelectedIds,
    ],
  );

  // ─── LinkedIn + Google only enrichment ──────────────────────────────
  const handleExternalOnlyEnrich = useCallback(async () => {
    setIsEnriching(true);
    let activityItem: { id: string } | null = null;
    try {
      const missingCount =
        deals?.filter((d) => d.enriched_at && !d.linkedin_employee_count && !d.google_review_count)
          .length || 0;
      const result = await startOrQueueMajorOp({
        operationType: 'deal_enrichment',
        totalItems: missingCount || 1,
        description: `LinkedIn + Google enrichment for CapTarget deals`,
        userId: user?.id || '',
        contextJson: { source: 'captarget_external_only' },
      });
      activityItem = result.item;
    } catch {
      /* Non-blocking */
    }

    try {
      const { queueExternalOnlyEnrichment } = await import('@/lib/remarketing/queueScoring');
      await queueExternalOnlyEnrichment({ dealSource: 'captarget', mode: 'missing' });
    } catch {
      if (activityItem) completeOperation.mutate({ id: activityItem.id, finalStatus: 'failed' });
    }

    setIsEnriching(false);
    queryClient.invalidateQueries({ queryKey: ['remarketing', 'captarget-deals'] });
  }, [deals, user, startOrQueueMajorOp, completeOperation, queryClient]);

  // ─── Archive selected deals ─────────────────────────────────────────
  const handleBulkArchive = useCallback(async () => {
    setIsArchiving(true);
    try {
      const dealIds = Array.from(selectedIds);
      const { error } = await supabase
        .from('listings')
        .update({ captarget_status: 'inactive' })
        .in('id', dealIds);
      if (error) throw error;
      toast({
        title: 'Deals Archived',
        description: `${dealIds.length} deal(s) have been moved to Inactive`,
      });
      setSelectedIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ['remarketing', 'captarget-deals'] });
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Archive Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsArchiving(false);
    }
  }, [selectedIds, toast, queryClient, setSelectedIds]);

  // ─── Permanently delete selected deals ──────────────────────────────
  const handleBulkDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      const dealIds = Array.from(selectedIds);
      for (const dealId of dealIds) {
        await supabase.from('enrichment_queue').delete().eq('listing_id', dealId);
        await supabase.from('remarketing_scores').delete().eq('listing_id', dealId);
      }
      const { error } = await supabase.from('listings').delete().in('id', dealIds);
      if (error) throw error;
      toast({
        title: 'Deals Deleted',
        description: `${dealIds.length} deal(s) have been permanently deleted`,
      });
      setSelectedIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ['remarketing', 'captarget-deals'] });
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Delete Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsDeleting(false);
    }
  }, [selectedIds, toast, queryClient, setSelectedIds]);

  // ─── Mark as Not a Fit ──────────────────────────────────────────────
  const handleMarkNotFit = useCallback(async () => {
    setIsMarkingNotFit(true);
    try {
      const dealIds = Array.from(selectedIds);
      const { error } = await supabase
        .from('listings')
        .update({ remarketing_status: 'not_a_fit' } as never)
        .in('id', dealIds);
      if (error) throw error;
      toast({
        title: 'Marked as Not a Fit',
        description: `${dealIds.length} deal(s) marked as not a fit and hidden`,
      });
      setSelectedIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ['remarketing', 'captarget-deals'] });
    } catch (err: unknown) {
      toast({
        variant: 'destructive',
        title: 'Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsMarkingNotFit(false);
    }
  }, [selectedIds, toast, queryClient, setSelectedIds]);

  // ─── Cleanup handler ────────────────────────────────────────────────
  const handleCleanup = useCallback(async () => {
    setIsCleaningUp(true);
    setShowCleanupDialog(false);
    try {
      const { data, error } = await supabase.functions.invoke('cleanup-captarget-deals', {
        body: { confirm: true },
      });
      if (error) throw error;
      setCleanupResult(data);
      setCleanupResultOpen(true);
      refetch();
      queryClient.invalidateQueries({ queryKey: ['captarget-exclusion-log'] });
    } catch (e: unknown) {
      sonnerToast.error('Cleanup failed', {
        description: e instanceof Error ? e.message : 'Unknown error',
      });
    } finally {
      setIsCleaningUp(false);
    }
  }, [refetch, queryClient]);

  // ─── Sync handler ───────────────────────────────────────────────────
  const handleSync = useCallback(async () => {
    const abortCtrl = new AbortController();
    syncAbortRef.current = abortCtrl;
    setIsSyncing(true);
    setSyncProgress({ inserted: 0, updated: 0, skipped: 0, excluded: 0, page: 0 });
    let totalInserted = 0,
      totalUpdated = 0,
      totalSkipped = 0,
      totalExcluded = 0,
      pageNum = 0;
    let page = { startTab: 0, startRow: 0 };
    try {
      let hasMore = true;
      while (hasMore) {
        if (abortCtrl.signal.aborted) {
          setSyncSummary({
            inserted: totalInserted,
            updated: totalUpdated,
            skipped: totalSkipped,
            excluded: totalExcluded,
            status: 'success',
            message: 'Sync cancelled by user',
          });
          setSyncSummaryOpen(true);
          refetch();
          return;
        }
        pageNum++;
        const { data, error } = await supabase.functions.invoke('sync-captarget-sheet', {
          body: page,
        });
        if (error) throw error;
        totalInserted += data?.rows_inserted ?? 0;
        totalUpdated += data?.rows_updated ?? 0;
        totalSkipped += data?.rows_skipped ?? 0;
        totalExcluded += data?.rows_excluded ?? 0;
        setSyncProgress({
          inserted: totalInserted,
          updated: totalUpdated,
          skipped: totalSkipped,
          excluded: totalExcluded,
          page: pageNum,
        });
        hasMore = data?.hasMore === true;
        if (hasMore) page = { startTab: data.nextTab, startRow: data.nextRow };
      }
      setSyncSummary({
        inserted: totalInserted,
        updated: totalUpdated,
        skipped: totalSkipped,
        excluded: totalExcluded,
        status: 'success',
      });
      setSyncSummaryOpen(true);
      refetch();
    } catch (e: unknown) {
      setSyncSummary({
        inserted: totalInserted,
        updated: totalUpdated,
        skipped: totalSkipped,
        excluded: totalExcluded,
        status: 'error',
        message: e instanceof Error ? e.message : 'Unknown error',
      });
      setSyncSummaryOpen(true);
    } finally {
      setIsSyncing(false);
      syncAbortRef.current = null;
    }
  }, [refetch]);

  // ─── Single-row inline handlers (for CapTargetTableRow) ─────────────
  const handleDeleteDeal = useCallback(
    async (id: string) => {
      if (!confirm('Permanently delete this deal?')) return;
      await supabase.from('enrichment_queue').delete().eq('listing_id', id);
      await supabase.from('remarketing_scores').delete().eq('listing_id', id);
      const { error } = await supabase.from('listings').delete().eq('id', id);
      if (error) {
        toast({
          title: 'Delete Failed',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Deal Deleted',
          description: 'Deal permanently deleted',
        });
        refetch();
      }
    },
    [toast, refetch],
  );

  const handleArchiveDeal = useCallback(
    (id: string) => {
      const deal = deals?.find((d) => d.id === id);
      setArchiveTarget({
        id,
        name: deal?.internal_company_name || deal?.title || 'Unknown Deal',
      });
    },
    [deals],
  );

  const confirmArchiveDeal = useCallback(
    async (reason: string) => {
      if (!archiveTarget) return;
      const { error } = await supabase
        .from('listings')
        .update({ remarketing_status: 'archived', archive_reason: reason } as never)
        .eq('id', archiveTarget.id);
      if (error) {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Deal archived',
          description: 'Deal has been archived',
        });
        setArchiveTarget(null);
        refetch();
      }
    },
    [archiveTarget, toast, refetch],
  );

  return {
    // Dialog state
    dialerOpen,
    setDialerOpen,
    smartleadOpen,
    setSmartleadOpen,
    heyreachOpen,
    setHeyreachOpen,
    addToListOpen,
    setAddToListOpen,

    // Loading states
    isPushing,
    isEnriching,
    isScoring,
    isSyncing,

    // Sync
    syncProgress,
    syncSummaryOpen,
    setSyncSummaryOpen,
    syncSummary,
    syncAbortRef,
    handleSync,

    // Cleanup
    isCleaningUp,
    showCleanupDialog,
    setShowCleanupDialog,
    cleanupResult,
    cleanupResultOpen,
    setCleanupResultOpen,
    showExclusionLog,
    setShowExclusionLog,
    handleCleanup,

    // Archive & Delete
    isArchiving,
    isDeleting,
    isMarkingNotFit,
    archiveTarget,
    setArchiveTarget,

    // Action handlers
    handlePushToAllDeals,
    handleBulkEnrich,
    handleBulkScore,
    handleEnrichSelected,
    handleExternalOnlyEnrich,
    handleBulkArchive,
    handleBulkDelete,
    handleMarkNotFit,
    handleDeleteDeal,
    handleArchiveDeal,
    confirmArchiveDeal,
  };
}
