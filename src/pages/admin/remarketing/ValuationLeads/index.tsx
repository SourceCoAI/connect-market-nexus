import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FilterBar, TimeframeSelector, VALUATION_LEAD_FIELDS } from '@/components/filters';
import {
  EnrichmentProgressIndicator,
  DealEnrichmentSummaryDialog,
  DealBulkActionBar,
} from '@/components/remarketing';
import { PushToDialerModal } from '@/components/remarketing/PushToDialerModal';
import { PushToSmartleadModal } from '@/components/remarketing/PushToSmartleadModal';
import {
  Loader2,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Calculator,
  Users,
  Clock,
  Sparkles,
  CheckCircle2,
  EyeOff,
  ThumbsDown,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useValuationLeadsData } from './useValuationLeadsData';
import { ValuationLeadsTable } from './ValuationLeadsTable';
import { ValuationLeadUploadDialog } from './ValuationLeadUploadDialog';
import { exportLeadsToCSV } from './helpers';
import { useAIUIActionHandler } from '@/hooks/useAIUIActionHandler';
import { useAICommandCenterContext } from '@/components/ai-command-center/AICommandCenterProvider';
import { ValuationLeadDetailDrawer } from './ValuationLeadDetailDrawer';
import type { Operator, FilterRule } from '@/components/filters';
import type { SortColumn } from './types';
import type { ValuationLead } from './types';

// Re-export formatAge for any external importers
export { formatAge } from './helpers';

