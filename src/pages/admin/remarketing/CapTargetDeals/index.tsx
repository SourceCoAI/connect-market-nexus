import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FilterBar, TimeframeSelector, CAPTARGET_FIELDS } from '@/components/filters';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Building2,
  ArrowUpDown,
  Sparkles,
  Loader2,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ThumbsDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { EnrichmentProgressIndicator } from '@/components/remarketing/EnrichmentProgressIndicator';
import { useAIUIActionHandler } from '@/hooks/useAIUIActionHandler';
import type { Operator, FilterRule } from '@/components/filters';
import type { SortColumn } from './types';

// Sub-components
import { DealsKPICards } from '../components/DealsKPICards';
import { CapTargetSyncBar } from '../components/CapTargetSyncBar';
import { CapTargetExclusionLog } from '../components/CapTargetExclusionLog';
import { CapTargetTableRow } from '../components/CapTargetTableRow';
import {
  DealBulkActionBar,
  AddDealsToListDialog,
  PushToHeyreachModal,
} from '@/components/remarketing';
import { PushToDialerModal } from '@/components/remarketing/PushToDialerModal';
import { PushToSmartleadModal } from '@/components/remarketing/PushToSmartleadModal';
import { ArchiveDealDialog } from '@/components/admin/deals/ArchiveDealDialog';
import { PushToPortalDialog } from '@/components/portal/PushToPortalDialog';

// Local hooks & types
import { useCapTargetData } from './useCapTargetData';
import { useCapTargetActions } from './useCapTargetActions';
import { PAGE_SIZE } from './types';

