/**
 * Mutation hooks for ValuationLeads — push, enrich, archive,
 * score, assign, and other action handlers.
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast as sonnerToast } from 'sonner';
import {
  useGlobalGateCheck,
  useGlobalActivityMutations,
} from '@/hooks/remarketing/useGlobalActivityQueue';
import { useAuth } from '@/contexts/AuthContext';
import type { ValuationLead } from './types';
import { inferWebsite, buildListingFromLead } from './helpers';

interface MutationDeps {
  leads: ValuationLead[] | undefined;
  filteredLeads: ValuationLead[];
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  enrichmentSummary: { errors: Array<{ listingId: string }> } | null;
  dismissSummary: () => void;
  setHideNotFit?: (v: boolean) => void;
}

export function useValuationLeadsMutations(deps: MutationDeps) {
  const {
    leads,
    filteredLeads,
    selectedIds: _selectedIds,
    setSelectedIds,
    enrichmentSummary,
    dismissSummary,
    setHideNotFit,
  } = deps;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { startOrQueueMajorOp } = useGlobalGateCheck();
  const { completeOperation, updateProgress } = useGlobalActivityMutations();

  // Action states
  const [isPushing, setIsPushing] = useState(false);
  const [isPushEnriching, setIsPushEnriching] = useState(false);
  const [isReEnriching, setIsReEnriching] = useState(false);
  const [isScoring, setIsScoring] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [isMarkingNotFit, setIsMarkingNotFit] = useState(false);
  const [isDeleting, _setIsDeleting] = useState(false);

  // Drawer state
  const [selectedLead, setSelectedLead] = useState<ValuationLead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  /** Open the detail drawer on row click (non-destructive) */
  const handleRowClick = useCallback((lead: ValuationLead) => {
    setSelectedLead(lead);
    setDrawerOpen(true);
  }, []);

  /** Navigate to deal page — creates listing if needed (with error handling) */
  const handleOpenDeal = useCallback(
    async (lead: ValuationLead) => {
      try {
        if (lead.pushed_listing_id) {
          navigate('/admin/deals/' + lead.pushed_listing_id, {
            state: { from: '/admin/remarketing/leads/valuation' },
          });
          return;
        }

        const dealIdentifier = `vlead_${lead.id.slice(0, 8)}`;
        const { data: existing, error: existingError } = await supabase
          .from('listings')
          .select('id')
          .eq('deal_identifier', dealIdentifier)
          .maybeSingle();
        if (existingError) throw existingError;

        let listingId: string;

        if (existing?.id) {
          listingId = existing.id;
          await supabase
            .from('valuation_leads')
            .update({ pushed_listing_id: listingId } as never)
            .eq('id', lead.id);
        } else {
          const { data: listing, error: insertError } = await supabase
            .from('listings')
            .insert(buildListingFromLead(lead, false))
            .select('id')
            .single();

          if (insertError || !listing) {
            console.error('handleOpenDeal insert error:', insertError);
            sonnerToast.error(insertError?.message || 'Failed to create deal listing');
            return;
          }
          listingId = listing.id;
          await supabase
            .from('valuation_leads')
            .update({ pushed_listing_id: listingId } as never)
            .eq('id', lead.id);
        }

        queryClient.invalidateQueries({ queryKey: ['remarketing', 'valuation-leads'] });
        navigate('/admin/deals/' + listingId, {
          state: { from: '/admin/remarketing/leads/valuation' },
        });
      } catch (err: unknown) {
        console.error('handleOpenDeal error:', err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        sonnerToast.error(`Failed to open deal page: ${message}`);
      }
    },
    [navigate, queryClient],
  );

  const handlePushToAllDeals = useCallback(
    async (leadIds: string[]) => {
      if (leadIds.length === 0 || isPushing) return;
      setIsPushing(true);

      const leadsToProcess = (leads || []).filter(
        (l) => leadIds.includes(l.id) && !l.pushed_to_all_deals,
      );
      let successCount = 0;
      let errorCount = 0;

      for (const lead of leadsToProcess) {
        let listingId = lead.pushed_listing_id;
        if (listingId) {
          const { error } = await supabase
            .from('listings')
            .update({
              remarketing_status: 'active',
              pushed_to_all_deals: true,
              pushed_to_all_deals_at: new Date().toISOString(),
            })
            .eq('id', listingId);
          if (error) {
            errorCount++;
            continue;
          }
        } else {
          const { data: listing, error: insertError } = await supabase
            .from('listings')
            .insert(buildListingFromLead(lead, true))
            .select('id')
            .single();
          if (insertError || !listing) {
            errorCount++;
            continue;
          }
          listingId = listing.id;
        }
        const { error: updateError } = await supabase
          .from('valuation_leads')
          .update({
            pushed_to_all_deals: true,
            pushed_to_all_deals_at: new Date().toISOString(),
            pushed_listing_id: listingId,
            status: 'pushed',
          } as never)
          .eq('id', lead.id);
        void updateError;
        successCount++;
      }

      setIsPushing(false);
      setSelectedIds(new Set());
      if (successCount > 0) {
        sonnerToast.success(
          `Added ${successCount} lead${successCount !== 1 ? 's' : ''} to Active Deals${errorCount > 0 ? ` (${errorCount} failed)` : ''}`,
        );
      } else {
        sonnerToast.info('Nothing to add \u2014 selected leads are already in Active Deals.');
      }
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'valuation-leads'] });
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
    },
    [leads, isPushing, queryClient, setSelectedIds],
  );

  const handlePushAndEnrich = useCallback(
    async (leadIds: string[]) => {
      if (leadIds.length === 0) return;
      setIsPushEnriching(true);

      const leadsToProcess = (leads || []).filter(
        (l) => leadIds.includes(l.id) && !l.pushed_to_all_deals,
      );
      if (!leadsToProcess.length) {
        sonnerToast.info('No unpushed leads selected');
        setIsPushEnriching(false);
        return;
      }

      let pushed = 0;
      const listingIds: string[] = [];

      for (const lead of leadsToProcess) {
        let listingId = lead.pushed_listing_id;
        if (listingId) {
          const { error } = await supabase
            .from('listings')
            .update({
              remarketing_status: 'active',
              pushed_to_all_deals: true,
              pushed_to_all_deals_at: new Date().toISOString(),
            })
            .eq('id', listingId);
          if (error) {
            continue;
          }
        } else {
          const { data: listing, error: insertError } = await supabase
            .from('listings')
            .insert(buildListingFromLead(lead, true))
            .select('id')
            .single();
          if (insertError || !listing) {
            continue;
          }
          listingId = listing.id;
        }
        listingIds.push(listingId);
        await supabase
          .from('valuation_leads')
          .update({
            pushed_to_all_deals: true,
            pushed_to_all_deals_at: new Date().toISOString(),
            pushed_listing_id: listingId,
            status: 'pushed',
          } as never)
          .eq('id', lead.id);
        pushed++;
      }

      setIsPushEnriching(false);
      setSelectedIds(new Set());
      if (pushed > 0) {
        sonnerToast.success(`Added ${pushed} lead${pushed !== 1 ? 's' : ''} to Active Deals`);
      } else {
        sonnerToast.info("Select leads that haven't been added to Active Deals yet.");
      }
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'valuation-leads'] });
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
    },
    [leads, queryClient, setSelectedIds],
  );

  const handleReEnrich = useCallback(
    async (leadIds: string[]) => {
      if (leadIds.length === 0) return;
      setIsReEnriching(true);

      const leadsToProcess = (leads || []).filter(
        (l) => leadIds.includes(l.id) && l.pushed_to_all_deals && l.pushed_listing_id,
      );
      if (!leadsToProcess.length) {
        sonnerToast.info('No pushed leads with listing IDs found');
        setIsReEnriching(false);
        return;
      }

      let activityItem: { id: string } | null = null;
      try {
        const result = await startOrQueueMajorOp({
          operationType: 'deal_enrichment',
          totalItems: leadsToProcess.length,
          description: `Re-enriching ${leadsToProcess.length} valuation leads`,
          userId: user?.id || '',
          contextJson: { source: 'valuation_leads_re_enrich' },
        });
        activityItem = result.item;
      } catch {
        /* Non-blocking */
      }

      const now = new Date().toISOString();
      const seen = new Set<string>();
      const rows = leadsToProcess
        .filter((l) => {
          if (!l.pushed_listing_id || seen.has(l.pushed_listing_id)) return false;
          seen.add(l.pushed_listing_id!);
          return true;
        })
        .map((l) => ({
          listing_id: l.pushed_listing_id!,
          status: 'pending' as const,
          attempts: 0,
          queued_at: now,
          force: true,
          completed_at: null,
          last_error: null,
          started_at: null,
        }));

      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error } = await supabase
          .from('enrichment_queue')
          .upsert(chunk, { onConflict: 'listing_id' });
        if (error) {
          // Queue upsert error — toast shown to user
          sonnerToast.error('Failed to queue enrichment');
          if (activityItem)
            completeOperation.mutate({ id: activityItem.id, finalStatus: 'failed' });
          setIsReEnriching(false);
          return;
        }
      }

      if (rows.length > 0) {
        sonnerToast.success(
          `Re-queued ${rows.length} lead${rows.length !== 1 ? 's' : ''} for enrichment`,
        );
      } else {
        sonnerToast.info('No leads in Active Deals found to re-enrich');
      }
      setSelectedIds(new Set());
      setIsReEnriching(false);
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'valuation-leads'] });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leads, startOrQueueMajorOp, completeOperation, updateProgress, queryClient, setSelectedIds],
  );

  const handleEnrichSelected = useCallback(
    async (dealIds: string[], mode?: 'all' | 'unenriched') => {
      if (dealIds.length === 0) return;
      setIsEnriching(true);

      // For valuation leads, we need to resolve pushed_listing_ids
      const selectedLeads = (leads || []).filter((l) => dealIds.includes(l.id));

      // Ensure all leads have listings (create if needed)
      const leadsNeedingListing = selectedLeads.filter((l) => !l.pushed_listing_id);
      if (leadsNeedingListing.length > 0) {
        const LISTING_BATCH = 50;
        for (let i = 0; i < leadsNeedingListing.length; i += LISTING_BATCH) {
          const batch = leadsNeedingListing.slice(i, i + LISTING_BATCH);
          await Promise.all(
            batch.map(async (lead) => {
              try {
                const dealIdentifier = `vlead_${lead.id.slice(0, 8)}`;
                const { data: existing, error: existingError } = await supabase
                  .from('listings')
                  .select('id')
                  .eq('deal_identifier', dealIdentifier)
                  .maybeSingle();
                if (existingError) throw existingError;
                let listingId: string;
                if (existing?.id) {
                  listingId = existing.id;
                } else {
                  const { data: listing, error: insertError } = await supabase
                    .from('listings')
                    .insert(buildListingFromLead(lead, false))
                    .select('id')
                    .single();
                  if (insertError || !listing) return;
                  listingId = listing.id;
                }
                await supabase
                  .from('valuation_leads')
                  .update({ pushed_listing_id: listingId } as never)
                  .eq('id', lead.id);
                lead.pushed_listing_id = listingId;
              } catch {
                /* Non-blocking per-lead */
              }
            }),
          );
        }
      }

      const forceReEnrich = mode === 'all';
      const targets = selectedLeads.filter((l) => !!l.pushed_listing_id);
      if (!targets.length) {
        sonnerToast.info('No leads with websites to enrich');
        setIsEnriching(false);
        return;
      }

      let activityItem: { id: string } | null = null;
      try {
        const result = await startOrQueueMajorOp({
          operationType: 'deal_enrichment',
          totalItems: targets.length,
          description: `Enriching ${targets.length} valuation leads`,
          userId: user?.id || '',
          contextJson: { source: 'valuation_leads_selected' },
        });
        activityItem = result.item;
      } catch {
        /* Non-blocking */
      }

      const now = new Date().toISOString();
      const seen = new Set<string>();
      const rows = targets
        .filter((l) => {
          if (!l.pushed_listing_id || seen.has(l.pushed_listing_id)) return false;
          seen.add(l.pushed_listing_id!);
          return true;
        })
        .map((l) => ({
          listing_id: l.pushed_listing_id!,
          status: 'pending' as const,
          attempts: 0,
          queued_at: now,
          ...(forceReEnrich ? { force: true } : {}),
          completed_at: null,
          last_error: null,
          started_at: null,
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

      sonnerToast.success(
        `Queued ${rows.length} lead${rows.length !== 1 ? 's' : ''} for enrichment`,
      );
      try {
        await supabase.functions.invoke('process-enrichment-queue', {
          body: { source: 'valuation_leads_selected' },
        });
      } catch {
        /* Non-blocking */
      }

      setSelectedIds(new Set());
      setIsEnriching(false);
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'valuation-leads'] });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leads, user?.id, startOrQueueMajorOp, completeOperation, queryClient, setSelectedIds],
  );

  const handleDelete = useCallback(
    async (leadIds: string[]) => {
      if (leadIds.length === 0) return;
      const { error } = await supabase
        .from('valuation_leads')
        .delete()
        .in('id', leadIds);
      if (error) {
        sonnerToast.error('Failed to delete leads');
        return;
      }
      sonnerToast.success(
        `Deleted ${leadIds.length} lead${leadIds.length !== 1 ? 's' : ''}`,
      );
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'valuation-leads'] });
    },
    [queryClient, setSelectedIds],
  );

  const handleArchive = useCallback(
    async (leadIds: string[]) => {
      if (leadIds.length === 0) return;
      const { error } = await supabase
        .from('valuation_leads')
        .update({ is_archived: true } as never)
        .in('id', leadIds);
      if (error) {
        sonnerToast.error('Failed to archive leads');
        return;
      }
      sonnerToast.success(`Archived ${leadIds.length} lead${leadIds.length !== 1 ? 's' : ''}`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'valuation-leads'] });
    },
    [queryClient, setSelectedIds],
  );

  const handleMarkNotFit = useCallback(
    async (leadIds: string[]) => {
      if (leadIds.length === 0) return;
      setIsMarkingNotFit(true);
      try {
        const { error } = await supabase
          .from('valuation_leads')
          .update({ not_a_fit: true } as never)
          .in('id', leadIds);
        if (error) {
          sonnerToast.error('Failed to mark leads as not a fit');
          return;
        }
        sonnerToast.success(
          `Marked ${leadIds.length} lead${leadIds.length !== 1 ? 's' : ''} as not a fit`,
        );
        setSelectedIds(new Set());
        // Show greyed-out rows instead of hiding them
        if (setHideNotFit) setHideNotFit(false);
        queryClient.invalidateQueries({ queryKey: ['remarketing', 'valuation-leads'] });
      } finally {
        setIsMarkingNotFit(false);
      }
    },
    [queryClient, setSelectedIds],
  );

  const handleBulkEnrich = useCallback(
    async (mode: 'unenriched' | 'all') => {
      const allLeads = leads || [];
      const leadsWithWebsite = allLeads.filter((l) => !!inferWebsite(l));
      const enrichableLeads =
        mode === 'unenriched'
          ? leadsWithWebsite.filter((l) => !l.pushed_listing_id)
          : leadsWithWebsite;

      if (!enrichableLeads.length) {
        sonnerToast.info(
          mode === 'unenriched'
            ? 'All leads have already been enriched'
            : 'No leads with websites to enrich',
        );
        return;
      }

      setIsEnriching(true);

      const leadsNeedingListing = enrichableLeads.filter((l) => !l.pushed_listing_id);
      if (leadsNeedingListing.length > 0) {
        sonnerToast.info(`Creating listings for ${leadsNeedingListing.length} leads...`);
        const LISTING_BATCH = 50;
        for (let i = 0; i < leadsNeedingListing.length; i += LISTING_BATCH) {
          const batch = leadsNeedingListing.slice(i, i + LISTING_BATCH);
          await Promise.all(
            batch.map(async (lead) => {
              try {
                const dealIdentifier = `vlead_${lead.id.slice(0, 8)}`;
                const { data: existing, error: existingError } = await supabase
                  .from('listings')
                  .select('id')
                  .eq('deal_identifier', dealIdentifier)
                  .maybeSingle();
                if (existingError) throw existingError;
                let listingId: string;
                if (existing?.id) {
                  listingId = existing.id;
                } else {
                  const { data: listing, error: insertError } = await supabase
                    .from('listings')
                    .insert(buildListingFromLead(lead, false))
                    .select('id')
                    .single();
                  if (insertError || !listing) return;
                  listingId = listing.id;
                }
                await supabase
                  .from('valuation_leads')
                  .update({ pushed_listing_id: listingId } as never)
                  .eq('id', lead.id);
                lead.pushed_listing_id = listingId;
              } catch {
                /* Non-blocking per-lead */
              }
            }),
          );
        }
      }

      const targets = enrichableLeads.filter((l) => !!l.pushed_listing_id);
      let activityItem: { id: string } | null = null;
      try {
        const result = await startOrQueueMajorOp({
          operationType: 'deal_enrichment',
          totalItems: targets.length,
          description: `Enriching ${targets.length} valuation lead listings`,
          userId: user?.id || '',
          contextJson: { source: 'valuation_leads_bulk' },
        });
        activityItem = result.item;
      } catch {
        /* Non-blocking */
      }

      const now = new Date().toISOString();
      const seen = new Set<string>();
      const rows = targets
        .filter((l) => {
          if (!l.pushed_listing_id || seen.has(l.pushed_listing_id)) return false;
          seen.add(l.pushed_listing_id!);
          return true;
        })
        .map((l) => ({
          listing_id: l.pushed_listing_id!,
          status: 'pending' as const,
          attempts: 0,
          queued_at: now,
          force: mode === 'all',
          completed_at: null,
          last_error: null,
          started_at: null,
        }));

      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const listingIds = chunk.map((r) => r.listing_id);
        const { error: _updateError } = await supabase
          .from('enrichment_queue')
          .update({
            status: 'pending',
            force: mode === 'all',
            attempts: 0,
            queued_at: now,
            completed_at: null,
            last_error: null,
            started_at: null,
          })
          .in('listing_id', listingIds);
        // Queue pre-update error is non-fatal
        const { error } = await supabase
          .from('enrichment_queue')
          .upsert(chunk, { onConflict: 'listing_id', ignoreDuplicates: true });
        if (error) {
          // Queue upsert error — toast shown to user
          sonnerToast.error(`Failed to queue enrichment (batch ${Math.floor(i / CHUNK) + 1})`);
          if (activityItem)
            completeOperation.mutate({ id: activityItem.id, finalStatus: 'failed' });
          setIsEnriching(false);
          return;
        }
      }

      sonnerToast.success(
        `Queued ${rows.length} lead${rows.length !== 1 ? 's' : ''} in Active Deals for enrichment`,
      );
      try {
        const { data: result, error: resultError } = await supabase.functions.invoke(
          'process-enrichment-queue',
          { body: { source: 'valuation_leads_bulk' } },
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
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'valuation-leads'] });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leads, user?.id, startOrQueueMajorOp, completeOperation, queryClient],
  );

  const handleRetryFailedEnrichment = useCallback(async () => {
    dismissSummary();
    if (!enrichmentSummary?.errors.length) return;
    const failedIds = enrichmentSummary.errors.map((e) => e.listingId);
    const nowIso = new Date().toISOString();
    await supabase
      .from('enrichment_queue')
      .update({ status: 'pending', attempts: 0, last_error: null, queued_at: nowIso })
      .in('listing_id', failedIds);
    sonnerToast.success(
      `Retrying ${failedIds.length} failed deal${failedIds.length !== 1 ? 's' : ''}`,
    );
    void supabase.functions
      .invoke('process-enrichment-queue', { body: { source: 'valuation_leads_retry' } })
      .catch(() => {
        /* non-blocking */
      });
  }, [dismissSummary, enrichmentSummary]);

  const handleScoreLeads = useCallback(
    async (mode: 'unscored' | 'all') => {
      const targets =
        mode === 'unscored' ? filteredLeads.filter((l) => l.lead_score == null) : filteredLeads;
      if (!targets.length) {
        sonnerToast.info('No leads to score');
        return;
      }
      setIsScoring(true);
      try {
        const { queueValuationLeadScoring } = await import('@/lib/remarketing/queueScoring');
        await queueValuationLeadScoring(mode);
      } catch {
        // Scoring failed — toast shown by queue utility
      }
      setIsScoring(false);
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'valuation-leads'] });
    },
    [filteredLeads, queryClient],
  );

  const handleAssignOwner = useCallback(
    async (lead: ValuationLead, ownerId: string | null) => {
      const { error } = await supabase
        .from('valuation_leads')
        .update({ deal_owner_id: ownerId })
        .eq('id', lead.id);
      if (error) {
        sonnerToast.error('Failed to update owner');
        return;
      }
      if (lead.pushed_listing_id) {
        await supabase
          .from('listings')
          .update({ deal_owner_id: ownerId })
          .eq('id', lead.pushed_listing_id);
      }
      sonnerToast.success(ownerId ? 'Owner assigned' : 'Owner removed');
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'valuation-leads'] });
    },
    [queryClient],
  );

  return {
    // Actions
    handleRowClick,
    handleOpenDeal,
    handlePushToAllDeals,
    handlePushAndEnrich,
    handleReEnrich,
    handleArchive,
    handleMarkNotFit,
    handleBulkEnrich,
    handleRetryFailedEnrichment,
    handleScoreLeads,
    handleAssignOwner,
    handleEnrichSelected,
    handleDelete,
    // Drawer state
    selectedLead,
    setSelectedLead,
    drawerOpen,
    setDrawerOpen,
    // Action states
    isPushing,
    isPushEnriching,
    isReEnriching,
    isScoring,
    isEnriching,
    isMarkingNotFit,
    isDeleting,
  };
}
