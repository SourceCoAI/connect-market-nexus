import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  SizeCriteria,
  GeographyCriteria,
  ServiceCriteria,
  BuyerTypesCriteria,
  ScoringBehavior,
  DocumentReference,
  TargetBuyerTypeConfig,
} from '@/types/remarketing';
import { toast } from 'sonner';
import { useBuyerEnrichment } from '@/hooks/useBuyerEnrichment';
import { useBuyerEnrichmentQueue } from '@/hooks/useBuyerEnrichmentQueue';
import { useDealEnrichment } from '@/hooks/useDealEnrichment';
import { useEnrichmentProgress } from '@/hooks/useEnrichmentProgress';
import { useAlignmentScoring } from '@/hooks/useAlignmentScoring';
import type { UniverseFormData } from './types';

export function useUniverseData() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isNew = id === 'new';

  // Form state
  const [formData, setFormData] = useState<UniverseFormData>({
    name: '',
    description: '',
    fit_criteria: '',
    geography_weight: 20,
    size_weight: 30,
    service_weight: 45,
    owner_goals_weight: 5,
  });

  const [sizeCriteria, setSizeCriteria] = useState<SizeCriteria>({});
  const [geographyCriteria, setGeographyCriteria] = useState<GeographyCriteria>({});
  const [serviceCriteria, setServiceCriteria] = useState<ServiceCriteria>({});
  const [buyerTypesCriteria, setBuyerTypesCriteria] = useState<BuyerTypesCriteria>({
    include_pe_firms: true,
    include_platforms: true,
    include_strategic: true,
    include_family_office: true,
    include_independent_sponsors: true,
    include_search_funds: true,
    include_individual_buyers: true,
  });
  const [scoringBehavior, setScoringBehavior] = useState<ScoringBehavior>({});
  const [documents, setDocuments] = useState<DocumentReference[]>([]);
  const [maGuideContent, setMaGuideContent] = useState('');
  const [targetBuyerTypes, setTargetBuyerTypes] = useState<TargetBuyerTypeConfig[]>([]);

  // Dialog/UI state
  const [buyerSearch, setBuyerSearch] = useState('');
  const [addDealDialogOpen, setAddDealDialogOpen] = useState(false);
  const [addDealDefaultTab, setAddDealDefaultTab] = useState<'existing' | 'new'>('existing');
  const [importDealsDialogOpen, setImportDealsDialogOpen] = useState(false);
  const [isScoringAllDeals, setIsScoringAllDeals] = useState(false);
  const [showCriteriaEdit, setShowCriteriaEdit] = useState(false);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [importBuyersDialogOpen, setImportBuyersDialogOpen] = useState(false);
  const [addBuyerDialogOpen, setAddBuyerDialogOpen] = useState(false);
  const [showBuyerEnrichDialog, setShowBuyerEnrichDialog] = useState(false);
  const [selectedBuyerIds, setSelectedBuyerIds] = useState<string[]>([]);
  const [isRemovingSelected, setIsRemovingSelected] = useState(false);
  const [editingHeader, setEditingHeader] = useState(false);
  const [selectedDealIds, setSelectedDealIds] = useState<string[]>([]);
  const [isRemovingSelectedDeals, setIsRemovingSelectedDeals] = useState(false);

  // Use the enrichment hook for proper batch processing with progress tracking (legacy - for direct enrichment)
  useBuyerEnrichment(id);

  // Use the queue-based enrichment for persistent background processing
  const {
    progress: queueProgress,
    summary: enrichmentSummary,
    showSummary: showEnrichmentSummary,
    dismissSummary: dismissEnrichmentSummary,
    queueBuyers,
    cancel: cancelQueueEnrichment,
    reset: resetQueueEnrichment,
  } = useBuyerEnrichmentQueue(id);

  // Use the deal enrichment hook for queuing deals
  const {
    progress: dealEnrichmentProgress,
    enrichDeals,
    cancel: cancelDealEnrichment,
    reset: resetDealEnrichment,
  } = useDealEnrichment(id);

  // Use the queue-based deal enrichment progress for real-time tracking
  const {
    progress: dealQueueProgress,
    cancelEnrichment: cancelDealQueueEnrichment,
    pauseEnrichment: pauseDealEnrichment,
    resumeEnrichment: resumeDealEnrichment,
  } = useEnrichmentProgress();

  // Use the alignment scoring hook
  const {
    isScoring: isScoringAlignment,
    progress: alignmentProgress,
    scoreBuyers: scoreAlignmentBuyers,
    cancel: cancelAlignmentScoring,
    reset: resetAlignmentScoring,
  } = useAlignmentScoring(id);

  // Fetch universe if editing
  const { data: universe, isLoading } = useQuery({
    queryKey: ['remarketing', 'universe', id],
    queryFn: async () => {
      if (isNew) return null;

      const { data, error } = await supabase
        .from('buyer_universes')
        .select('*')
        .eq('id', id!)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !isNew,
  });

  // Fetch buyers in this universe
  const { data: buyers, refetch: refetchBuyers } = useQuery({
    queryKey: ['remarketing', 'buyers', 'universe', id],
    queryFn: async () => {
      if (isNew) return [];

      const { data, error } = await supabase
        .from('buyers')
        .select(
          'id, company_name, company_website, platform_website, pe_firm_website, buyer_type, pe_firm_name, hq_city, hq_state, business_summary, thesis_summary, target_geographies, geographic_footprint, service_regions, operating_locations, alignment_score, alignment_reasoning, alignment_checked_at, has_fee_agreement',
        )
        .eq('universe_id', id!)
        .eq('archived', false)
        .order('alignment_score', { ascending: false, nullsFirst: false });

      if (error) {
        throw error;
      }
      return data || [];
    },
    enabled: !isNew,
    refetchOnWindowFocus: false, // Prevent unnecessary refetches
    staleTime: 15_000, // 15s — prevents re-fetch storms; invalidation still triggers fresh fetch
  });

  // Fetch buyer IDs that have transcripts - needed to determine Intel level
  // Without transcripts, max intel is "Some Intel" (not "Strong")
  const { data: buyerIdsWithTranscripts } = useQuery({
    queryKey: ['remarketing', 'buyer-transcripts', id],
    queryFn: async () => {
      if (isNew || !buyers?.length) return new Set<string>();

      const buyerIds = buyers.map((b) => b.id);
      const { data, error } = await supabase
        .from('buyer_transcripts')
        .select('buyer_id')
        .in('buyer_id', buyerIds);

      if (error) {
        return new Set<string>();
      }

      return new Set((data || []).map((t: { buyer_id: string }) => t.buyer_id));
    },
    enabled: !isNew && !!buyers?.length,
  });

  // Real-time subscription for buyer updates during enrichment
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (isNew || !id) return;

    // Cleanup any previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channel = supabase
      .channel(`universe-buyers:${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'buyers',
          filter: `universe_id=eq.${id}`,
        },
        (_payload) => {
          // Refetch buyers list on any change (INSERT, UPDATE, DELETE)
          refetchBuyers();
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [id, isNew, refetchBuyers]);

  // Fetch deals explicitly linked to this universe via junction table
  const { data: universeDeals, refetch: refetchDeals } = useQuery({
    queryKey: ['remarketing', 'universe-deals', id],
    queryFn: async () => {
      if (isNew) return [];

      const result = await supabase
        .from('remarketing_universe_deals')
        .select(
          `
          id,
          added_at,
          status,
          listing:listings(
            id, title, internal_company_name, description, executive_summary, location, address_city, address_state, revenue, ebitda,
            enriched_at, geographic_states,
            linkedin_employee_count, linkedin_employee_range,
            google_rating, google_review_count,
            deal_total_score, seller_interest_score
          )
        `,
        )
        .eq('universe_id', id!)
        .eq('status', 'active')
        .order('added_at', { ascending: false });

      if (result.error) throw result.error;
      return result.data || [];
    },
    enabled: !isNew,
  });

  // Fetch engagement stats from remarketing_scores for deals in this universe
  const { data: dealEngagementStats } = useQuery({
    queryKey: ['remarketing', 'deal-engagement', id],
    queryFn: async () => {
      if (isNew || !universeDeals?.length) return {};

      const listingIds = universeDeals
        .map((d) => (d.listing as { id?: string } | null)?.id)
        .filter(Boolean) as string[];
      if (listingIds.length === 0) return {};

      const { data: scores, error } = await supabase
        .from('remarketing_scores')
        .select('listing_id, status, composite_score')
        .eq('universe_id', id!)
        .in('listing_id', listingIds);

      if (error) throw error;

      const stats: Record<
        string,
        {
          approved: number;
          interested: number;
          passed: number;
          avgScore: number;
          totalScore: number;
          count: number;
        }
      > = {};

      scores?.forEach((score) => {
        if (!stats[score.listing_id]) {
          stats[score.listing_id] = {
            approved: 0,
            interested: 0,
            passed: 0,
            avgScore: 0,
            totalScore: 0,
            count: 0,
          };
        }
        const s = stats[score.listing_id];
        s.count++;
        s.totalScore += score.composite_score || 0;

        if (score.status === 'approved') s.approved++;
        else if (score.status === 'pending') s.interested++;
        else if (score.status === 'passed') s.passed++;
      });

      // Calculate averages
      Object.values(stats).forEach((s) => {
        s.avgScore = s.count > 0 ? s.totalScore / s.count : 0;
      });

      return stats;
    },
    enabled: !isNew && !!universeDeals?.length,
  });

  // Update form when universe loads
  useEffect(() => {
    if (universe) {
      setFormData({
        name: universe.name || '',
        description: universe.description || '',
        fit_criteria: universe.fit_criteria || '',
        geography_weight: universe.geography_weight || 20,
        size_weight: universe.size_weight || 30,
        service_weight: universe.service_weight || 45,
        owner_goals_weight: universe.owner_goals_weight || 5,
      });
      setSizeCriteria((universe.size_criteria as unknown as SizeCriteria) || {});
      setGeographyCriteria((universe.geography_criteria as unknown as GeographyCriteria) || {});
      setServiceCriteria((universe.service_criteria as unknown as ServiceCriteria) || {});
      setBuyerTypesCriteria(
        (universe.buyer_types_criteria as unknown as BuyerTypesCriteria) || {
          include_pe_firms: true,
          include_platforms: true,
          include_strategic: true,
          include_family_office: true,
          include_independent_sponsors: true,
          include_search_funds: true,
          include_individual_buyers: true,
        },
      );
      setScoringBehavior((universe.scoring_behavior as unknown as ScoringBehavior) || {});
      setDocuments((universe.documents as unknown as DocumentReference[]) || []);
      setMaGuideContent(universe.ma_guide_content || '');

      // Load saved target buyer types from DB, fall back to defaults if empty
      const savedBuyerTypes = universe.target_buyer_types as unknown as
        | TargetBuyerTypeConfig[]
        | null;
      if (savedBuyerTypes && savedBuyerTypes.length > 0) {
        setTargetBuyerTypes(savedBuyerTypes);
      }
    }
  }, [universe]);

  // Auto-sync M&A guide to Supporting Documents if guide exists but document entry is missing
  useEffect(() => {
    const syncGuideToDocuments = async () => {
      if (!id || isNew || !universe) return;

      const guideContent = universe.ma_guide_content;
      const existingDocs = (universe.documents as unknown as DocumentReference[]) || [];
      const hasGuideDoc = existingDocs.some((d) => d.type === 'ma_guide');

      // If there's substantial guide content but no document entry, create one
      if (guideContent && guideContent.length > 1000 && !hasGuideDoc) {
        try {
          // Call edge function to upload HTML to storage
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-guide-pdf`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
              },
              body: JSON.stringify({
                universeId: id,
                industryName: universe.name || 'M&A Guide',
                content: guideContent,
              }),
            },
          );

          if (!response.ok) {
            // Failed to generate guide document
            return;
          }

          const data = await response.json();
          if (!data.success || !data.document) {
            // No document returned from generate-guide-pdf
            return;
          }

          // Build updated documents array
          const updatedDocs = [...existingDocs, data.document];

          // Write back to database
          const { error: updateError } = await supabase
            .from('buyer_universes')
            .update({ documents: updatedDocs })
            .eq('id', id);

          if (updateError) {
            // Failed to save document
            return;
          }

          // Update local state for immediate UI feedback
          setDocuments(updatedDocs);
        } catch (error) {
          // Error syncing guide to documents — non-critical
        }
      }
    };

    syncGuideToDocuments();
  }, [universe, id, isNew]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const saveData: Record<string, unknown> = {
        ...formData,
        size_criteria: sizeCriteria,
        geography_criteria: geographyCriteria,
        service_criteria: serviceCriteria,
        buyer_types_criteria: buyerTypesCriteria,
        scoring_behavior: scoringBehavior,
        documents: documents,
        ma_guide_content: maGuideContent,
        target_buyer_types: targetBuyerTypes,
      };

      if (isNew) {
        const { data, error } = await supabase
          .from('buyer_universes')
          .insert([saveData] as never)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        const { error } = await supabase.from('buyer_universes').update(saveData).eq('id', id!);

        if (error) throw error;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['remarketing', 'universes'] });
      toast.success(isNew ? 'Universe created' : 'Universe saved');
      if (isNew && data?.id) {
        navigate(`/admin/buyers/universes/${data.id}`);
      }
    },
    onError: () => {
      toast.error('Failed to save universe');
    },
  });

  // Filter buyers by search
  const filteredBuyers =
    buyers?.filter(
      (buyer) =>
        !buyerSearch ||
        buyer.company_name.toLowerCase().includes(buyerSearch.toLowerCase()) ||
        buyer.pe_firm_name?.toLowerCase().includes(buyerSearch.toLowerCase()),
    ) || [];

  const totalWeight =
    formData.geography_weight +
    formData.size_weight +
    formData.service_weight +
    formData.owner_goals_weight;

  return {
    id,
    isNew,
    navigate,
    queryClient,

    // Form state
    formData,
    setFormData,
    sizeCriteria,
    setSizeCriteria,
    geographyCriteria,
    setGeographyCriteria,
    serviceCriteria,
    setServiceCriteria,
    buyerTypesCriteria,
    setBuyerTypesCriteria,
    scoringBehavior,
    setScoringBehavior,
    documents,
    setDocuments,
    maGuideContent,
    setMaGuideContent,
    targetBuyerTypes,
    setTargetBuyerTypes,

    // Dialog/UI state
    buyerSearch,
    setBuyerSearch,
    addDealDialogOpen,
    setAddDealDialogOpen,
    addDealDefaultTab,
    setAddDealDefaultTab,
    importDealsDialogOpen,
    setImportDealsDialogOpen,
    isScoringAllDeals,
    setIsScoringAllDeals,
    showCriteriaEdit,
    setShowCriteriaEdit,
    documentsOpen,
    setDocumentsOpen,
    isParsing,
    setIsParsing,
    importBuyersDialogOpen,
    setImportBuyersDialogOpen,
    addBuyerDialogOpen,
    setAddBuyerDialogOpen,
    showBuyerEnrichDialog,
    setShowBuyerEnrichDialog,
    selectedBuyerIds,
    setSelectedBuyerIds,
    isRemovingSelected,
    setIsRemovingSelected,
    editingHeader,
    setEditingHeader,
    selectedDealIds,
    setSelectedDealIds,
    isRemovingSelectedDeals,
    setIsRemovingSelectedDeals,

    // Query data
    universe,
    isLoading,
    buyers,
    refetchBuyers,
    buyerIdsWithTranscripts,
    universeDeals,
    refetchDeals,
    dealEngagementStats,

    // Enrichment hooks
    queueProgress,
    enrichmentSummary,
    showEnrichmentSummary,
    dismissEnrichmentSummary,
    queueBuyers,
    cancelQueueEnrichment,
    resetQueueEnrichment,
    dealEnrichmentProgress,
    enrichDeals,
    cancelDealEnrichment,
    resetDealEnrichment,
    dealQueueProgress,
    cancelDealQueueEnrichment,
    pauseDealEnrichment,
    resumeDealEnrichment,
    isScoringAlignment,
    alignmentProgress,
    scoreAlignmentBuyers,
    cancelAlignmentScoring,
    resetAlignmentScoring,

    // Mutation
    saveMutation,

    // Derived
    filteredBuyers,
    totalWeight,
  };
}

export type UseUniverseDataReturn = ReturnType<typeof useUniverseData>;
