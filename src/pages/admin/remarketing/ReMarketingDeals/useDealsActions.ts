import { useState, useCallback, useMemo } from 'react';
import { useShiftSelect } from '@/hooks/useShiftSelect';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useEnrichmentProgress } from '@/hooks/useEnrichmentProgress';
import { useGlobalGateCheck } from '@/hooks/remarketing/useGlobalActivityQueue';
import { useAuth } from '@/context/AuthContext';
import { KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';

import type { DealListing } from '../types';

interface UseDealsActionsParams {
  listings: DealListing[] | undefined;
  localOrder: DealListing[];
  setLocalOrder: React.Dispatch<React.SetStateAction<DealListing[]>>;
  sortedListingsRef: React.MutableRefObject<DealListing[]>;
  refetchListings: () => void;
  adminProfiles:
    | Record<string, { id: string; first_name: string; last_name: string; email: string }>
    | undefined;
}

export function useDealsActions({
  listings,
  localOrder,
  setLocalOrder,
  sortedListingsRef,
  refetchListings,
  adminProfiles,
}: UseDealsActionsParams) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { startOrQueueMajorOp } = useGlobalGateCheck();

  const {
    progress: enrichmentProgress,
    summary: enrichmentSummary,
    showSummary: showEnrichmentSummary,
    dismissSummary,
    pauseEnrichment,
    resumeEnrichment,
    cancelEnrichment,
  } = useEnrichmentProgress();

  const [selectedDeals, setSelectedDeals] = useState<Set<string>>(new Set());
  const [isArchiving, setIsArchiving] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showUniverseDialog, setShowUniverseDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showAddDealDialog, setShowAddDealDialog] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isEnrichingAll, setIsEnrichingAll] = useState(false);
  const [showCalculateDialog, setShowCalculateDialog] = useState(false);
  const [showEnrichDialog, setShowEnrichDialog] = useState(false);
  const [singleDeleteTarget, setSingleDeleteTarget] = useState<{ id: string; name: string } | null>(
    null,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Auto-enrichment after import has been disabled.
  // Enrichment is now only triggered via explicit user action.
  const handleImportCompleteWithIds = useCallback((_importedIds: string[]) => {
    // no-op: enrichment must be triggered manually
  }, []);

  const handleRetryFailedEnrichment = useCallback(async () => {
    dismissSummary();
    if (!enrichmentSummary?.errors.length) return;
    const failedIds = enrichmentSummary.errors.map((e: { listingId: string }) => e.listingId);
    const nowIso = new Date().toISOString();
    await supabase
      .from('enrichment_queue')
      .update({ status: 'pending', attempts: 0, last_error: null, queued_at: nowIso })
      .in('listing_id', failedIds);
    toast({
      title: 'Retrying failed deals',
      description: `${failedIds.length} deal${failedIds.length !== 1 ? 's' : ''} queued for retry`,
    });
    void supabase.functions
      .invoke('process-enrichment-queue', { body: { source: 'retry_failed' } })
      .catch(() => {
        /* non-blocking */
      });
  }, [dismissSummary, enrichmentSummary, toast]);

  const persistRankChanges = useCallback(
    async (reordered: DealListing[], description: string) => {
      const updated = reordered.map((listing, idx) => ({
        ...listing,
        manual_rank_override: idx + 1,
      }));
      const changed = updated.filter((deal, idx) => {
        const orig = localOrder.find((d) => d.id === deal.id);
        return !orig || orig.manual_rank_override !== idx + 1;
      });
      setLocalOrder(updated);
      sortedListingsRef.current = updated;
      try {
        if (changed.length > 0)
          await Promise.all(
            changed.map((d) =>
              supabase
                .from('listings')
                .update({ manual_rank_override: d.manual_rank_override })
                .eq('id', d.id)
                .throwOnError(),
            ),
          );
        await queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
        toast({ title: 'Position updated', description });
      } catch (error) {
        // Failed to update rank — toast shown to user
        await queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
        toast({ title: 'Failed to update rank', variant: 'destructive' });
      }
    },
    [localOrder, queryClient, toast, setLocalOrder, sortedListingsRef],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const current = [...localOrder];
      const oldIdx = current.findIndex((l) => l.id === active.id);
      const newIdx = current.findIndex((l) => l.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return;
      const reordered = arrayMove(current, oldIdx, newIdx);
      await persistRankChanges(reordered, `Deal moved to position ${newIdx + 1}`);
    },
    [localOrder, persistRankChanges],
  );

  const handleUpdateRank = useCallback(
    async (dealId: string, newRank: number) => {
      const rankSorted = [...localOrder].sort(
        (a, b) => (a.manual_rank_override ?? 9999) - (b.manual_rank_override ?? 9999),
      );
      const movedIndex = rankSorted.findIndex((l) => l.id === dealId);
      if (movedIndex === -1) return;
      const targetPos = Math.max(1, Math.min(newRank, rankSorted.length));
      const [movedDeal] = rankSorted.splice(movedIndex, 1);
      rankSorted.splice(targetPos - 1, 0, movedDeal);
      const newRanks = new Map(rankSorted.map((l, idx) => [l.id, idx + 1]));
      const updatedLocal = localOrder.map((l) => ({
        ...l,
        manual_rank_override: newRanks.get(l.id) ?? l.manual_rank_override,
      }));
      const changedDeals = updatedLocal.filter((deal) => {
        const original = localOrder.find((d) => d.id === deal.id);
        return !original || original.manual_rank_override !== deal.manual_rank_override;
      });
      setLocalOrder(updatedLocal);
      sortedListingsRef.current = updatedLocal;
      try {
        if (changedDeals.length > 0) {
          await Promise.all(
            changedDeals.map((deal) =>
              supabase
                .from('listings')
                .update({ manual_rank_override: deal.manual_rank_override })
                .eq('id', deal.id)
                .throwOnError(),
            ),
          );
        }
        await queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
        toast({ title: 'Position updated', description: `Deal moved to position ${targetPos}` });
      } catch (err: unknown) {
        // Failed to update rank — toast shown to user
        await queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
        toast({ title: 'Failed to update rank', variant: 'destructive' });
      }
    },
    [localOrder, setLocalOrder, sortedListingsRef, queryClient, toast],
  );

  const orderedIds = useMemo(() => localOrder.map((d) => d.id), [localOrder]);
  const { handleToggle: handleToggleSelect } = useShiftSelect(
    orderedIds,
    selectedDeals,
    setSelectedDeals,
  );

  const handleSelectAll = useCallback(() => {
    if (selectedDeals.size === localOrder.length) setSelectedDeals(new Set());
    else setSelectedDeals(new Set(localOrder.map((d) => d.id)));
  }, [selectedDeals.size, localOrder]);

  const handleClearSelection = useCallback(() => {
    setSelectedDeals(new Set());
  }, []);

  const handleArchiveDeal = useCallback(
    async (dealId: string, dealName: string) => {
      const { error } = await supabase
        .from('listings')
        .update({ remarketing_status: 'archived' })
        .eq('id', dealId);
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Deal archived', description: `${dealName} has been archived` });
      refetchListings();
    },
    [toast, refetchListings],
  );

  const handleDeleteDeal = useCallback((dealId: string, dealName: string) => {
    setSingleDeleteTarget({ id: dealId, name: dealName });
  }, []);

  const handleConfirmSingleDelete = useCallback(async () => {
    if (!singleDeleteTarget) return;
    try {
      const { error } = await supabase.rpc('delete_listing_cascade', {
        p_listing_id: singleDeleteTarget.id,
      });
      if (error) throw error;
      toast({
        title: 'Deal deleted',
        description: `${singleDeleteTarget.name} has been permanently deleted`,
      });
      refetchListings();
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSingleDeleteTarget(null);
    }
  }, [singleDeleteTarget, toast, refetchListings]);

  const handleTogglePriority = useCallback(
    async (dealId: string, currentStatus: boolean) => {
      const ns = !currentStatus;
      setLocalOrder((prev) =>
        prev.map((d) => (d.id === dealId ? { ...d, is_priority_target: ns } : d)),
      );
      const { error } = await supabase
        .from('listings')
        .update({ is_priority_target: ns })
        .eq('id', dealId);
      if (error) {
        setLocalOrder((prev) =>
          prev.map((d) => (d.id === dealId ? { ...d, is_priority_target: currentStatus } : d)),
        );
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        return;
      }
      toast({
        title: ns ? 'Priority target set' : 'Priority removed',
        description: ns ? 'Deal marked as priority target' : 'Deal is no longer a priority target',
      });
    },
    [toast, setLocalOrder],
  );

  const handleToggleUniverseBuild = useCallback(
    async (dealId: string, currentStatus: boolean) => {
      const ns = !currentStatus;
      const now = new Date().toISOString();
      setLocalOrder((prev) =>
        prev.map((d) =>
          d.id === dealId
            ? { ...d, universe_build_flagged: ns, universe_build_flagged_at: ns ? now : null }
            : d,
        ),
      );
      const { error } = await supabase
        .from('listings')
        .update({
          universe_build_flagged: ns,
          universe_build_flagged_at: ns ? now : null,
          universe_build_flagged_by: ns ? user?.id : null,
        })
        .eq('id', dealId);
      if (error) {
        setLocalOrder((prev) =>
          prev.map((d) => (d.id === dealId ? { ...d, universe_build_flagged: currentStatus } : d)),
        );
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        return;
      }
      toast({
        title: ns ? 'Flagged: Build Buyer Universe' : 'Flag removed',
        description: ns
          ? 'Deal flagged \u2014 a buyer universe needs to be built'
          : 'Universe build flag removed',
      });
    },
    [toast, user?.id, setLocalOrder],
  );

  const handleToggleBuyerSearch = useCallback(
    async (dealId: string, currentStatus: boolean) => {
      const ns = !currentStatus;
      const now = new Date().toISOString();
      setLocalOrder((prev) =>
        prev.map((d) =>
          d.id === dealId
            ? { ...d, needs_buyer_search: ns, needs_buyer_search_at: ns ? now : null }
            : d,
        ),
      );
      const { error } = await supabase
        .from('listings')
        .update({
          needs_buyer_search: ns,
          needs_buyer_search_at: ns ? now : null,
          needs_buyer_search_by: ns ? user?.id : null,
        })
        .eq('id', dealId);
      if (error) {
        setLocalOrder((prev) =>
          prev.map((d) => (d.id === dealId ? { ...d, needs_buyer_search: currentStatus } : d)),
        );
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        return;
      }
      toast({
        title: ns ? 'Flagged: Find Buyer' : 'Flag removed',
        description: ns
          ? 'Deal flagged — need to find a buyer for this deal'
          : 'Find buyer flag removed',
      });
    },
    [toast, user?.id, setLocalOrder],
  );

  const handleAssignOwner = useCallback(
    async (dealId: string, ownerId: string | null) => {
      const ownerProfile = ownerId && adminProfiles ? adminProfiles[ownerId] : null;
      setLocalOrder((prev) =>
        prev.map((d) =>
          d.id === dealId
            ? {
                ...d,
                deal_owner_id: ownerId,
                deal_owner: ownerProfile
                  ? {
                      id: ownerProfile.id,
                      first_name: ownerProfile.first_name,
                      last_name: ownerProfile.last_name,
                      email: ownerProfile.email,
                    }
                  : null,
              }
            : d,
        ),
      );
      const { error } = await supabase
        .from('listings')
        .update({ deal_owner_id: ownerId })
        .eq('id', dealId);
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        await queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
        return;
      }
      toast({
        title: 'Deal owner updated',
        description: ownerId ? 'Owner has been assigned' : 'Owner has been removed',
      });
    },
    [adminProfiles, toast, queryClient, setLocalOrder],
  );

  const handleBulkAssignOwner = useCallback(
    async (dealIds: string[], ownerId: string | null) => {
      const ownerProfile = ownerId && adminProfiles ? adminProfiles[ownerId] : null;
      // Optimistic update
      setLocalOrder((prev) =>
        prev.map((d) =>
          dealIds.includes(d.id)
            ? {
                ...d,
                deal_owner_id: ownerId,
                deal_owner: ownerProfile
                  ? {
                      id: ownerProfile.id,
                      first_name: ownerProfile.first_name,
                      last_name: ownerProfile.last_name,
                      email: ownerProfile.email,
                    }
                  : null,
              }
            : d,
        ),
      );
      const { error } = await supabase
        .from('listings')
        .update({ deal_owner_id: ownerId })
        .in('id', dealIds);
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        await queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
        return;
      }
      const ownerName = ownerProfile
        ? `${ownerProfile.first_name || ''} ${ownerProfile.last_name || ''}`.trim()
        : 'Unassigned';
      toast({
        title: 'Owner updated',
        description: `${dealIds.length} deal(s) assigned to ${ownerName}`,
      });
      handleClearSelection();
    },
    [adminProfiles, toast, queryClient, setLocalOrder, handleClearSelection],
  );

  const handleBulkArchive = useCallback(async () => {
    setIsArchiving(true);
    try {
      const ids = Array.from(selectedDeals);
      const { error } = await supabase
        .from('listings')
        .update({ remarketing_status: 'archived' })
        .in('id', ids);
      if (error) throw error;
      toast({ title: 'Deals archived', description: `${ids.length} deal(s) have been archived` });
      setSelectedDeals(new Set());
      setShowArchiveDialog(false);
      refetchListings();
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsArchiving(false);
    }
  }, [selectedDeals, toast, refetchListings]);

  const handleBulkDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      const ids = Array.from(selectedDeals);
      for (const dealId of ids) {
        await supabase.from('alert_delivery_logs').delete().eq('listing_id', dealId);
        await supabase.from('buyer_approve_decisions').delete().eq('listing_id', dealId);
        await supabase.from('buyer_learning_history').delete().eq('listing_id', dealId);
        await supabase.from('buyer_pass_decisions').delete().eq('listing_id', dealId);
        await supabase.from('chat_conversations').delete().eq('listing_id', dealId);
        await supabase.from('collection_items').delete().eq('listing_id', dealId);
        await supabase.from('connection_requests').delete().eq('listing_id', dealId);
        await supabase.from('deal_ranking_history').delete().eq('listing_id', dealId);
        await supabase.from('deal_referrals').delete().eq('listing_id', dealId);
        await supabase.from('deal_pipeline').delete().eq('listing_id', dealId);
        await supabase.from('deal_scoring_adjustments').delete().eq('listing_id', dealId);
        await supabase.from('deal_transcripts').delete().eq('listing_id', dealId);
        await supabase.from('enrichment_queue').delete().eq('listing_id', dealId);
        await supabase.from('listing_analytics').delete().eq('listing_id', dealId);
        await supabase.from('listing_conversations').delete().eq('listing_id', dealId);
        await supabase.from('outreach_records').delete().eq('listing_id', dealId);
        await supabase.from('owner_intro_notifications').delete().eq('listing_id', dealId);
        await supabase.from('remarketing_outreach').delete().eq('listing_id', dealId);
        await supabase.from('remarketing_scores').delete().eq('listing_id', dealId);
        await supabase.from('remarketing_universe_deals').delete().eq('listing_id', dealId);
        await supabase.from('saved_listings').delete().eq('listing_id', dealId);
        await supabase.from('similar_deal_alerts').delete().eq('source_listing_id', dealId);
        const { error } = await supabase.from('listings').delete().eq('id', dealId);
        if (error) throw error;
      }
      toast({
        title: 'Deals permanently deleted',
        description: `${ids.length} deal(s) have been permanently deleted`,
      });
      setSelectedDeals(new Set());
      setShowDeleteDialog(false);
      refetchListings();
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  }, [selectedDeals, toast, refetchListings]);

  const handleCalculateScores = async (mode: 'all' | 'unscored') => {
    setShowCalculateDialog(false);
    setIsCalculating(true);
    try {
      const { queueDealQualityScoring } = await import('@/lib/remarketing/queueScoring');
      await queueDealQualityScoring(
        mode === 'all'
          ? { mode: 'all', forceRecalculate: true, triggerEnrichment: true }
          : { mode: 'unscored' },
      );
      refetchListings();
    } catch {
      // Toast shown by queue utility
    } finally {
      setIsCalculating(false);
    }
  };

  const handleEnrichDeals = async (mode: 'all' | 'unenriched') => {
    setShowEnrichDialog(false);
    if (!listings || listings.length === 0) {
      toast({
        title: 'No deals',
        description: 'No deals available to enrich',
        variant: 'destructive',
      });
      return;
    }
    setIsEnrichingAll(true);
    try {
      const toEnrich = mode === 'all' ? listings : listings.filter((l) => !l.enriched_at);
      if (toEnrich.length === 0) {
        toast({ title: 'All deals enriched', description: 'All deals have already been enriched' });
        setIsEnrichingAll(false);
        return;
      }
      const dealIds = toEnrich.map((l) => l.id);
      const { queued } = await startOrQueueMajorOp({
        operationType: 'deal_enrichment',
        totalItems: dealIds.length,
        description: `Enrich ${dealIds.length} deals (${mode})`,
        userId: user?.id || 'unknown',
      });
      if (queued) {
        setIsEnrichingAll(false);
        return;
      }
      const { error: _resetError } = await supabase
        .from('listings')
        .update({ enriched_at: null })
        .in('id', dealIds);
      // Reset error is non-critical — continue with enrichment
      const nowIso = new Date().toISOString();
      const { error: resetQueueError } = await supabase
        .from('enrichment_queue')
        .update({
          status: 'pending',
          attempts: 0,
          started_at: null,
          completed_at: null,
          last_error: null,
          queued_at: nowIso,
          updated_at: nowIso,
        })
        .in('listing_id', dealIds);
      if (resetQueueError) throw resetQueueError;
      const { error: insertMissing } = await supabase.from('enrichment_queue').upsert(
        dealIds.map((id) => ({
          listing_id: id,
          status: 'pending',
          attempts: 0,
          queued_at: nowIso,
        })),
        { onConflict: 'listing_id', ignoreDuplicates: true },
      );
      if (insertMissing) throw insertMissing;
      toast({
        title: 'Enrichment queued',
        description: `${dealIds.length} deal${dealIds.length > 1 ? 's' : ''} queued for enrichment. Starting processing now...`,
      });
      void supabase.functions
        .invoke('process-enrichment-queue', { body: { source: 'ui_enrich_deals' } })
        .catch(() => {
          /* non-blocking */
        });
      refetchListings();
    } catch (error: unknown) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsEnrichingAll(false);
    }
  };

  return {
    navigate,
    toast,
    queryClient,
    user,
    enrichmentProgress,
    enrichmentSummary,
    showEnrichmentSummary,
    dismissSummary,
    pauseEnrichment,
    resumeEnrichment,
    cancelEnrichment,
    isEnrichingAll,
    isCalculating,
    selectedDeals,
    setSelectedDeals,
    handleToggleSelect,
    handleSelectAll,
    handleClearSelection,
    sensors,
    handleDragEnd,
    handleUpdateRank,
    handleArchiveDeal,
    handleDeleteDeal,
    handleTogglePriority,
    handleToggleUniverseBuild,
    handleToggleBuyerSearch,
    handleAssignOwner,
    handleBulkAssignOwner,
    handleBulkArchive,
    handleBulkDelete,
    handleCalculateScores,
    handleEnrichDeals,
    handleImportCompleteWithIds,
    handleRetryFailedEnrichment,
    handleConfirmSingleDelete,
    showImportDialog,
    setShowImportDialog,
    showAddDealDialog,
    setShowAddDealDialog,
    showArchiveDialog,
    setShowArchiveDialog,
    showDeleteDialog,
    setShowDeleteDialog,
    showUniverseDialog,
    setShowUniverseDialog,
    showCalculateDialog,
    setShowCalculateDialog,
    showEnrichDialog,
    setShowEnrichDialog,
    isArchiving,
    isDeleting,
    singleDeleteTarget,
    setSingleDeleteTarget,
    persistRankChanges,
  };
}
