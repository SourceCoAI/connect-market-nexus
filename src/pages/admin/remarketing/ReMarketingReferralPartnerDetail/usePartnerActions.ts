import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  useGlobalGateCheck,
  useGlobalActivityMutations,
} from '@/hooks/remarketing/useGlobalActivityQueue';
import { useAuth } from '@/context/AuthContext';
import type { SingleDealEnrichmentResult } from './types';

interface PartnerRecord {
  share_token?: string | null;
  is_active?: boolean | null;
  company?: string | null;
  name?: string | null;
  deal_count?: number | null;
}

interface DealRecord {
  id: string;
  enriched_at?: string | null;
  deal_total_score?: number | null;
  [key: string]: unknown;
}

export function usePartnerActions(
  partnerId: string | undefined,
  partner: PartnerRecord | null | undefined,
  deals: DealRecord[] | undefined,
) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { startOrQueueMajorOp } = useGlobalGateCheck();
  const { completeOperation, updateProgress } = useGlobalActivityMutations();

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addDealOpen, setAddDealOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [selectedDealIds, setSelectedDealIds] = useState<Set<string>>(new Set());
  const [enrichmentResult, _setEnrichmentResult] = useState<SingleDealEnrichmentResult | null>(
    null,
  );
  const [enrichmentDialogOpen, setEnrichmentDialogOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'archive' | 'delete';
    ids: string[];
  } | null>(null);
  const [lastGeneratedPassword, setLastGeneratedPassword] = useState<string | null>(null);
  const [isMarkingNotFit, setIsMarkingNotFit] = useState(false);

  // Selection helpers
  const allSelected = deals?.length ? selectedDealIds.size === deals.length : false;
  const someSelected = selectedDealIds.size > 0;

  const toggleSelectAll = () => {
    if (allSelected) setSelectedDealIds(new Set());
    else setSelectedDealIds(new Set(deals?.map((d) => d.id) || []));
  };

  const toggleSelect = (id: string) => {
    setSelectedDealIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopyShareLink = () => {
    if (!partner?.share_token) {
      toast.error('No share token available');
      return;
    }
    const url = `${window.location.origin}/referrals/${partner.share_token}`;
    navigator.clipboard.writeText(url);
    toast.success('Share link copied to clipboard');
  };

  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
      const array = new Uint8Array(12);
      crypto.getRandomValues(array);
      const password = Array.from(array, (b) => chars[b % chars.length]).join('');
      const { data: hashResult, error: hashResultError } = await supabase.functions.invoke(
        'validate-referral-access',
        { body: { action: 'hash-password', password } },
      );
      if (hashResultError) throw hashResultError;
      const hash = hashResult?.hash || password;
      // C-5 FIX: Stop storing plaintext password in database. Only store the hash.
      const { error } = await supabase
        .from('referral_partners')
        .update({ share_password_hash: hash, share_password_plaintext: null } as never)
        .eq('id', partnerId!);
      if (error) throw error;
      return password;
    },
    onSuccess: (password) => {
      setLastGeneratedPassword(password);
      navigator.clipboard.writeText(password);
      queryClient.invalidateQueries({ queryKey: ['referral-partners', partnerId] });
      toast.success(`New password copied to clipboard`, { duration: 10000 });
    },
    onError: (error) => {
      toast.error(`Failed to reset password: ${error.message}`);
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('referral_partners')
        .update({ is_active: !partner?.is_active } as never)
        .eq('id', partnerId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['referral-partners', partnerId] });
      toast.success(partner?.is_active ? 'Partner deactivated' : 'Partner activated');
    },
  });

  // Bulk Enrich
  const handleBulkEnrich = async (mode: 'unenriched' | 'all') => {
    if (!deals?.length) return;
    const targets = mode === 'unenriched' ? deals.filter((d) => !d.enriched_at) : deals;
    if (!targets.length) {
      toast.info('No deals to enrich');
      return;
    }

    let activityItem: { id: string } | null = null;
    try {
      const result = await startOrQueueMajorOp({
        operationType: 'deal_enrichment',
        totalItems: targets.length,
        description: `Enriching ${targets.length} referral deals (${partner?.company || partner?.name || 'partner'})`,
        userId: user?.id || '',
        contextJson: { partnerId, source: 'referral_partner' },
      });
      activityItem = result.item;
    } catch {
      /* Non-blocking */
    }

    const now = new Date().toISOString();
    const rows = targets.map((d) => ({
      listing_id: d.id,
      status: 'pending',
      attempts: 0,
      queued_at: now,
    }));
    const { error } = await supabase
      .from('enrichment_queue')
      .upsert(rows, { onConflict: 'listing_id' });
    if (error) {
      toast.error('Failed to queue enrichment');
      if (activityItem) completeOperation.mutate({ id: activityItem.id, finalStatus: 'failed' });
      return;
    }

    toast.success(`Queued ${targets.length} deals for enrichment`);
    queryClient.invalidateQueries({
      queryKey: ['referral-partners', partnerId, 'enrichment-queue'],
    });

    try {
      const { data: result, error: resultError } = await supabase.functions.invoke(
        'process-enrichment-queue',
        { body: { source: 'referral_partner_bulk' } },
      );
      if (resultError) throw resultError;
      if (result?.synced > 0 || result?.processed > 0) {
        const totalDone = (result?.synced || 0) + (result?.processed || 0);
        if (activityItem) updateProgress.mutate({ id: activityItem.id, completedItems: totalDone });
        if (result?.processed === 0) {
          toast.success(`All ${result.synced} deals were already enriched`);
          if (activityItem)
            completeOperation.mutate({ id: activityItem.id, finalStatus: 'completed' });
        }
        queryClient.invalidateQueries({
          queryKey: ['referral-partners', partnerId, 'enrichment-queue'],
        });
        queryClient.invalidateQueries({ queryKey: ['referral-partners', partnerId, 'deals'] });
      }
    } catch {
      /* Non-blocking */
    }
  };

  // Bulk Score
  const handleBulkScore = async (mode: 'unscored' | 'all') => {
    if (!deals?.length) return;
    const targets = mode === 'unscored' ? deals.filter((d) => d.deal_total_score == null) : deals;
    if (!targets.length) {
      toast.info('No deals to score');
      return;
    }

    let activityItem: { id: string } | null = null;
    try {
      const result = await startOrQueueMajorOp({
        operationType: 'deal_enrichment',
        totalItems: targets.length,
        description: `Scoring ${targets.length} referral deals (${partner?.company || partner?.name || 'partner'})`,
        userId: user?.id || '',
        contextJson: { partnerId, source: 'referral_partner_scoring' },
      });
      activityItem = result.item;
    } catch {
      /* Non-blocking */
    }

    try {
      const { queueDealQualityScoring } = await import('@/lib/remarketing/queueScoring');
      const result = await queueDealQualityScoring({ listingIds: targets.map((d) => d.id) });
      if (activityItem)
        updateProgress.mutate({ id: activityItem.id, completedItems: result.scored });
    } catch {
      /* Toast shown by queue utility */
    }
    queryClient.invalidateQueries({ queryKey: ['referral-partners', partnerId, 'deals'] });
    if (activityItem) completeOperation.mutate({ id: activityItem.id, finalStatus: 'completed' });
  };

  // Single deal enrichment
  const handleEnrichDeal = async (dealId: string) => {
    try {
      const { queueDealEnrichment } = await import('@/lib/remarketing/queueEnrichment');
      await queueDealEnrichment([dealId]);
      queryClient.invalidateQueries({ queryKey: ['referral-partners', partnerId, 'deals'] });
    } catch {
      /* Toast shown by queue utility */
    }
  };

  // Bulk approve
  const handleBulkApprove = async () => {
    const ids = Array.from(selectedDealIds);
    if (!ids.length) return;
    const { data: maxRankRow, error: maxRankRowError } = await supabase
      .from('listings')
      .select('manual_rank_override')
      .eq('status', 'active')
      .not('manual_rank_override', 'is', null)
      .order('manual_rank_override', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxRankRowError) throw maxRankRowError;
    let nextRank = (maxRankRow?.manual_rank_override as number | null) ?? 0;
    const updates = ids.map((id) => {
      nextRank += 1;
      return supabase
        .from('listings')
        .update({
          status: 'active',
          remarketing_status: 'active',
          pushed_to_all_deals: true,
          pushed_to_all_deals_at: new Date().toISOString(),
          manual_rank_override: nextRank,
        } as never)
        .eq('id', id);
    });
    const results = await Promise.all(updates);
    const failed = results.filter((r) => r.error);
    if (failed.length) {
      toast.error('Failed to approve some deals');
      return;
    }
    toast.success(`${ids.length} deals approved to Active Deals`);
    setSelectedDealIds(new Set());
    queryClient.invalidateQueries({ queryKey: ['referral-partners', partnerId, 'deals'] });
    queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
  };

  // Bulk archive
  const handleBulkArchive = async () => {
    const ids = confirmAction?.ids || [];
    if (!ids.length) return;
    const { error } = await supabase
      .from('listings')
      .update({ status: 'archived' } as never)
      .in('id', ids);
    if (error) toast.error('Failed to archive deals');
    else {
      toast.success(`${ids.length} deals archived`);
      setSelectedDealIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['referral-partners', partnerId, 'deals'] });
    }
    setConfirmAction(null);
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    const ids = confirmAction?.ids || [];
    if (!ids.length) return;
    try {
      for (const id of ids) {
        await supabase.from('enrichment_queue').delete().eq('listing_id', id);
        await supabase.from('collection_items').delete().eq('listing_id', id);
        await supabase.from('chat_conversations').delete().eq('listing_id', id);
        await supabase
          .from('referral_submissions')
          .update({ listing_id: null } as never)
          .eq('listing_id', id);
      }
      const { error } = await supabase.from('listings').delete().in('id', ids);
      if (error) throw error;
      const newCount = Math.max(0, (partner?.deal_count || 0) - ids.length);
      await supabase
        .from('referral_partners')
        .update({ deal_count: newCount } as never)
        .eq('id', partnerId!);
      toast.success(`${ids.length} deals permanently deleted`);
      setSelectedDealIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['referral-partners', partnerId] });
      queryClient.invalidateQueries({ queryKey: ['referral-partners', partnerId, 'deals'] });
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
    } catch (err: unknown) {
      toast.error(`Delete failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    setConfirmAction(null);
  };

  // Bulk mark as not a fit
  const handleMarkNotFit = async () => {
    const ids = Array.from(selectedDealIds);
    if (!ids.length) return;
    setIsMarkingNotFit(true);
    try {
      const { error } = await supabase
        .from('listings')
        .update({ remarketing_status: 'not_a_fit' } as never)
        .in('id', ids);
      if (error) {
        toast.error('Failed to mark deals as not a fit');
      } else {
        toast.success(`${ids.length} deal(s) marked as not a fit`);
        setSelectedDealIds(new Set());
        queryClient.invalidateQueries({ queryKey: ['referral-partners', partnerId, 'deals'] });
      }
    } catch (err: unknown) {
      toast.error(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsMarkingNotFit(false);
    }
  };

  const handleDealCreated = async () => {
    queryClient.invalidateQueries({ queryKey: ['referral-partners', partnerId, 'deals'] });
    queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
  };

  const handleImportComplete = () => {
    queryClient.invalidateQueries({ queryKey: ['referral-partners', partnerId, 'deals'] });
    queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
  };

  const handleImportCompleteWithIds = async (importedIds: string[]) => {
    if (!partnerId || importedIds.length === 0) return;
    for (const id of importedIds)
      await supabase
        .from('listings')
        .update({ referral_partner_id: partnerId } as never)
        .eq('id', id);
    const currentCount = partner?.deal_count || 0;
    await supabase
      .from('referral_partners')
      .update({ deal_count: currentCount + importedIds.length } as never)
      .eq('id', partnerId);
    queryClient.invalidateQueries({ queryKey: ['referral-partners', partnerId] });
    queryClient.invalidateQueries({ queryKey: ['referral-partners', partnerId, 'deals'] });
    queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
    toast.success(`${importedIds.length} deals tagged to ${partner?.name}`);
  };

  return {
    editDialogOpen,
    setEditDialogOpen,
    addDealOpen,
    setAddDealOpen,
    importDialogOpen,
    setImportDialogOpen,
    selectedDealIds,
    setSelectedDealIds,
    enrichmentResult,
    enrichmentDialogOpen,
    setEnrichmentDialogOpen,
    confirmAction,
    setConfirmAction,
    lastGeneratedPassword,
    allSelected,
    someSelected,
    toggleSelectAll,
    toggleSelect,
    handleCopyShareLink,
    resetPasswordMutation,
    deactivateMutation,
    handleBulkEnrich,
    handleBulkScore,
    handleEnrichDeal,
    handleBulkApprove,
    handleBulkArchive,
    handleBulkDelete,
    handleMarkNotFit,
    isMarkingNotFit,
    handleDealCreated,
    handleImportComplete,
    handleImportCompleteWithIds,
  };
}
