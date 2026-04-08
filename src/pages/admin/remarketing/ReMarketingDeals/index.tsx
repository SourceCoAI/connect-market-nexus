import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TableBody, TableCell, TableRow } from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Building2,
  Upload,
  ChevronDown,
  ChevronUp,
  Calculator,
  ArrowUpDown,
  Zap,
  Plus,
  Network,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  EnrichmentProgressIndicator,
  DealBulkActionBar,
  AddDealsToListDialog,
  PushToHeyreachModal,
  NotAFitReasonDialog,
} from '@/components/remarketing';
import type { DealForList } from '@/components/remarketing';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ArchiveDealDialog } from '@/components/admin/deals/ArchiveDealDialog';
import { PushToDialerModal } from '@/components/remarketing/PushToDialerModal';
import { PushToSmartleadModal } from '@/components/remarketing/PushToSmartleadModal';
import { PushToPortalDialog } from '@/components/portal/PushToPortalDialog';
import { DndContext, closestCorners, MeasuringStrategy } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { cn } from '@/lib/utils';
import { FilterBar, DEAL_LISTING_FIELDS } from '@/components/filters';
import { useAIUIActionHandler } from '@/hooks/useAIUIActionHandler';
import { useAICommandCenterContext } from '@/components/ai-command-center';

import { ResizableHeader } from '../components/ResizableHeader';
import { DealTableRow } from '../components/DealTableRow';
import { DealsKPICards } from '../components/DealsKPICards';
import { DealsActionDialogs } from '../components/DealsActionDialogs';

import type { Operator, FilterRule } from '@/components/filters/filter-definitions/types';
import { useReMarketingDeals } from './useReMarketingDeals';
import {
  formatCurrency,
  formatWebsiteDomain,
  getEffectiveWebsite,
  formatGeographyBadges,
  getScoreTrendIcon,
} from './helpers';

