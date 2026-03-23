import { useState, useMemo, useEffect } from 'react';
import { useDeals, useDealStages, Deal } from '@/hooks/admin/use-deals';
import {
  useDealFilters,
  DealStatusFilter,
  DocumentStatusFilter,
  BuyerTypeFilter,
  SortOption,
} from '@/hooks/admin/use-deal-filters';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { usePipelineViews } from './use-pipeline-views';

export type ViewMode = 'kanban' | 'list' | 'table';

export interface PipelineMetrics {
  totalDeals: number;
  totalValue: number;
  avgProbability: number;
  pendingTasks: number;
  conversionRate: number;
  avgDaysInStage: number;
}

export function usePipelineCore() {
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [selectedDeals, setSelectedDeals] = useState<string[]>([]);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);
  const [currentAdminId, setCurrentAdminId] = useState<string | undefined>(undefined);
  const [currentViewId, setCurrentViewId] = useState<string | null>(null);

  const isMobile = useIsMobile();

  // Get current admin ID
  useEffect(() => {
    let active = true;
    const getCurrentUser = async () => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (active) setCurrentAdminId(user?.id);
    };
    getCurrentUser();
    return () => {
      active = false;
    };
  }, []);

  // Data fetching - include all stages (including closed won/lost)
  const { data: deals, isLoading: dealsLoading, error: _dealsError } = useDeals();
  const { data: allStages, isLoading: stagesLoading, error: _stagesError } = useDealStages(true); // Include all stages
  const { data: pipelineViews = [] } = usePipelineViews();

  // Filter stages based on current view with custom ordering
  const stages = useMemo(() => {
    if (!allStages) return [];

    // If no view selected or views not loaded, show all stages in default order
    if (!currentViewId || pipelineViews.length === 0) {
      return [...allStages].sort((a, b) => a.position - b.position);
    }

    // Find the selected view
    const selectedView = pipelineViews.find((v) => v.id === currentViewId);
    if (!selectedView || !selectedView.stage_config || selectedView.stage_config.length === 0) {
      return [...allStages].sort((a, b) => a.position - b.position);
    }

    // Filter and sort stages based on view's stage_config
    const stageIds = selectedView.stage_config.map((config) => config.stageId);
    const filteredStages = allStages.filter((stage) => stageIds.includes(stage.id));

    // Sort by view's custom position
    return filteredStages.sort((a, b) => {
      const aConfig = selectedView.stage_config.find((c) => c.stageId === a.id);
      const bConfig = selectedView.stage_config.find((c) => c.stageId === b.id);
      return (aConfig?.position || 0) - (bConfig?.position || 0);
    });
  }, [allStages, currentViewId, pipelineViews]);

  // Filtering
  const filterHook = useDealFilters(deals || [], currentAdminId);
  const { filteredAndSortedDeals } = filterHook;

  // Load filter config when view changes
  useEffect(() => {
    if (!currentViewId || pipelineViews.length === 0) return;

    const selectedView = pipelineViews.find((v) => v.id === currentViewId);
    if (!selectedView?.filter_config) return;

    const config = selectedView.filter_config;

    // Apply saved filters with proper type casting and null checks
    try {
      if (config.searchQuery !== undefined) filterHook.setSearchQuery(config.searchQuery);
      if (config.statusFilter) filterHook.setStatusFilter(config.statusFilter as DealStatusFilter);
      if (config.documentStatusFilter)
        filterHook.setDocumentStatusFilter(config.documentStatusFilter as DocumentStatusFilter);
      if (config.buyerTypeFilter)
        filterHook.setBuyerTypeFilter(config.buyerTypeFilter as BuyerTypeFilter);
      if (config.companyFilter && Array.isArray(config.companyFilter))
        filterHook.setCompanyFilter(config.companyFilter);
      if (config.adminFilter) filterHook.setAdminFilter(config.adminFilter);
      if (config.listingFilter) filterHook.setListingFilter(config.listingFilter);

      // Parse dates from strings
      if (config.createdDateRange) {
        filterHook.setCreatedDateRange({
          start: config.createdDateRange.start ? new Date(config.createdDateRange.start) : null,
          end: config.createdDateRange.end ? new Date(config.createdDateRange.end) : null,
        });
      }
      if (config.lastActivityRange) {
        filterHook.setLastActivityRange({
          start: config.lastActivityRange.start ? new Date(config.lastActivityRange.start) : null,
          end: config.lastActivityRange.end ? new Date(config.lastActivityRange.end) : null,
        });
      }
      if (config.sortOption) filterHook.setSortOption(config.sortOption as SortOption);
    } catch (error) {
      console.error('[Pipeline Core] Error loading filter config:', error);
    }
  }, [currentViewId, pipelineViews]); // Don't include filterHook in deps to avoid infinite loop

  // Derive selected deal from id for absolute correctness
  const selectedDeal = useMemo(() => {
    if (!filteredAndSortedDeals || !selectedDealId) return null;
    const found = filteredAndSortedDeals.find((d) => d.deal_id === selectedDealId);
    return found || null;
  }, [filteredAndSortedDeals, selectedDealId]);

  // Group deals by stage
  const dealsByStage = useMemo(() => {
    if (!filteredAndSortedDeals || !stages) return {};

    return stages.reduce(
      (acc, stage) => {
        acc[stage.id] = filteredAndSortedDeals.filter((deal) => deal.stage_id === stage.id);
        return acc;
      },
      {} as Record<string, Deal[]>,
    );
  }, [filteredAndSortedDeals, stages]);

  // Calculate metrics
  const metrics = useMemo((): PipelineMetrics => {
    if (!filteredAndSortedDeals) {
      return {
        totalDeals: 0,
        totalValue: 0,
        avgProbability: 0,
        pendingTasks: 0,
        conversionRate: 0,
        avgDaysInStage: 0,
      };
    }

    const totalValue = filteredAndSortedDeals.reduce((sum, deal) => sum + deal.deal_value, 0);
    const avgProbability =
      filteredAndSortedDeals.length > 0
        ? filteredAndSortedDeals.reduce((sum, deal) => sum + deal.deal_probability, 0) /
          filteredAndSortedDeals.length
        : 0;
    const pendingTasks = filteredAndSortedDeals.reduce((sum, deal) => sum + deal.pending_tasks, 0);

    // Calculate conversion rate (deals in final stages)
    const finalStageDeals = filteredAndSortedDeals.filter(
      (deal) =>
        deal.stage_name?.toLowerCase().includes('closed') ||
        deal.stage_name?.toLowerCase().includes('won'),
    );
    const conversionRate =
      filteredAndSortedDeals.length > 0
        ? (finalStageDeals.length / filteredAndSortedDeals.length) * 100
        : 0;

    // Calculate average days in current stage
    const avgDaysInStage =
      filteredAndSortedDeals.length > 0
        ? filteredAndSortedDeals.reduce((sum, deal) => {
            const stageEnteredAt = new Date(deal.deal_stage_entered_at);
            const now = new Date();
            const daysInStage = Math.floor(
              (now.getTime() - stageEnteredAt.getTime()) / (1000 * 60 * 60 * 24),
            );
            return sum + daysInStage;
          }, 0) / filteredAndSortedDeals.length
        : 0;

    return {
      totalDeals: filteredAndSortedDeals.length,
      totalValue,
      avgProbability,
      pendingTasks,
      conversionRate,
      avgDaysInStage,
    };
  }, [filteredAndSortedDeals]);

  // Stage metrics
  const stageMetrics = useMemo(() => {
    if (!stages || !dealsByStage) return [];

    return stages.map((stage) => {
      const stageDeals = dealsByStage[stage.id] || [];
      const totalValue = stageDeals.reduce((sum, deal) => sum + deal.deal_value, 0);
      const avgProbability =
        stageDeals.length > 0
          ? stageDeals.reduce((sum, deal) => sum + deal.deal_probability, 0) / stageDeals.length
          : 0;

      return {
        ...stage,
        dealCount: stageDeals.length,
        totalValue,
        avgProbability,
        deals: stageDeals,
      };
    });
  }, [stages, dealsByStage]);

  // Actions
  const handleDealSelect = (deal: Deal) => {
    setSelectedDealId(deal.deal_id);
  };

  const handleMultiSelect = (dealIds: string[]) => {
    setSelectedDeals(dealIds);
  };

  const toggleFilterPanel = () => {
    setIsFilterPanelOpen(!isFilterPanelOpen);
  };
  const setSelectedDeal = (deal: Deal | null) => {
    setSelectedDealId(deal?.deal_id ?? null);
  };

  // Get current filter state for saving (serialize dates to ISO strings)
  const getCurrentFilterConfig = () => {
    try {
      return {
        searchQuery: filterHook.searchQuery || '',
        statusFilter: filterHook.statusFilter || 'all',
        documentStatusFilter: filterHook.documentStatusFilter || 'all',
        buyerTypeFilter: filterHook.buyerTypeFilter || 'all',
        companyFilter: Array.isArray(filterHook.companyFilter) ? filterHook.companyFilter : [],
        adminFilter: filterHook.adminFilter || 'all',
        listingFilter: filterHook.listingFilter || 'all',
        createdDateRange: {
          start: filterHook.createdDateRange?.start?.toISOString() || null,
          end: filterHook.createdDateRange?.end?.toISOString() || null,
        },
        lastActivityRange: {
          start: filterHook.lastActivityRange?.start?.toISOString() || null,
          end: filterHook.lastActivityRange?.end?.toISOString() || null,
        },
        sortOption: filterHook.sortOption || 'created_at_desc',
      };
    } catch (error) {
      console.error('[Pipeline Core] Error getting filter config:', error);
      return {};
    }
  };

  return {
    // State
    viewMode,
    selectedDeal,
    selectedDeals,
    isFilterPanelOpen,
    currentViewId,

    isMobile,

    // Data
    deals: filteredAndSortedDeals || [],
    stages: stages || [],
    dealsByStage,
    metrics,
    stageMetrics,
    isLoading: dealsLoading || stagesLoading,

    // Filters
    ...filterHook,

    // Actions
    setViewMode,
    setSelectedDeal,
    setSelectedDeals,
    setIsFilterPanelOpen,
    setCurrentViewId,

    handleDealSelect,
    handleMultiSelect,
    toggleFilterPanel,
    getCurrentFilterConfig,
    pipelineViews,
  };
}
