import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sparkles,
  Loader2,
  BarChart3,
  ChevronDown,
  Plus,
  FileSpreadsheet,
  EyeOff,
  ThumbsDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { DealImportDialog } from '@/components/remarketing/DealImportDialog';
import { FilterBar, TimeframeSelector, SOURCECO_FIELDS } from '@/components/filters';
import { EnrichmentProgressIndicator } from '@/components/remarketing/EnrichmentProgressIndicator';
import {
  DealBulkActionBar,
  AddDealsToListDialog,
  PushToHeyreachModal,
} from '@/components/remarketing';
import type { DealForList } from '@/components/remarketing';
import { PushToDialerModal } from '@/components/remarketing/PushToDialerModal';
import { PushToSmartleadModal } from '@/components/remarketing/PushToSmartleadModal';
import { useSourceCoDeals } from './useSourceCoDeals';
import { useAIUIActionHandler } from '@/hooks/useAIUIActionHandler';
import type { Operator, FilterRule } from '@/components/filters';
import type { SortColumn } from './types';
import { useAICommandCenterContext } from '@/components/ai-command-center/AICommandCenterProvider';
import { SourceCoKPICards } from './SourceCoKPICards';
import { SourceCoTable } from './SourceCoTable';
import { SourceCoPagination } from './SourceCoPagination';
import { AddDealDialog } from './AddDealDialog';