export default function ValuationLeads() {
  const { setPageContext } = useAICommandCenterContext();
  const [dialerOpen, setDialerOpen] = useState(false);
  const [smartleadOpen, setSmartleadOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [detailLead, setDetailLead] = useState<ValuationLead | null>(null);
  const {
    leads,
    isLoading,
    refetch,
    filteredLeads,
    paginatedLeads,
    adminProfiles,
    calculatorTypes,
    kpiStats,
    filterState,
    setFilterState,
    dynamicOptions,
    filteredCount,
    engineTotal,
    sortColumn,
    sortDirection,
    handleSort,
    activeTab,
    setActiveTab,
    timeframe,
    setTimeframe,
    currentPage: _currentPage,
    setCurrentPage,
    totalPages,
    safePage,
    PAGE_SIZE,
    selectedIds,
    setSelectedIds,
    allSelected,
    toggleSelectAll,
    toggleSelect,
    hidePushed,
    setHidePushed,
    hideNotFit,
    setHideNotFit,
    handleRowClick,
    handlePushToAllDeals,
    handlePushAndEnrich,
    handleReEnrich,
    handleArchive,
    handleMarkNotFit,
    handleBulkEnrich,
    handleRetryFailedEnrichment,
    handleScoreLeads,
    handleAssignOwner,
    isPushing,
    isPushEnriching,
    isReEnriching,
    isScoring,
    isEnriching,
    isMarkingNotFit,
    enrichmentProgress,
    enrichmentSummary,
    showEnrichmentSummary,
    dismissSummary,
    pauseEnrichment,
    resumeEnrichment,
    cancelEnrichment,
  } = useValuationLeadsData();

  useEffect(() => {
    setPageContext({ page: 'valuation_leads', entity_type: 'leads' });
  }, [setPageContext]);

  useAIUIActionHandler({
    table: 'leads',
    onSelectRows: (rowIds, mode) => {
      if (mode === 'replace') setSelectedIds(new Set(rowIds));
      else if (mode === 'add')
        setSelectedIds((prev) => {
          const n = new Set(prev);
          rowIds.forEach((id) => n.add(id));
          return n;
        });
      else
        setSelectedIds((prev) => {
          const n = new Set(prev);
          rowIds.forEach((id) => (n.has(id) ? n.delete(id) : n.add(id)));
          return n;
        });
    },
    onClearSelection: () => setSelectedIds(new Set()),
    onApplyFilter: (filters, clearExisting) => {
      const rules = filters.map((f, idx) => ({
        id: `ai-filter-${idx}`,
        field: f.field,
        operator: f.operator as Operator,
        value: f.value,
      }));
      if (clearExisting)
        setFilterState({ rules: rules as FilterRule[], conjunction: 'and', search: '' });
      else
        setFilterState((prev) => ({ ...prev, rules: [...prev.rules, ...rules] as FilterRule[] }));
    },
    onSortColumn: (field) => {
      const fieldMap: Record<string, string> = {
        company_name: 'company_name',
        score: 'lead_score',
        revenue: 'revenue',
        created_at: 'created_at',
        calculator_type: 'calculator_type',
      };
      handleSort((fieldMap[field] || field) as SortColumn);
    },
    onTriggerAction: (action) => {
      if (action === 'push_to_dialer') setDialerOpen(true);
      if (action === 'push_to_smartlead') setSmartleadOpen(true);
    },
  });

  const totalLeads = leads?.length || 0;
  const unscoredCount = leads?.filter((l) => l.lead_score == null).length || 0;
  const pushedTotal = leads?.filter((l) => l.pushed_to_all_deals).length || 0;

  if (isLoading) {
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
          <h1 className="text-2xl font-bold text-foreground">Valuation Calculator Leads</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalLeads} total &middot; {unscoredCount} unscored &middot; {pushedTotal} in Active
            Deals
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="h-4 w-4 mr-1" />
            Upload
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={isEnriching}>
                {isEnriching ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1" />
                )}
                Enrich
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleBulkEnrich('unenriched')}>
                Enrich Unenriched
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleBulkEnrich('all')}>
                Re-enrich All
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={isScoring}>
                {isScoring ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <BarChart3 className="h-4 w-4 mr-1" />
                )}
                Score
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleScoreLeads('unscored')}>
                Score Unscored
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleScoreLeads('all')}>
                Recalculate All
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <TimeframeSelector value={timeframe} onChange={setTimeframe} compact />
        </div>
      </div>

      {/* Calculator Type Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        <button
          onClick={() => setActiveTab('all')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'all'
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          All Types
        </button>
        {calculatorTypes.map((type) => (
          <button
            key={type}
            onClick={() => setActiveTab(type)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === type
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {type === 'general'
              ? 'General'
              : type === 'auto_shop'
                ? 'Auto Shop'
                : type.replace(/_/g, ' ')}
            <span className="ml-1.5 text-xs text-muted-foreground">
              ({(leads || []).filter((l) => l.calculator_type === type).length})
            </span>
          </button>
        ))}
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <Calculator className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Leads</p>
                <p className="text-2xl font-bold">{kpiStats.totalLeads}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Open to Intros</p>
                <p className="text-2xl font-bold text-blue-600">{kpiStats.openToIntros}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <Clock className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Exit Now</p>
                <p className="text-2xl font-bold text-red-600">{kpiStats.exitNow}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Added to Active Deals</p>
                <p className="text-2xl font-bold text-green-600">{kpiStats.pushedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter Bar */}
      <FilterBar
        filterState={filterState}
        onFilterStateChange={setFilterState}
        fieldDefinitions={VALUATION_LEAD_FIELDS}
        dynamicOptions={dynamicOptions}
        totalCount={engineTotal}
        filteredCount={filteredCount}
      />

      {/* Hide Pushed / Hide Not Fit Toggles */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setHidePushed(!hidePushed)}
          className={cn(
            'flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border transition-colors',
            hidePushed
              ? 'bg-primary/10 border-primary/30 text-primary font-medium'
              : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50',
          )}
        >
          <EyeOff className="h-3.5 w-3.5" />
          {hidePushed ? 'Showing Un-Pushed Only' : 'Hide Pushed'}
        </button>
        <button
          onClick={() => setHideNotFit(!hideNotFit)}
          className={cn(
            'flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border transition-colors',
            hideNotFit
              ? 'bg-orange-100 border-orange-300 text-orange-700 font-medium'
              : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50',
          )}
        >
          <ThumbsDown className="h-3.5 w-3.5" />
          {hideNotFit ? 'Not Fit Hidden' : 'Show Not Fit'}
        </button>
      </div>

      {/* Enrichment Progress */}
      {(enrichmentProgress.isEnriching || enrichmentProgress.isPaused) && (
        <EnrichmentProgressIndicator
          completedCount={enrichmentProgress.completedCount}
          totalCount={enrichmentProgress.totalCount}
          progress={enrichmentProgress.progress}
          estimatedTimeRemaining={enrichmentProgress.estimatedTimeRemaining}
          processingRate={enrichmentProgress.processingRate}
          successfulCount={enrichmentProgress.successfulCount}
          failedCount={enrichmentProgress.failedCount}
          isPaused={enrichmentProgress.isPaused}
          onPause={pauseEnrichment}
          onResume={resumeEnrichment}
          onCancel={cancelEnrichment}
        />
      )}

      <DealEnrichmentSummaryDialog
        open={showEnrichmentSummary}
        onOpenChange={(open) => !open && dismissSummary()}
        summary={enrichmentSummary}
        onRetryFailed={handleRetryFailedEnrichment}
      />

      {/* Bulk Actions */}
      <DealBulkActionBar
        selectedIds={selectedIds}
        deals={filteredLeads as Array<{ id: string; is_priority_target?: boolean | null }>}
        onClearSelection={() => setSelectedIds(new Set())}
        onRefetch={refetch}
        onApproveToActiveDeals={(ids) => handlePushToAllDeals(ids)}
        isPushing={isPushing}
        onPushAndEnrich={(ids) => handlePushAndEnrich(ids)}
        isPushAndEnriching={isPushEnriching}
        onReEnrichPushed={(ids) => handleReEnrich(ids)}
        isReEnrichingPushed={isReEnriching}
        onExportCSV={() => {
          const selected = filteredLeads.filter((l) => selectedIds.has(l.id));
          exportLeadsToCSV(selected);
        }}
        showPriorityToggle={false}
        onMarkNotFit={() => handleMarkNotFit(Array.from(selectedIds))}
        isMarkingNotFit={isMarkingNotFit}
        onArchive={() => handleArchive(Array.from(selectedIds))}
        onPushToDialer={() => setDialerOpen(true)}
        onPushToSmartlead={() => setSmartleadOpen(true)}
      />
      <PushToDialerModal
        open={dialerOpen}
        onOpenChange={setDialerOpen}
        contactIds={Array.from(selectedIds)}
        contactCount={selectedIds.size}
        entityType="listings"
      />
      <PushToSmartleadModal
        open={smartleadOpen}
        onOpenChange={setSmartleadOpen}
        contactIds={Array.from(selectedIds)}
        contactCount={selectedIds.size}
        entityType="listings"
      />

      {/* Upload Dialog */}
      <ValuationLeadUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />

      {/* Leads Table */}
      <ValuationLeadsTable
        paginatedLeads={paginatedLeads}
        activeTab={activeTab}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        handleSort={handleSort}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        allSelected={allSelected}
        toggleSelectAll={toggleSelectAll}
        toggleSelect={toggleSelect}
        handleRowClick={handleRowClick}
        handlePushToAllDeals={handlePushToAllDeals}
        handleReEnrich={handleReEnrich}
        handlePushAndEnrich={handlePushAndEnrich}
        handleMarkNotFit={handleMarkNotFit}
        handleAssignOwner={handleAssignOwner}
        adminProfiles={adminProfiles}
        safePage={safePage}
        PAGE_SIZE={PAGE_SIZE}
        refetch={refetch}
      />

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Showing {filteredLeads.length > 0 ? (safePage - 1) * PAGE_SIZE + 1 : 0}
          {'\u2013'}
          {Math.min(safePage * PAGE_SIZE, filteredLeads.length)} of {filteredLeads.length} leads
          {filteredLeads.length !== totalLeads && ` (filtered from ${totalLeads})`}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCurrentPage(1)}
            disabled={safePage <= 1}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm px-3 tabular-nums flex items-center gap-1">
            Page
            <input
              type="number"
              min={1}
              max={totalPages}
              value={safePage}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= 1 && val <= totalPages) setCurrentPage(val);
              }}
              className="w-12 h-7 text-center text-sm border border-input rounded-md bg-background tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            of {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setCurrentPage(totalPages)}
            disabled={safePage >= totalPages}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
