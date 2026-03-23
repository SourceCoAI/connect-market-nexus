import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBuyerIntroductions } from '@/hooks/use-buyer-introductions';
import { useNewRecommendedBuyers, type BuyerScore } from '@/hooks/admin/use-new-recommended-buyers';
import type { BuyerIntroduction } from '@/types/buyer-introductions';
import type { UniverseAssignmentData } from './buyer-introduction-constants';

export function useBuyerIntroductionTracker(listingId: string) {
  const {
    introductions,
    notIntroduced,
    introducedAndPassed,
    isLoading,
    batchArchiveIntroductions,
    isBatchArchiving,
    sendBuyerToUniverse,
    isSendingToUniverse,
  } = useBuyerIntroductions(listingId);
  const { data: scoredData } = useNewRecommendedBuyers(listingId);

  // Fetch the deal's assigned buyer universe
  const { data: universeAssignment } = useQuery({
    queryKey: ['remarketing', 'deal-universe', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('remarketing_universe_deals')
        .select('id, universe_id, buyer_universes(id, name)')
        .eq('listing_id', listingId)
        .eq('status', 'active')
        .maybeSingle();

      if (error) throw error;
      return data as UniverseAssignmentData | null;
    },
    enabled: !!listingId,
  });

  // Build a lookup map: buyer_id -> BuyerScore (shares React Query cache with RecommendedBuyersPanel)
  const scoreMap = useMemo(() => {
    const map = new Map<string, BuyerScore>();
    if (scoredData?.buyers) {
      for (const b of scoredData.buyers) map.set(b.buyer_id, b);
    }
    return map;
  }, [scoredData]);

  const [searchQuery, setSearchQuery] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedBuyer, setSelectedBuyer] = useState<BuyerIntroduction | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);

  // Checkbox selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Get names of selected buyers for the confirmation dialog
  const selectedBuyerNames = useMemo(() => {
    return introductions.filter((i) => selectedIds.has(i.id)).map((i) => i.buyer_name);
  }, [introductions, selectedIds]);

  const handleRemoveSelected = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    batchArchiveIntroductions(ids, {
      onSuccess: () => {
        setSelectedIds(new Set());
        setConfirmRemoveOpen(false);
      },
    });
  }, [selectedIds, batchArchiveIntroductions]);

  const filteredNotIntroduced = useMemo(() => {
    if (!searchQuery) return notIntroduced;
    const q = searchQuery.toLowerCase();
    return notIntroduced.filter(
      (b) => b.buyer_name.toLowerCase().includes(q) || b.buyer_firm_name.toLowerCase().includes(q),
    );
  }, [notIntroduced, searchQuery]);

  const filteredIntroducedPassed = useMemo(() => {
    if (!searchQuery) return introducedAndPassed;
    const q = searchQuery.toLowerCase();
    return introducedAndPassed.filter(
      (b) => b.buyer_name.toLowerCase().includes(q) || b.buyer_firm_name.toLowerCase().includes(q),
    );
  }, [introducedAndPassed, searchQuery]);

  // Select-all helpers for each section
  const allNotIntroducedSelected =
    filteredNotIntroduced.length > 0 && filteredNotIntroduced.every((b) => selectedIds.has(b.id));
  const someNotIntroducedSelected = filteredNotIntroduced.some((b) => selectedIds.has(b.id));
  const toggleAllNotIntroduced = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allNotIntroducedSelected) {
        filteredNotIntroduced.forEach((b) => next.delete(b.id));
      } else {
        filteredNotIntroduced.forEach((b) => next.add(b.id));
      }
      return next;
    });
  }, [allNotIntroducedSelected, filteredNotIntroduced]);

  const allIntroducedSelected =
    filteredIntroducedPassed.length > 0 &&
    filteredIntroducedPassed.every((b) => selectedIds.has(b.id));
  const someIntroducedSelected = filteredIntroducedPassed.some((b) => selectedIds.has(b.id));
  const toggleAllIntroduced = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allIntroducedSelected) {
        filteredIntroducedPassed.forEach((b) => next.delete(b.id));
      } else {
        filteredIntroducedPassed.forEach((b) => next.add(b.id));
      }
      return next;
    });
  }, [allIntroducedSelected, filteredIntroducedPassed]);

  // Stats
  const stats = {
    total: introductions.length,
    notIntroduced: notIntroduced.length,
    fitAndInterested: introductions.filter((i) => i.introduction_status === 'fit_and_interested')
      .length,
    notAFit: introductions.filter((i) => i.introduction_status === 'not_a_fit').length,
  };

  const openBuyerUpdate = useCallback((b: BuyerIntroduction) => {
    setSelectedBuyer(b);
    setUpdateDialogOpen(true);
  }, []);

  const closeBuyerUpdate = useCallback((open: boolean) => {
    setUpdateDialogOpen(open);
    if (!open) setSelectedBuyer(null);
  }, []);

  return {
    // Data
    introductions,
    isLoading,
    scoreMap,
    universeAssignment,
    stats,

    // Filtered lists
    filteredNotIntroduced,
    filteredIntroducedPassed,

    // Search
    searchQuery,
    setSearchQuery,

    // Dialogs
    addDialogOpen,
    setAddDialogOpen,
    selectedBuyer,
    updateDialogOpen,
    openBuyerUpdate,
    closeBuyerUpdate,

    // Selection
    selectedIds,
    toggleSelection,
    clearSelection,
    selectedBuyerNames,
    confirmRemoveOpen,
    setConfirmRemoveOpen,
    handleRemoveSelected,
    isBatchArchiving,

    // Select-all for "not introduced" section
    allNotIntroducedSelected,
    someNotIntroducedSelected,
    toggleAllNotIntroduced,

    // Select-all for "introduced" section
    allIntroducedSelected,
    someIntroducedSelected,
    toggleAllIntroduced,

    // Universe
    sendBuyerToUniverse,
    isSendingToUniverse,
  };
}
