import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invokeWithTimeout } from '@/lib/invoke-with-timeout';
import { toast } from 'sonner';
import { getTierFromScore } from '@/components/remarketing';
import { getEffectiveWebsite, calculateDataCompleteness } from './helpers';

export function useDealDetail() {
  const { dealId } = useParams<{ dealId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const backTo = (location.state as { from?: string } | null)?.from || '/admin/deals';
  const queryClient = useQueryClient();

  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichStartedAt, setEnrichStartedAt] = useState<string | null>(null);
  const [isAnalyzingNotes, setIsAnalyzingNotes] = useState(false);
  const [buyerHistoryOpen, setBuyerHistoryOpen] = useState(false);
  const [editFinancialsOpen, setEditFinancialsOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');

  // Fetch deal/listing data
  const { data: deal, isLoading: dealLoading } = useQuery({
    queryKey: ['remarketing', 'deal', dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('listings')
        .select('*')
        .eq('id', dealId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!dealId,
    // Poll every 10s while enrichment is in progress so deal data refreshes automatically
    refetchInterval: enrichStartedAt ? 10_000 : false,
  });

  // Resolve deal owner name from deal_owner_id or primary_owner_id
  const dealOwnerId = deal?.deal_owner_id || deal?.primary_owner_id || null;
  const { data: dealOwnerProfile } = useQuery({
    queryKey: ['profile', dealOwnerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .eq('id', dealOwnerId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!dealOwnerId,
    staleTime: 60_000,
  });
  const dealOwnerName = dealOwnerProfile
    ? `${dealOwnerProfile.first_name ?? ''} ${dealOwnerProfile.last_name ?? ''}`.trim()
    : null;

  // Stop polling once enriched_at has advanced past when we started enrichment,
  // or after 3 minutes as a safety timeout to prevent infinite polling.
  useEffect(() => {
    if (!enrichStartedAt) return;

    if (deal?.enriched_at && deal.enriched_at > enrichStartedAt) {
      setEnrichStartedAt(null);
      return;
    }

    const timeout = setTimeout(() => {
      setEnrichStartedAt(null);
    }, 180_000); // 3 minute safety timeout

    return () => clearTimeout(timeout);
  }, [enrichStartedAt, deal?.enriched_at]);

  // Score stats decommissioned — old scoring engine removed.
  // Downstream components (DataRoomTab, OverviewTab, WebsiteActionsCard) accept
  // scoreStats as an optional prop and gracefully handle undefined.
  const scoreStats = undefined as
    | { count: number; approved: number; passed: number; avgScore: number }
    | undefined;

  // Fetch pipeline stats
  const { data: pipelineStats } = useQuery({
    queryKey: ['remarketing', 'pipeline', dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('remarketing_outreach')
        .select('status')
        .eq('listing_id', dealId!);
      if (error) throw error;
      return {
        contacted: data?.filter((o) => o.status === 'contacted').length || 0,
        responded: data?.filter((o) => o.status === 'responded').length || 0,
        meetingScheduled: data?.filter((o) => o.status === 'meeting_scheduled').length || 0,
        loiSent: data?.filter((o) => o.status === 'loi_sent').length || 0,
        closedWon: data?.filter((o) => o.status === 'closed_won').length || 0,
        closedLost: data?.filter((o) => o.status === 'closed_lost').length || 0,
      };
    },
    enabled: !!dealId,
  });

  // Fetch transcripts
  const { data: transcripts, isLoading: transcriptsLoading } = useQuery({
    queryKey: ['remarketing', 'deal-transcripts', dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_transcripts')
        .select('*')
        .eq('listing_id', dealId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!dealId,
  });

  // Mutation to update deal fields
  const updateDealMutation = useMutation({
    mutationFn: async (updates: Record<string, unknown>) => {
      const { error } = await supabase.from('listings').update(updates).eq('id', dealId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal', dealId] });
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
    },
  });

  // Toggle universe build flag
  const toggleUniverseFlagMutation = useMutation({
    mutationFn: async (flagged: boolean) => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      const { error } = await supabase
        .from('listings')
        .update({
          universe_build_flagged: flagged,
          universe_build_flagged_at: flagged ? new Date().toISOString() : null,
          universe_build_flagged_by: flagged ? user?.id : null,
        })
        .eq('id', dealId!);
      if (error) throw error;
    },
    onSuccess: (_, flagged) => {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal', dealId] });
      toast.success(flagged ? 'Flagged for universe build' : 'Universe build flag removed');
    },
    onError: () => toast.error('Failed to update flag'),
  });

  // Toggle "needs owner contact" flag
  const toggleContactOwnerMutation = useMutation({
    mutationFn: async (flagged: boolean) => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      const { error } = await supabase
        .from('listings')
        .update({
          needs_owner_contact: flagged,
          needs_owner_contact_at: flagged ? new Date().toISOString() : null,
          needs_owner_contact_by: flagged ? user?.id : null,
        })
        .eq('id', dealId!);
      if (error) throw error;
    },
    onSuccess: (_, flagged) => {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal', dealId] });
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
      toast.success(
        flagged ? 'Flagged: Owner needs to be contacted' : 'Contact owner flag cleared',
      );
    },
    onError: () => toast.error('Failed to update flag'),
  });

  // Toggle "needs buyer search" flag
  const toggleBuyerSearchMutation = useMutation({
    mutationFn: async (flagged: boolean) => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      const { error } = await supabase
        .from('listings')
        .update({
          needs_buyer_search: flagged,
          needs_buyer_search_at: flagged ? new Date().toISOString() : null,
          needs_buyer_search_by: flagged ? user?.id : null,
        })
        .eq('id', dealId!);
      if (error) throw error;
    },
    onSuccess: (_, flagged) => {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal', dealId] });
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deals'] });
      toast.success(flagged ? 'Flagged: Need to find a buyer' : 'Find buyer flag cleared');
    },
    onError: () => toast.error('Failed to update flag'),
  });

  // Company name editing
  const updateNameMutation = useMutation({
    mutationFn: async (newName: string) => {
      const { error } = await supabase
        .from('listings')
        .update({ internal_company_name: newName })
        .eq('id', dealId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal', dealId] });
      toast.success('Company name updated');
      setIsEditingName(false);
    },
    onError: (err: Error) => toast.error(`Failed to update name: ${err.message}`),
  });

  const currentName = deal?.internal_company_name || deal?.title || '';

  const handleSaveName = () => {
    const trimmed = editedName.trim();
    if (!trimmed || trimmed === currentName) {
      setIsEditingName(false);
      return;
    }
    updateNameMutation.mutate(trimmed);
  };

  const handleCancelEdit = () => {
    setEditedName(currentName);
    setIsEditingName(false);
  };

  // Enrichment
  const handleEnrichFromWebsite = async () => {
    if (!deal) return;
    setIsEnriching(true);
    try {
      const { queueDealEnrichment } = await import('@/lib/remarketing/queueEnrichment');
      await queueDealEnrichment([dealId!]);
      // Start polling for deal data refresh until enriched_at advances
      setEnrichStartedAt(new Date().toISOString());
      toast.success('Queued for background enrichment — data will refresh automatically');
    } catch (error: unknown) {
      toast.error((error instanceof Error ? error.message : null) || 'Failed to queue enrichment');
    } finally {
      setIsEnriching(false);
    }
  };

  // Analyze notes
  const handleAnalyzeNotes = async (notes: string) => {
    setIsAnalyzingNotes(true);
    try {
      const { data, error } = await invokeWithTimeout<any>('analyze-deal-notes', {
        body: { dealId, notesText: notes },
        timeoutMs: 120_000,
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`Extracted ${data.fieldsUpdated?.length || 0} fields from notes`);
        queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal', dealId] });
      } else {
        toast.error(data?.error || 'Failed to analyze notes');
      }
    } catch (error: unknown) {
      toast.error((error instanceof Error ? error.message : null) || 'Failed to analyze notes');
    } finally {
      setIsAnalyzingNotes(false);
    }
  };

  // Derived values
  const effectiveWebsite = deal ? getEffectiveWebsite(deal) : null;
  const dataCompleteness = deal
    ? calculateDataCompleteness(
        deal as Parameters<typeof calculateDataCompleteness>[0],
        effectiveWebsite,
      )
    : 0;
  const tier = scoreStats ? getTierFromScore((scoreStats as { avgScore: number }).avgScore) : null;
  const displayName = deal?.internal_company_name || deal?.title || '';
  const listedName =
    deal?.internal_company_name && deal?.title !== deal?.internal_company_name ? deal?.title : null;

  return {
    dealId,
    navigate,
    backTo,
    queryClient,
    // Data
    deal,
    dealLoading,
    scoreStats,
    pipelineStats,
    transcripts,
    transcriptsLoading,
    dealOwnerName,
    // Mutations
    updateDealMutation,
    toggleUniverseFlagMutation,
    toggleContactOwnerMutation,
    toggleBuyerSearchMutation,
    updateNameMutation,
    // UI state
    isEnriching,
    isAnalyzingNotes,
    buyerHistoryOpen,
    setBuyerHistoryOpen,
    editFinancialsOpen,
    setEditFinancialsOpen,
    isEditingName,
    setIsEditingName,
    editedName,
    setEditedName,
    // Handlers
    handleEnrichFromWebsite,
    handleSaveName,
    handleCancelEdit,
    handleAnalyzeNotes,
    // Derived
    effectiveWebsite,
    dataCompleteness,
    tier,
    displayName,
    listedName,
  };
}