export default function CapTargetDeals() {
  // ─── Data hook ──────────────────────────────────────────────────────
  const data = useCapTargetData();

  // ─── Actions hook ───────────────────────────────────────────────────
  const actions = useCapTargetActions(
    data.deals,
    data.filteredDeals,
    data.selectedIds,
    data.setSelectedIds,
    data.refetch,
  );

  // ─── Wire AI UI actions ─────────────────────────────────────────────
  useAIUIActionHandler({
    table: 'leads',
    onSelectRows: (rowIds, mode) => {
      if (mode === 'replace') data.setSelectedIds(new Set(rowIds));
      else if (mode === 'add')
        data.setSelectedIds((prev) => {
          const n = new Set(prev);
          rowIds.forEach((id) => n.add(id));
          return n;
        });
      else
        data.setSelectedIds((prev) => {
          const n = new Set(prev);
          rowIds.forEach((id) => (n.has(id) ? n.delete(id) : n.add(id)));
          return n;
        });
    },
    onClearSelection: () => data.setSelectedIds(new Set()),
    onApplyFilter: (filters, clearExisting) => {
      const rules = filters.map((f, idx) => ({
        id: `ai-filter-${idx}`,
        field: f.field,
        operator: f.operator as Operator,
        value: f.value,
      }));
      if (clearExisting)
        data.setFilterState({ rules: rules as FilterRule[], conjunction: 'and', search: '' });
      else
        data.setFilterState((prev) => ({
          ...prev,
          rules: [...prev.rules, ...rules] as FilterRule[],
        }));
    },
    onSortColumn: (field) => {
      const fieldMap: Record<string, string> = {
        company_name: 'company_name',
        contact_name: 'contact_name',
        score: 'score',
        contact_date: 'contact_date',
        interest_type: 'interest_type',
        priority: 'priority',
      };
      data.handleSort((fieldMap[field] || field) as SortColumn);
    },
    onTriggerAction: (action) => {
      if (action === 'push_to_dialer') actions.setDialerOpen(true);
      if (action === 'push_to_smartlead') actions.setSmartleadOpen(true);
    },
  });

  // ─── SortHeader sub-component ───────────────────────────────────────
  const SortHeader = ({ column, children }: { column: SortColumn; children: React.ReactNode }) => (
    <button
      className="flex items-center gap-1 hover:text-foreground transition-colors"
      onClick={() => data.handleSort(column)}
    >
      {children}
      <ArrowUpDown
        className={cn(
          'h-3 w-3',
          data.sortColumn === column ? 'text-foreground' : 'text-muted-foreground/50',
        )}
      />
    </button>
  );

  // ─── Loading skeleton ───────────────────────────────────────────────
  if (data.isLoading) {
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
          <h1 className="text-2xl font-bold text-foreground">CapTarget Opportunities</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data.totalDeals} total &middot; {data.unpushedCount} un-pushed &middot;{' '}
            {data.interestCount} interest &middot; {data.enrichedCount} enriched &middot;{' '}
            {data.scoredCount} scored
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CapTargetSyncBar
            isSyncing={actions.isSyncing}
            syncProgress={actions.syncProgress}
            syncSummaryOpen={actions.syncSummaryOpen}
            setSyncSummaryOpen={actions.setSyncSummaryOpen}
            syncSummary={actions.syncSummary}
            onSync={actions.handleSync}
            onCancelSync={() => actions.syncAbortRef.current?.abort()}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={actions.isEnriching}>
                {actions.isEnriching ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1" />
                )}
                Enrich
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => actions.handleBulkEnrich('unenriched')}>
                Enrich Unenriched
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => actions.handleBulkEnrich('all')}>
                Re-enrich All
              </DropdownMenuItem>
              <DropdownMenuItem onClick={actions.handleExternalOnlyEnrich}>
                LinkedIn + Google Only
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={actions.isScoring}>
                {actions.isScoring ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <BarChart3 className="h-4 w-4 mr-1" />
                )}
                Score
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => actions.handleBulkScore('unscored')}>
                Score Unscored
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => actions.handleBulkScore('all')}>
                Recalculate All
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <TimeframeSelector value={data.timeframe} onChange={data.setTimeframe} compact />
        </div>
      </div>

      {/* KPI Stats Cards */}
      <DealsKPICards
        totalDeals={data.kpiStats.totalDeals}
        priorityDeals={data.kpiStats.priorityDeals}
        avgScore={data.kpiStats.avgScore}
        needsScoring={data.kpiStats.needsScoring}
        activeFilter={data.kpiFilter}
        onCardClick={data.setKpiFilter}
      />

      {/* Enrichment Progress Bar */}
      {(data.enrichmentProgress.isEnriching || data.enrichmentProgress.isPaused) && (
        <EnrichmentProgressIndicator
          completedCount={data.enrichmentProgress.completedCount}
          totalCount={data.enrichmentProgress.totalCount}
          progress={data.enrichmentProgress.progress}
          estimatedTimeRemaining={data.enrichmentProgress.estimatedTimeRemaining}
          processingRate={data.enrichmentProgress.processingRate}
          itemLabel="deals"
          successfulCount={data.enrichmentProgress.successfulCount}
          failedCount={data.enrichmentProgress.failedCount}
          isPaused={data.enrichmentProgress.isPaused}
          onCancel={data.cancelEnrichment}
        />
      )}

      {/* Exclusion Log */}
      <CapTargetExclusionLog
        exclusionLog={
          (data.exclusionLog || []) as {
            id: string;
            company_name?: string;
            exclusion_reason: string;
            source?: string;
            excluded_at?: string;
          }[]
        }
        showExclusionLog={actions.showExclusionLog}
        setShowExclusionLog={actions.setShowExclusionLog}
        isCleaningUp={actions.isCleaningUp}
        showCleanupDialog={actions.showCleanupDialog}
        setShowCleanupDialog={actions.setShowCleanupDialog}
        onCleanup={actions.handleCleanup}
        cleanupResultOpen={actions.cleanupResultOpen}
        setCleanupResultOpen={actions.setCleanupResultOpen}
        cleanupResult={actions.cleanupResult}
      />

      {/* Filters */}
      <FilterBar
        filterState={data.filterState}
        onFilterStateChange={data.setFilterState}
        fieldDefinitions={CAPTARGET_FIELDS}
        dynamicOptions={data.dynamicOptions}
        totalCount={data.engineTotal}
        filteredCount={data.filteredCount}
      />

      {/* Hide Pushed / Hide Not Fit Toggles */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => data.setHidePushed(!data.hidePushed)}
          className={cn(
            'flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border transition-colors',
            data.hidePushed
              ? 'bg-primary/10 border-primary/30 text-primary font-medium'
              : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50',
          )}
        >
          <span className="text-xs">🙈</span>
          {data.hidePushed ? 'Showing Un-Pushed Only' : 'Hide Pushed'}
        </button>
        <button
          onClick={() => data.setHideNotFit(!data.hideNotFit)}
          className={cn(
            'flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border transition-colors',
            data.hideNotFit
              ? 'bg-orange-100 border-orange-300 text-orange-700 font-medium'
              : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/50',
          )}
        >
          <ThumbsDown className="h-3.5 w-3.5" />
          {data.hideNotFit ? 'Not Fit Hidden' : 'Show Not Fit'}
        </button>
      </div>

      {/* Bulk Actions */}
      <DealBulkActionBar
        selectedIds={data.selectedIds}
        deals={data.deals || []}
        onClearSelection={() => data.setSelectedIds(new Set())}
        onRefetch={data.refetch}
        onApproveToActiveDeals={actions.handlePushToAllDeals}
        isPushing={actions.isPushing}
        onEnrichSelected={actions.handleEnrichSelected}
        enrichDropdown
        isEnriching={actions.isEnriching}
        onPushToDialer={() => actions.setDialerOpen(true)}
        onPushToSmartlead={() => actions.setSmartleadOpen(true)}
        onPushToHeyreach={() => actions.setHeyreachOpen(true)}
        onPushToPortal={() => actions.setPortalOpen(true)}
        onAddToList={() => actions.setAddToListOpen(true)}
        onMarkNotFit={actions.handleMarkNotFit}
        isMarkingNotFit={actions.isMarkingNotFit}
        onArchive={actions.handleBulkArchive}
        isArchiving={actions.isArchiving}
        onDelete={actions.handleBulkDelete}
        isDeleting={actions.isDeleting}
      />
      <PushToDialerModal
        open={actions.dialerOpen}
        onOpenChange={actions.setDialerOpen}
        contactIds={Array.from(data.selectedIds)}
        contactCount={data.selectedIds.size}
        entityType="listings"
      />
      <PushToSmartleadModal
        open={actions.smartleadOpen}
        onOpenChange={actions.setSmartleadOpen}
        contactIds={Array.from(data.selectedIds)}
        contactCount={data.selectedIds.size}
        entityType="listings"
      />
      <PushToHeyreachModal
        open={actions.heyreachOpen}
        onOpenChange={actions.setHeyreachOpen}
        contactIds={Array.from(data.selectedIds)}
        contactCount={data.selectedIds.size}
        entityType="listings"
      />
      <AddDealsToListDialog
        open={actions.addToListOpen}
        onOpenChange={actions.setAddToListOpen}
        selectedDeals={data.selectedDealsForList}
        entityType="captarget_deal"
      />
      <PushToPortalDialog
        open={actions.portalOpen}
        onOpenChange={actions.setPortalOpen}
        listingIds={Array.from(data.selectedIds)}
      />
      <ArchiveDealDialog
        open={!!actions.archiveTarget}
        onOpenChange={(open) => {
          if (!open) actions.setArchiveTarget(null);
        }}
        deal={
          actions.archiveTarget
            ? { id: actions.archiveTarget.id, name: actions.archiveTarget.name }
            : null
        }
        onConfirmArchive={actions.confirmArchiveDeal}
      />

      {/* Active / Inactive Tabs */}
      <Tabs
        value={data.statusTab}
        onValueChange={(val) => {
          data.setStatusTab(val as 'all' | 'active' | 'inactive');
          data.setSelectedIds(new Set());
        }}
      >
        <TabsList>
          <TabsTrigger value="all">All ({data.filteredTotal})</TabsTrigger>
          <TabsTrigger value="active">Active ({data.activeCount})</TabsTrigger>
          <TabsTrigger value="inactive">Inactive ({data.inactiveCount})</TabsTrigger>
        </TabsList>
        <TabsContent value={data.statusTab} forceMount>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table style={{ tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
                  <TableHeader>
                    <TableRow>
                      {[
                        {
                          key: 'checkbox',
                          content: (
                            <Checkbox
                              checked={data.allSelected}
                              onCheckedChange={data.toggleSelectAll}
                            />
                          ),
                          noResize: true,
                        },
                        { key: 'number', content: '#', noResize: true },
                        {
                          key: 'company',
                          content: <SortHeader column="company_name">Company</SortHeader>,
                        },
                        { key: 'description', content: 'Executive Summary' },
                        {
                          key: 'industry',
                          content: <SortHeader column="client_name">Industry</SortHeader>,
                        },
                        {
                          key: 'contact',
                          content: <SortHeader column="contact_name">Contact</SortHeader>,
                        },
                        {
                          key: 'interest',
                          content: <SortHeader column="interest_type">Interest</SortHeader>,
                        },
                        {
                          key: 'channel',
                          content: <SortHeader column="outreach_channel">Channel</SortHeader>,
                        },
                        {
                          key: 'liCount',
                          content: (
                            <SortHeader column="linkedin_employee_count">LI Count</SortHeader>
                          ),
                        },
                        {
                          key: 'liRange',
                          content: (
                            <SortHeader column="linkedin_employee_range">LI Range</SortHeader>
                          ),
                        },
                        {
                          key: 'reviews',
                          content: <SortHeader column="google_review_count">Reviews</SortHeader>,
                        },
                        {
                          key: 'rating',
                          content: <SortHeader column="google_rating">Rating</SortHeader>,
                        },
                        { key: 'sourceTab', content: 'Source Tab' },
                        { key: 'score', content: <SortHeader column="score">Score</SortHeader> },
                        {
                          key: 'date',
                          content: <SortHeader column="contact_date">Date</SortHeader>,
                        },
                        {
                          key: 'status',
                          content: <SortHeader column="pushed">Status</SortHeader>,
                        },
                        {
                          key: 'priority',
                          content: <SortHeader column="priority">Priority</SortHeader>,
                        },
                        { key: 'actions', content: '', noResize: true },
                      ].map(({ key, content, noResize }) => (
                        <TableHead
                          key={key}
                          style={{
                            width: data.columnWidths[key],
                            minWidth: 40,
                            maxWidth: data.columnWidths[key],
                            position: 'relative',
                          }}
                          className="overflow-hidden text-ellipsis whitespace-nowrap"
                        >
                          {content}
                          {!noResize && (
                            <div
                              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 z-10"
                              onMouseDown={(e) => data.handleResizeStart(key, e)}
                            />
                          )}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.paginatedDeals.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={17} className="text-center py-12 text-muted-foreground">
                          <Building2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                          <p className="font-medium">No CapTarget deals found</p>
                          <p className="text-sm mt-1">
                            Deals will appear here after the sync runs.
                          </p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.paginatedDeals.map((deal, index) => (
                        <CapTargetTableRow
                          key={deal.id}
                          deal={deal}
                          index={index}
                          pageOffset={(data.safePage - 1) * PAGE_SIZE}
                          isSelected={data.selectedIds.has(deal.id)}
                          onToggleSelect={data.toggleSelect}
                          onPushToAllDeals={actions.handlePushToAllDeals}
                          onEnrichSelected={actions.handleEnrichSelected}
                          onDeleteDeal={actions.handleDeleteDeal}
                          onArchiveDeal={actions.handleArchiveDeal}
                          onRefetch={data.refetch}
                        />
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Showing {(data.safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(data.safePage * PAGE_SIZE, data.totalFilteredCount)} of{' '}
              {data.totalFilteredCount} deals
              {data.totalFilteredCount !== data.totalDeals &&
                ` (filtered from ${data.totalDeals})`}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => data.setCurrentPage(1)}
                disabled={data.safePage <= 1}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => data.setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={data.safePage <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm px-3 tabular-nums flex items-center gap-1">
                Page
                <input
                  type="number"
                  min={1}
                  max={data.totalPages}
                  value={data.safePage}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val >= 1 && val <= data.totalPages) data.setCurrentPage(val);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = parseInt((e.target as HTMLInputElement).value, 10);
                      if (!isNaN(val) && val >= 1 && val <= data.totalPages)
                        data.setCurrentPage(val);
                    }
                  }}
                  className="w-12 h-7 text-center text-sm border border-input rounded-md bg-background tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                of {data.totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => data.setCurrentPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={data.safePage >= data.totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => data.setCurrentPage(data.totalPages)}
                disabled={data.safePage >= data.totalPages}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