export default function SourceCoDeals() {
  const hook = useSourceCoDeals();
  const { setPageContext } = useAICommandCenterContext();
  const [dialerOpen, setDialerOpen] = useState(false);
  const [smartleadOpen, setSmartleadOpen] = useState(false);
  const [heyreachOpen, setHeyreachOpen] = useState(false);
  const [addToListOpen, setAddToListOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMarkingNotFit, setIsMarkingNotFit] = useState(false);

  const handleBulkArchive = useCallback(async () => {
    setIsArchiving(true);
    try {
      const dealIds = Array.from(hook.selectedIds);
      const { error } = await supabase
        .from('listings')
        .update({ status: 'inactive' })
        .in('id', dealIds);
      if (error) throw error;
      hook.toast({ title: 'Deals Archived', description: `${dealIds.length} deal(s) archived` });
      hook.setSelectedIds(new Set());
      hook.queryClient.invalidateQueries({ queryKey: ['remarketing', 'sourceco-deals'] });
    } catch (err: unknown) {
      hook.toast({
        variant: 'destructive',
        title: 'Archive Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsArchiving(false);
    }
  }, [hook.selectedIds, hook.toast, hook.queryClient, hook.setSelectedIds]);

  const handleBulkDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      const dealIds = Array.from(hook.selectedIds);
      for (const dealId of dealIds) {
        await supabase.from('enrichment_queue').delete().eq('listing_id', dealId);
        await supabase.from('remarketing_scores').delete().eq('listing_id', dealId);
        await supabase.from('buyer_deal_scores').delete().eq('deal_id', dealId);
      }
      const { error } = await supabase.from('listings').delete().in('id', dealIds);
      if (error) throw error;
      hook.toast({
        title: 'Deals Deleted',
        description: `${dealIds.length} deal(s) permanently deleted`,
      });
      hook.setSelectedIds(new Set());
      hook.queryClient.invalidateQueries({ queryKey: ['remarketing', 'sourceco-deals'] });
    } catch (err: unknown) {
      hook.toast({
        variant: 'destructive',
        title: 'Delete Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsDeleting(false);
    }
  }, [hook.selectedIds, hook.toast, hook.queryClient, hook.setSelectedIds]);

  const handleMarkNotFit = useCallback(async () => {
    setIsMarkingNotFit(true);
    try {
      const dealIds = Array.from(hook.selectedIds);
      const { error } = await supabase
        .from('listings')
        .update({ remarketing_status: 'not_a_fit' } as never)
        .in('id', dealIds);
      if (error) throw error;
      hook.toast({
        title: 'Marked as Not a Fit',
        description: `${dealIds.length} deal(s) marked as not a fit`,
      });
      hook.setSelectedIds(new Set());
      hook.queryClient.invalidateQueries({ queryKey: ['remarketing', 'sourceco-deals'] });
    } catch (err: unknown) {
      hook.toast({
        variant: 'destructive',
        title: 'Failed',
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsMarkingNotFit(false);
    }
  }, [hook.selectedIds, hook.toast, hook.queryClient, hook.setSelectedIds]);

  const handleMarkNotFitSingle = useCallback(
    async (dealId: string) => {
      try {
        const { error } = await supabase
          .from('listings')
          .update({ remarketing_status: 'not_a_fit' } as never)
          .eq('id', dealId);
        if (error) throw error;
        hook.toast({ title: 'Marked as Not a Fit', description: '1 deal marked as not a fit' });
        hook.queryClient.invalidateQueries({ queryKey: ['remarketing', 'sourceco-deals'] });
      } catch (err: unknown) {
        hook.toast({
          variant: 'destructive',
          title: 'Failed',
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    },
    [hook.toast, hook.queryClient],
  );

  const selectedDealsForList = useMemo((): DealForList[] => {
    if (!hook.filteredDeals || hook.selectedIds.size === 0) return [];
    return hook.filteredDeals
      .filter((d) => hook.selectedIds.has(d.id))
      .map((d) => ({
        dealId: d.id,
        dealName: d.internal_company_name || d.title || 'Unknown Deal',
        contactName: d.main_contact_name,
        contactEmail: d.main_contact_email,
        contactPhone: d.main_contact_phone,
      }));
  }, [hook.filteredDeals, hook.selectedIds]);

  useEffect(() => {
    setPageContext({ page: 'sourceco', entity_type: 'leads' });
  }, [setPageContext]);

  useAIUIActionHandler({
    table: 'leads',
    onSelectRows: (rowIds, mode) => {
      if (mode === 'replace') hook.setSelectedIds(new Set(rowIds));
      else if (mode === 'add')
        hook.setSelectedIds((prev) => {
          const n = new Set(prev);
          rowIds.forEach((id) => n.add(id));
          return n;
        });
      else
        hook.setSelectedIds((prev) => {
          const n = new Set(prev);
          rowIds.forEach((id) => (n.has(id) ? n.delete(id) : n.add(id)));
          return n;
        });
    },
    onClearSelection: () => hook.setSelectedIds(new Set()),
    onApplyFilter: (filters, clearExisting) => {
      const rules = filters.map((f, idx) => ({
        id: `ai-filter-${idx}`,
        field: f.field,
        operator: f.operator as Operator,
        value: f.value,
      }));
      if (clearExisting)
        hook.setFilterState({ rules: rules as FilterRule[], conjunction: 'and', search: '' });
      else
        hook.setFilterState((prev) => ({
          ...prev,
          rules: [...prev.rules, ...rules] as FilterRule[],
        }));
    },
    onSortColumn: (field) => {
      const fieldMap: Record<string, string> = {
        company_name: 'company_name',
        score: 'score',
        created_at: 'created_at',
        priority: 'priority',
      };
      hook.handleSort((fieldMap[field] || field) as SortColumn);
    },
    onTriggerAction: (action) => {
      if (action === 'push_to_dialer') setDialerOpen(true);
      if (action === 'push_to_smartlead') setSmartleadOpen(true);
      if (action === 'push_to_heyreach') setHeyreachOpen(true);
    },
  });

  if (hook.isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">SourceCo Deals</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {hook.totalDeals} total &middot; {hook.unpushedCount} un-pushed &middot;{' '}
            {hook.enrichedCount} enriched &middot; {hook.scoredCount} scored
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => hook.setAddDealOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Deal
          </Button>
          <Button variant="outline" size="sm" onClick={() => hook.setCsvUploadOpen(true)}>
            <FileSpreadsheet className="h-4 w-4 mr-1" />
            Import CSV
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={hook.isEnriching}>
                {hook.isEnriching ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1" />
                )}
                Enrich
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => hook.handleBulkEnrich('unenriched')}>
                Enrich Unenriched
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => hook.handleBulkEnrich('all')}>
                Re-enrich All
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={hook.isScoring}>
                {hook.isScoring ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <BarChart3 className="h-4 w-4 mr-1" />
                )}
                Score
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => hook.handleBulkScore('unscored')}>
                Score Unscored
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => hook.handleBulkScore('all')}>
                Recalculate All
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <TimeframeSelector value={hook.timeframe} onChange={hook.setTimeframe} compact />
        </div>
      </div>

      {/* KPI Stats Cards */}
      <SourceCoKPICards
        totalDeals={hook.kpiStats.totalDeals}
        priorityDeals={hook.kpiStats.priorityDeals}
        avgScore={hook.kpiStats.avgScore}
        needsScoring={hook.kpiStats.needsScoring}
      />

      {/* Enrichment Progress Bar */}
      {(hook.enrichmentProgress.isEnriching || hook.enrichmentProgress.isPaused) && (
        <EnrichmentProgressIndicator
          completedCount={hook.enrichmentProgress.completedCount}
          totalCount={hook.enrichmentProgress.totalCount}
          progress={hook.enrichmentProgress.progress}
          estimatedTimeRemaining={hook.enrichmentProgress.estimatedTimeRemaining}
          processingRate={hook.enrichmentProgress.processingRate}
          itemLabel="deals"
          successfulCount={hook.enrichmentProgress.successfulCount}
          failedCount={hook.enrichmentProgress.failedCount}
          isPaused={hook.enrichmentProgress.isPaused}
          onCancel={hook.cancelEnrichment}
        />
      )}

      {/* Filters */}
      <FilterBar
        filterState={hook.filterState}
        onFilterStateChange={hook.setFilterState}
        fieldDefinitions={SOURCECO_FIELDS}
        dynamicOptions={hook.dynamicOptions}
        totalCount={hook.engineTotal}
        filteredCount={hook.filteredCount}
      />

      {/* Hide Pushed Toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => hook.setHidePushed(!hook.hidePushed)}
          className={cn(
            'flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border transition-colors',
            hook.hidePushed
              ? 'bg-primary/10 border-primary/30 text-primary font-medium'
              : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50',
          )}
        >
          <EyeOff className="h-3.5 w-3.5" />
          {hook.hidePushed ? 'Showing Un-Pushed Only' : 'Hide Pushed'}
        </button>
        <button
          onClick={() => hook.setHideNotFit(!hook.hideNotFit)}
          className={cn(
            'flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border transition-colors',
            hook.hideNotFit
              ? 'bg-orange-100 border-orange-300 text-orange-700 font-medium'
              : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50',
          )}
        >
          <ThumbsDown className="h-3.5 w-3.5" />
          {hook.hideNotFit ? 'Not Fit Hidden' : 'Show Not Fit'}
        </button>
      </div>

      {/* Bulk Actions */}
      <DealBulkActionBar
        selectedIds={hook.selectedIds}
        deals={hook.filteredDeals}
        onClearSelection={() => hook.setSelectedIds(new Set())}
        onRefetch={hook.refetch}
        onApproveToActiveDeals={hook.handlePushToAllDeals}
        isPushing={hook.isPushing}
        onEnrichSelected={(dealIds) => hook.handleEnrichSelected(dealIds)}
        isEnriching={hook.isEnriching}
        onPushToDialer={() => setDialerOpen(true)}
        onPushToSmartlead={() => setSmartleadOpen(true)}
        onPushToHeyreach={() => setHeyreachOpen(true)}
        onAddToList={() => setAddToListOpen(true)}
        onMarkNotFit={handleMarkNotFit}
        isMarkingNotFit={isMarkingNotFit}
        onArchive={handleBulkArchive}
        isArchiving={isArchiving}
        onDelete={handleBulkDelete}
        isDeleting={isDeleting}
      />
      <PushToDialerModal
        open={dialerOpen}
        onOpenChange={setDialerOpen}
        contactIds={Array.from(hook.selectedIds)}
        contactCount={hook.selectedIds.size}
        entityType="listings"
      />
      <PushToSmartleadModal
        open={smartleadOpen}
        onOpenChange={setSmartleadOpen}
        contactIds={Array.from(hook.selectedIds)}
        contactCount={hook.selectedIds.size}
        entityType="listings"
      />
      <PushToHeyreachModal
        open={heyreachOpen}
        onOpenChange={setHeyreachOpen}
        contactIds={Array.from(hook.selectedIds)}
        contactCount={hook.selectedIds.size}
        entityType="listings"
      />
      <AddDealsToListDialog
        open={addToListOpen}
        onOpenChange={setAddToListOpen}
        selectedDeals={selectedDealsForList}
        entityType="sourceco_deal"
      />

      {/* Deals Table */}
      <SourceCoTable
        paginatedDeals={hook.paginatedDeals}
        safePage={hook.safePage}
        PAGE_SIZE={hook.PAGE_SIZE}
        sortColumn={hook.sortColumn}
        allSelected={hook.allSelected}
        toggleSelectAll={hook.toggleSelectAll}
        selectedIds={hook.selectedIds}
        toggleSelect={hook.toggleSelect}
        handleSort={hook.handleSort}
        handlePushToAllDeals={hook.handlePushToAllDeals}
        handleEnrichSelected={hook.handleEnrichSelected}
        handleAssignOwner={hook.handleAssignOwner}
        adminProfiles={hook.adminProfiles}
        setAddDealOpen={hook.setAddDealOpen}
        setCsvUploadOpen={hook.setCsvUploadOpen}
        onMarkNotFit={handleMarkNotFitSingle}
      />

      {/* Pagination */}
      <SourceCoPagination
        filteredCount={hook.filteredDeals.length}
        totalDeals={hook.totalDeals}
        safePage={hook.safePage}
        totalPages={hook.totalPages}
        PAGE_SIZE={hook.PAGE_SIZE}
        setCurrentPage={hook.setCurrentPage}
      />

      {/* Add Deal Dialog */}
      <AddDealDialog
        open={hook.addDealOpen}
        onOpenChange={hook.setAddDealOpen}
        newDeal={hook.newDeal}
        setNewDeal={hook.setNewDeal}
        isAddingDeal={hook.isAddingDeal}
        handleAddDeal={hook.handleAddDeal}
      />

      {/* CSV Upload Dialog */}
      <DealImportDialog
        open={hook.csvUploadOpen}
        onOpenChange={hook.setCsvUploadOpen}
        onImportComplete={hook.handleImportComplete}
        dealSource="sourceco"
        hideFromAllDeals
      />
    </div>
  );
}