const ReMarketingDeals = () => {
  const h = useReMarketingDeals();
  const { setPageContext } = useAICommandCenterContext();
  const [dialerOpen, setDialerOpen] = useState(false);
  const [smartleadOpen, setSmartleadOpen] = useState(false);
  const [heyreachOpen, setHeyreachOpen] = useState(false);
  const [addToListOpen, setAddToListOpen] = useState(false);
  const [notAFitTarget, setNotAFitTarget] = useState<{ id: string; name: string } | null>(null);
  const [portalOpen, setPortalOpen] = useState(false);

  const selectedDealsForList = useMemo((): DealForList[] => {
    if (!h.localOrder || h.selectedDeals.size === 0) return [];
    return h.localOrder
      .filter((d) => h.selectedDeals.has(d.id))
      .map((d) => ({
        dealId: d.id,
        dealName: d.internal_company_name || d.title || 'Unknown Deal',
        contactName: d.main_contact_name,
        contactEmail: d.main_contact_email,
        contactPhone: d.main_contact_phone,
      }));
  }, [h.localOrder, h.selectedDeals]);

  // Register page context for AI Command Center
  React.useEffect(() => {
    setPageContext({ page: 'remarketing_deals', entity_type: 'deals' });
  }, [setPageContext]);

  // Wire AI UI actions to this page's state
  useAIUIActionHandler({
    table: 'deals',
    onSelectRows: (rowIds, mode) => {
      if (mode === 'replace') {
        h.setSelectedDeals(new Set(rowIds));
      } else if (mode === 'add') {
        h.setSelectedDeals((prev) => {
          const next = new Set(prev);
          rowIds.forEach((id) => next.add(id));
          return next;
        });
      } else {
        h.setSelectedDeals((prev) => {
          const next = new Set(prev);
          rowIds.forEach((id) => (next.has(id) ? next.delete(id) : next.add(id)));
          return next;
        });
      }
    },
    onClearSelection: () => h.handleClearSelection(),
    onApplyFilter: (filters, clearExisting) => {
      const rules = filters.map((f, idx) => ({
        id: `ai-filter-${idx}`,
        field: f.field,
        operator: f.operator as Operator,
        value: f.value,
      }));
      if (clearExisting) {
        h.setFilterState({ rules: rules as FilterRule[], conjunction: 'and', search: '' });
      } else {
        h.setFilterState((prev) => ({
          ...prev,
          rules: [...prev.rules, ...rules] as FilterRule[],
        }));
      }
    },
    onSortColumn: (field) => {
      const fieldMap: Record<string, string> = {
        revenue: 'revenue',
        ebitda: 'ebitda',
        deal_name: 'deal_name',
        title: 'deal_name',
        score: 'score',
        deal_total_score: 'score',
        added: 'added',
        created_at: 'added',
        address_state: 'location',
        industry: 'industry',
        category: 'industry',
        priority: 'priority',
        rank: 'rank',
        google_rating: 'googleRating',
        googleRating: 'googleRating',
        google_review_count: 'googleReviews',
        googleReviews: 'googleReviews',
        linkedin_employee_count: 'linkedinCount',
        linkedinCount: 'linkedinCount',
        engagement: 'engagement',
      };
      h.handleSort(fieldMap[field] || field);
    },
    onTriggerAction: (action) => {
      if (action === 'push_to_dialer') setDialerOpen(true);
      if (action === 'push_to_smartlead') setSmartleadOpen(true);
      if (action === 'push_to_heyreach') setHeyreachOpen(true);
    },
  });

  const SortableHeader = ({
    column,
    label,
    className = '',
  }: {
    column: string;
    label: string;
    className?: string;
  }) => (
    <button
      onClick={() => h.handleSort(column)}
      className={cn('flex items-center gap-1 hover:text-foreground transition-colors', className)}
    >
      {label}
      {h.sortColumn === column ? (
        h.sortDirection === 'desc' ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronUp className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Active Deals</h1>
          <p className="text-muted-foreground">
            {h.listings?.length || 0} deals across {h.universeCount} buyer universes
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => h.setShowAddDealDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Deal
          </Button>
          <Button variant="outline" onClick={() => h.setShowImportDialog(true)}>
            <Upload className="h-4 w-4 mr-2" />
            Import Spreadsheet
          </Button>
          <Button
            onClick={() => h.setShowEnrichDialog(true)}
            disabled={h.isEnrichingAll}
            variant="outline"
            className="border-primary text-primary hover:bg-primary/10"
          >
            <Zap className="h-4 w-4 mr-2" />
            {h.isEnrichingAll ? 'Queueing...' : 'Enrich Deals'}
          </Button>
          <Button
            onClick={() => h.setShowCalculateDialog(true)}
            disabled={h.isCalculating}
            className="bg-slate-800 hover:bg-slate-700 text-white"
          >
            <Calculator className="h-4 w-4 mr-2" />
            {h.isCalculating ? 'Scoring...' : 'Score Deals'}
          </Button>
          <Popover open={h.showCustomDatePicker} onOpenChange={h.setShowCustomDatePicker}>
            <PopoverTrigger asChild>
              <div>
                <Select
                  value={h.dateFilter}
                  onValueChange={(val) => {
                    h.setDateFilter(val);
                    if (val === 'custom') h.setShowCustomDatePicker(true);
                  }}
                >
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="All Time">
                      {h.dateFilter === 'custom' && h.customDateFrom
                        ? `${format(h.customDateFrom, 'MM/dd')}${h.customDateTo ? ` - ${format(h.customDateTo, 'MM/dd')}` : ' \u2192'}`
                        : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="7d">Last 7 Days</SelectItem>
                    <SelectItem value="30d">Last 30 Days</SelectItem>
                    <SelectItem value="90d">Last 90 Days</SelectItem>
                    <SelectItem value="custom">Custom Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </PopoverTrigger>
            {h.dateFilter === 'custom' && (
              <PopoverContent className="w-auto p-4" align="end">
                <div className="space-y-3">
                  <p className="text-sm font-medium">Select Date Range</p>
                  <div className="flex gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">From</label>
                      <Input
                        type="date"
                        value={h.customDateFrom ? format(h.customDateFrom, 'yyyy-MM-dd') : ''}
                        onChange={(e) =>
                          h.setCustomDateFrom(
                            e.target.value ? new Date(e.target.value + 'T00:00:00') : undefined,
                          )
                        }
                        className="w-[140px]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">To</label>
                      <Input
                        type="date"
                        value={h.customDateTo ? format(h.customDateTo, 'yyyy-MM-dd') : ''}
                        onChange={(e) =>
                          h.setCustomDateTo(
                            e.target.value ? new Date(e.target.value + 'T00:00:00') : undefined,
                          )
                        }
                        className="w-[140px]"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        h.setCustomDateFrom(undefined);
                        h.setCustomDateTo(undefined);
                        h.setDateFilter('all');
                        h.setShowCustomDatePicker(false);
                      }}
                    >
                      Clear
                    </Button>
                    <Button size="sm" onClick={() => h.setShowCustomDatePicker(false)}>
                      Apply
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            )}
          </Popover>
        </div>
      </div>

      <DealsKPICards
        totalDeals={h.kpiStats.totalDeals}
        priorityDeals={h.kpiStats.priorityDeals}
        avgScore={h.kpiStats.avgScore}
        needsScoring={h.kpiStats.needsScoring}
      />

      {/* Deal Tab Filters */}
      <div className="flex items-center gap-1 border-b pb-1">
        {[
          { key: 'all', label: 'All' },
          { key: 'my_deals', label: 'My Deals' },
          { key: 'marketplace', label: 'Marketplace' },
          { key: 'marketplace_queue', label: 'Marketplace Queue' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => h.setDealTab(tab.key)}
            className={cn(
              'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
              h.dealTab === tab.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {(h.enrichmentProgress.isEnriching || h.enrichmentProgress.isPaused) && (
        <EnrichmentProgressIndicator
          completedCount={h.enrichmentProgress.completedCount}
          totalCount={h.enrichmentProgress.totalCount}
          progress={h.enrichmentProgress.progress}
          estimatedTimeRemaining={h.enrichmentProgress.estimatedTimeRemaining}
          processingRate={h.enrichmentProgress.processingRate}
          successfulCount={h.enrichmentProgress.successfulCount}
          failedCount={h.enrichmentProgress.failedCount}
          isPaused={h.enrichmentProgress.isPaused}
          onPause={h.pauseEnrichment}
          onResume={h.resumeEnrichment}
          onCancel={h.cancelEnrichment}
        />
      )}

      <FilterBar
        filterState={h.filterState}
        onFilterStateChange={h.setFilterState}
        fieldDefinitions={DEAL_LISTING_FIELDS}
        dynamicOptions={h.dynamicOptions}
        totalCount={h.totalCount}
        filteredCount={h.filteredListings.length}
        timeframe={h.timeframe}
        onTimeframeChange={h.setTimeframe}
        savedViews={h.savedViews}
        onSaveView={(name, filters) => h.addView({ name, filters })}
        onDeleteView={h.removeView}
        onSelectView={(view) => h.setFilterState(view.filters)}
      >
        <Button
          size="sm"
          variant={h.universeBuildFilter ? 'default' : 'outline'}
          className={cn(
            'gap-2 h-8 text-xs',
            h.universeBuildFilter
              ? 'bg-blue-600 hover:bg-blue-700 border-blue-600 text-white'
              : 'border-blue-300 text-blue-700 hover:bg-blue-50',
          )}
          onClick={() => h.setUniverseBuildFilter((prev) => !prev)}
        >
          <Network className="h-3.5 w-3.5" />
          {h.universeBuildFilter ? 'Showing: Needs Universe Build' : 'Filter: Needs Universe Build'}
          {h.universeBuildFilter && (
            <span className="ml-1 bg-white/20 rounded-full px-1.5 py-0 text-[10px] font-bold">
              {h.filteredListings.filter((l) => l.universe_build_flagged).length}
            </span>
          )}
        </Button>
        <div className="flex items-center gap-2 ml-2">
          <Switch
            id="hide-not-a-fit"
            checked={h.hideNotAFit}
            onCheckedChange={h.setHideNotAFit}
          />
          <Label htmlFor="hide-not-a-fit" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
            Hide Not a Fit
          </Label>
        </div>
      </FilterBar>

      <DealBulkActionBar
        selectedIds={h.selectedDeals}
        deals={h.localOrder}
        onClearSelection={h.handleClearSelection}
        onRefetch={h.refetchListings}
        onSendToUniverse={() => h.setShowUniverseDialog(true)}
        onPushToDialer={() => setDialerOpen(true)}
        onPushToSmartlead={() => setSmartleadOpen(true)}
        onPushToHeyreach={() => setHeyreachOpen(true)}
        onPushToPortal={() => setPortalOpen(true)}
        onAddToList={() => setAddToListOpen(true)}
        onMarkNotFit={h.handleBulkMarkNotAFit}
        onArchive={h.handleBulkArchive}
        isArchiving={h.isArchiving}
        onDelete={h.handleBulkDelete}
        isDeleting={h.isDeleting}
        adminProfiles={h.adminProfiles}
        onBulkAssignOwner={h.handleBulkAssignOwner}
      />

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <TooltipProvider>
            <DndContext
              sensors={h.sensors}
              collisionDetection={closestCorners}
              onDragEnd={h.handleDragEnd}
              measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
            >
              <div className="relative w-full overflow-auto">
                <table
                  className="w-full caption-bottom text-sm"
                  style={{ tableLayout: 'fixed', width: '100%' }}
                >
                  <thead>
                    <tr>
                      <th
                        className="h-10 px-3 text-left align-middle font-medium text-muted-foreground border-b"
                        style={{ width: h.columnWidths.select, minWidth: 40 }}
                      >
                        <Checkbox
                          checked={
                            h.localOrder.length > 0 && h.selectedDeals.size === h.localOrder.length
                          }
                          onCheckedChange={h.handleSelectAll}
                        />
                      </th>
                      <ResizableHeader
                        width={h.columnWidths.rank}
                        onResize={(w) => h.handleColumnResize('rank', w)}
                        minWidth={50}
                      >
                        <SortableHeader column="rank" label="#" />
                      </ResizableHeader>
                      <ResizableHeader
                        width={h.columnWidths.dealName}
                        onResize={(w) => h.handleColumnResize('dealName', w)}
                        minWidth={100}
                      >
                        <SortableHeader column="deal_name" label="Deal Name" />
                      </ResizableHeader>
                      <ResizableHeader
                        width={h.columnWidths.referralSource}
                        onResize={(w) => h.handleColumnResize('referralSource', w)}
                        minWidth={60}
                      >
                        <span className="text-muted-foreground font-medium">Marketplace</span>
                      </ResizableHeader>
                      <ResizableHeader
                        width={h.columnWidths.industry}
                        onResize={(w) => h.handleColumnResize('industry', w)}
                        minWidth={60}
                      >
                        <SortableHeader column="industry" label="Industry" />
                      </ResizableHeader>
                      <ResizableHeader
                        width={h.columnWidths.buyerUniverse}
                        onResize={(w) => h.handleColumnResize('buyerUniverse', w)}
                        minWidth={80}
                      >
                        <span className="text-muted-foreground font-medium">Buyer Universe</span>
                      </ResizableHeader>
                      <ResizableHeader
                        width={h.columnWidths.description}
                        onResize={(w) => h.handleColumnResize('description', w)}
                        minWidth={100}
                      >
                        <span className="text-muted-foreground font-medium">Description</span>
                      </ResizableHeader>
                      <ResizableHeader
                        width={h.columnWidths.location}
                        onResize={(w) => h.handleColumnResize('location', w)}
                        minWidth={60}
                      >
                        <span className="text-muted-foreground font-medium">Location</span>
                      </ResizableHeader>
                      <ResizableHeader
                        width={h.columnWidths.revenue}
                        onResize={(w) => h.handleColumnResize('revenue', w)}
                        minWidth={60}
                        className="text-right"
                      >
                        <SortableHeader column="revenue" label="Revenue" className="ml-auto" />
                      </ResizableHeader>
                      <ResizableHeader
                        width={h.columnWidths.ebitda}
                        onResize={(w) => h.handleColumnResize('ebitda', w)}
                        minWidth={60}
                        className="text-right"
                      >
                        <SortableHeader column="ebitda" label="EBITDA" className="ml-auto" />
                      </ResizableHeader>
                      <ResizableHeader
                        width={h.columnWidths.linkedinCount}
                        onResize={(w) => h.handleColumnResize('linkedinCount', w)}
                        minWidth={50}
                        className="text-right"
                      >
                        <SortableHeader
                          column="linkedinCount"
                          label="LI Count"
                          className="ml-auto"
                        />
                      </ResizableHeader>
                      <ResizableHeader
                        width={h.columnWidths.linkedinRange}
                        onResize={(w) => h.handleColumnResize('linkedinRange', w)}
                        minWidth={50}
                        className="text-right"
                      >
                        <SortableHeader
                          column="linkedinRange"
                          label="LI Range"
                          className="ml-auto"
                        />
                      </ResizableHeader>
                      <ResizableHeader
                        width={h.columnWidths.googleReviews}
                        onResize={(w) => h.handleColumnResize('googleReviews', w)}
                        minWidth={50}
                        className="text-right"
                      >
                        <SortableHeader
                          column="googleReviews"
                          label="Reviews"
                          className="ml-auto"
                        />
                      </ResizableHeader>
                      <ResizableHeader
                        width={h.columnWidths.googleRating}
                        onResize={(w) => h.handleColumnResize('googleRating', w)}
                        minWidth={50}
                        className="text-right"
                      >
                        <SortableHeader column="googleRating" label="Rating" className="ml-auto" />
                      </ResizableHeader>
                      <ResizableHeader
                        width={h.columnWidths.quality}
                        onResize={(w) => h.handleColumnResize('quality', w)}
                        minWidth={50}
                        className="text-center"
                      >
                        <SortableHeader column="score" label="Quality" className="mx-auto" />
                      </ResizableHeader>
                      <ResizableHeader
                        width={h.columnWidths.engagement}
                        onResize={(w) => h.handleColumnResize('engagement', w)}
                        minWidth={80}
                        className="text-center"
                      >
                        <SortableHeader
                          column="engagement"
                          label="Engagement"
                          className="mx-auto"
                        />
                      </ResizableHeader>
                      <ResizableHeader
                        width={h.columnWidths.pipeline}
                        onResize={(w) => h.handleColumnResize('pipeline', w)}
                        minWidth={70}
                        className="text-center"
                      >
                        <span className="text-muted-foreground font-medium">Pipeline</span>
                      </ResizableHeader>
                      <ResizableHeader
                        width={h.columnWidths.dealOwner}
                        onResize={(w) => h.handleColumnResize('dealOwner', w)}
                        minWidth={80}
                      >
                        <span className="text-muted-foreground font-medium">Deal Owner</span>
                      </ResizableHeader>
                      <ResizableHeader
                        width={h.columnWidths.added}
                        onResize={(w) => h.handleColumnResize('added', w)}
                        minWidth={60}
                      >
                        <SortableHeader column="added" label="Added" />
                      </ResizableHeader>
                      <ResizableHeader
                        width={h.columnWidths.priority}
                        onResize={(w) => h.handleColumnResize('priority', w)}
                        minWidth={50}
                        className="text-center"
                      >
                        <SortableHeader column="priority" label="Priority" className="mx-auto" />
                      </ResizableHeader>
                      <th
                        className="h-10 px-3 text-left align-middle font-medium text-muted-foreground border-b"
                        style={{ width: h.columnWidths.actions, minWidth: 40 }}
                      ></th>
                    </tr>
                  </thead>
                  <TableBody>
                    {h.listingsLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          {Array.from({ length: 16 }).map((_, j) => (
                            <TableCell key={j}>
                              <Skeleton className="h-4 w-full" />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    ) : h.listingsError ? (
                      <TableRow>
                        <TableCell colSpan={19} className="text-center py-8 text-red-500">
                          <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>Failed to load deals</p>
                          <p className="text-sm text-muted-foreground">
                            {(h.listingsQueryError as { message?: string })?.message ||
                              'The query may have timed out. Try refreshing.'}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-3"
                            onClick={() => h.refetchListings()}
                          >
                            Retry
                          </Button>
                        </TableCell>
                      </TableRow>
                    ) : h.localOrder.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={19} className="text-center py-8 text-muted-foreground">
                          <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p>No deals found</p>
                          <p className="text-sm">Try adjusting your search or filters</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      <SortableContext
                        items={h.localOrder.map((l) => l.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {h.localOrder.map((listing, index) => (
                          <DealTableRow
                            key={listing.id}
                            listing={listing}
                            index={index}
                            stats={
                              (h.scoreStats?.[listing.id] as {
                                totalMatches?: number;
                                approved?: number;
                                passed?: number;
                              }) ?? null
                            }
                            navigate={(path: string) => h.navigate(path)}
                            formatCurrency={formatCurrency}
                            formatWebsiteDomain={formatWebsiteDomain}
                            getEffectiveWebsite={getEffectiveWebsite}
                            formatGeographyBadges={formatGeographyBadges}
                            getScoreTrendIcon={getScoreTrendIcon}
                            columnWidths={h.columnWidths}
                            isSelected={h.selectedDeals.has(listing.id)}
                            onToggleSelect={h.handleToggleSelect}
                            onArchive={h.handleArchiveDeal}
                            onDelete={h.handleDeleteDeal}
                            onTogglePriority={h.handleTogglePriority}
                            onToggleUniverseBuild={h.handleToggleUniverseBuild}
                            onToggleBuyerSearch={h.handleToggleBuyerSearch}
                            adminProfiles={h.adminProfiles}
                            onAssignOwner={h.handleAssignOwner}
                            universesByListing={h.universeDealMap ?? {}}
                            pipelineCount={h.pipelineCounts?.[listing.id] || 0}
                            onUpdateRank={h.handleUpdateRank}
                            onMarkNotAFit={(dealId, dealName) =>
                              setNotAFitTarget({ id: dealId, name: dealName })
                            }
                            onRemoveNotAFit={async (dealId) => {
                              const { supabase } = await import('@/integrations/supabase/client');
                              const { error } = await supabase
                                .from('listings')
                                .update({ not_a_fit: false, not_a_fit_reason: null } as never)
                                .eq('id', dealId);
                              if (!error) {
                                h.queryClient.invalidateQueries({ queryKey: ['remarketing'] });
                              }
                            }}
                          />
                        ))}
                      </SortableContext>
                    )}
                  </TableBody>
                </table>
              </div>
            </DndContext>
          </TooltipProvider>
        </CardContent>
      </Card>

      {/* Pagination */}
      {h.sortedListings.length > h.PAGE_SIZE && (
        <div className="flex items-center justify-between py-3">
          <p className="text-sm text-muted-foreground">
            Showing {h.page * h.PAGE_SIZE + 1}&ndash;
            {Math.min((h.page + 1) * h.PAGE_SIZE, h.sortedListings.length)} of{' '}
            {h.sortedListings.length} deals
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={h.page === 0}
              onClick={() => h.setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {h.page + 1} of {h.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={h.page >= h.totalPages - 1}
              onClick={() => h.setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Outreach Modals */}
      <PushToDialerModal
        open={dialerOpen}
        onOpenChange={setDialerOpen}
        contactIds={Array.from(h.selectedDeals)}
        contactCount={h.selectedDeals.size}
        entityType="listings"
      />
      <PushToSmartleadModal
        open={smartleadOpen}
        onOpenChange={setSmartleadOpen}
        contactIds={Array.from(h.selectedDeals)}
        contactCount={h.selectedDeals.size}
        entityType="listings"
      />
      <PushToHeyreachModal
        open={heyreachOpen}
        onOpenChange={setHeyreachOpen}
        contactIds={Array.from(h.selectedDeals)}
        contactCount={h.selectedDeals.size}
        entityType="listings"
      />
      <AddDealsToListDialog
        open={addToListOpen}
        onOpenChange={setAddToListOpen}
        selectedDeals={selectedDealsForList}
        entityType="deal"
      />

      <PushToPortalDialog
        open={portalOpen}
        onOpenChange={setPortalOpen}
        listingIds={Array.from(h.selectedDeals)}
      />

      {/* Archive Deal Dialog */}
      <ArchiveDealDialog
        open={!!h.archiveTarget}
        onOpenChange={(open) => { if (!open) h.setArchiveTarget(null); }}
        deal={h.archiveTarget ? { id: h.archiveTarget.id, name: h.archiveTarget.name } : null}
        onConfirmArchive={h.confirmArchiveDeal}
      />

      {/* Not a Fit Dialog */}
      <NotAFitReasonDialog
        open={!!notAFitTarget}
        onOpenChange={(open) => !open && setNotAFitTarget(null)}
        dealName={notAFitTarget?.name ?? ''}
        onConfirm={(reason) => {
          if (notAFitTarget) {
            h.handleMarkNotAFit(notAFitTarget.id, reason);
            setNotAFitTarget(null);
          }
        }}
      />

      {/* All Dialogs */}
      <DealsActionDialogs
        showImportDialog={h.showImportDialog}
        setShowImportDialog={h.setShowImportDialog}
        refetchListings={h.refetchListings}
        handleImportCompleteWithIds={h.handleImportCompleteWithIds}
        showArchiveDialog={h.showArchiveDialog}
        setShowArchiveDialog={h.setShowArchiveDialog}
        handleBulkArchive={h.handleBulkArchive}
        isArchiving={h.isArchiving}
        selectedDealsSize={h.selectedDeals.size}
        showDeleteDialog={h.showDeleteDialog}
        setShowDeleteDialog={h.setShowDeleteDialog}
        handleBulkDelete={h.handleBulkDelete}
        isDeleting={h.isDeleting}
        showUniverseDialog={h.showUniverseDialog}
        setShowUniverseDialog={h.setShowUniverseDialog}
        selectedDealIds={Array.from(h.selectedDeals)}
        onUniverseComplete={() => h.setSelectedDeals(new Set())}
        singleDeleteTarget={h.singleDeleteTarget}
        setSingleDeleteTarget={h.setSingleDeleteTarget}
        handleConfirmSingleDelete={h.handleConfirmSingleDelete}
        showCalculateDialog={h.showCalculateDialog}
        setShowCalculateDialog={h.setShowCalculateDialog}
        handleCalculateScores={h.handleCalculateScores}
        isCalculating={h.isCalculating}
        showEnrichDialog={h.showEnrichDialog}
        setShowEnrichDialog={h.setShowEnrichDialog}
        handleEnrichDeals={h.handleEnrichDeals}
        isEnrichingAll={h.isEnrichingAll}
        listingsCount={h.listings?.length || 0}
        unenrichedCount={h.listings?.filter((l) => !l.enriched_at).length || 0}
        showAddDealDialog={h.showAddDealDialog}
        setShowAddDealDialog={h.setShowAddDealDialog}
        showEnrichmentSummary={h.showEnrichmentSummary}
        dismissSummary={h.dismissSummary}
        enrichmentSummary={
          h.enrichmentSummary as {
            total?: number;
            success?: number;
            failed?: number;
            errors?: { id: string; error: string }[];
          } | null
        }
        handleRetryFailedEnrichment={h.handleRetryFailedEnrichment}
      />
    </div>
  );
};

export default ReMarketingDeals;
