import { useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FilterBar, BUYER_UNIVERSE_FIELDS } from '@/components/filters';
import {
  Sparkles,
  Loader2,
  Download,
  FileSignature,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useBuyerEnrichmentProgress } from '@/hooks/useBuyerEnrichmentProgress';
import { EnrichmentProgressIndicator } from '@/components/remarketing/EnrichmentProgressIndicator';
import { BuyerCSVImport } from '@/components/remarketing';
import { useAIUIActionHandler } from '@/hooks/useAIUIActionHandler';
import { useAICommandCenterContext } from '@/components/ai-command-center/AICommandCenterProvider';
import { Badge } from '@/components/ui/badge';
import { useBuyersData } from './useBuyersData';
import AddBuyerDialog from './AddBuyerDialog';
import BuyersTable from './BuyersTable';
import { BuyersKPICards } from './BuyersKPICards';
import { BuyersPagination } from './BuyersPagination';

const ReMarketingBuyers = () => {
  const { progress: buyerEnrichmentProgress, cancel: cancelBuyerEnrichment } =
    useBuyerEnrichmentProgress();

  const {
    activeTab,
    isAddDialogOpen,
    setIsAddDialogOpen,
    selectedIds,
    setSelectedIds,
    currentPage,
    setCurrentPage,
    enrichingIds,
    setEnrichingIds,
    sortColumn,
    sortDirection,
    newBuyer,
    setNewBuyer,

    // Filter engine
    filterState,
    setFilterState,
    dynamicOptions,
    filteredCount,
    engineTotal,

    buyers,
    buyersLoading,
    buyerIdsWithTranscripts,
    universes,
    tabCounts,
    platformCountsByFirm,
    filteredBuyers,
    totalPages,
    pagedBuyers,
    unsignedAgreements,

    createMutation,
    deleteMutation,

    handleTabChange,
    handleEnrichBuyer,
    handleSort,
    toggleSelect,
    toggleSelectAll,
    handleExportCSV,

    queryClient,
  } = useBuyersData();

  const { setPageContext } = useAICommandCenterContext();

  useEffect(() => {
    setPageContext({ page: 'buyers', entity_type: 'buyers' });
  }, [setPageContext]);

  useAIUIActionHandler({
    table: 'buyers',
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
    onSortColumn: (field) => {
      const fieldMap: Record<string, string> = {
        company_name: 'company_name',
        buyer_type: 'buyer_type',
        created_at: 'created_at',
      };
      handleSort(fieldMap[field] || field);
    },
    onTriggerAction: (action) => {
      if (action === 'enrich_selected') {
        const ids =
          selectedIds.size > 0
            ? Array.from(selectedIds)
            : filteredBuyers.map((b: { id: string }) => b.id);
        if (ids.length > 0) {
          setEnrichingIds(new Set(ids));
          import('@/lib/remarketing/queueEnrichment').then(({ queueBuyerEnrichment }) =>
            queueBuyerEnrichment(ids)
              .then(() => {
                queryClient.invalidateQueries({ queryKey: ['remarketing', 'buyers'] });
              })
              .catch(() => toast.error('Failed to queue enrichment'))
              .finally(() => setEnrichingIds(new Set())),
          );
        }
      }
      if (action === 'export_csv') handleExportCSV();
    },
  });

  if (buyersLoading) {
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
          <h1 className="text-2xl font-bold text-foreground">All Buyers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tabCounts.all} buyers &middot; {tabCounts.needs_agreements} need agreements
          </p>
        </div>
        <div className="flex items-center gap-2">
          <BuyerCSVImport />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={enrichingIds.size > 0 || filteredBuyers.length === 0}
              >
                {enrichingIds.size > 0 ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Enrich
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onClick={async () => {
                  const ids =
                    selectedIds.size > 0
                      ? Array.from(selectedIds)
                      : filteredBuyers.map((b: { id: string }) => b.id);
                  if (ids.length === 0) return;
                  setEnrichingIds(new Set(ids));
                  try {
                    const { queueBuyerEnrichment } = await import(
                      '@/lib/remarketing/queueEnrichment'
                    );
                    await queueBuyerEnrichment(ids);
                    queryClient.invalidateQueries({ queryKey: ['remarketing', 'buyers'] });
                  } catch {
                    toast.error('Failed to queue enrichment');
                  } finally {
                    setEnrichingIds(new Set());
                  }
                }}
              >
                {selectedIds.size > 0
                  ? `Enrich Selected (${selectedIds.size})`
                  : 'Enrich All'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <AddBuyerDialog
            isOpen={isAddDialogOpen}
            onOpenChange={setIsAddDialogOpen}
            newBuyer={newBuyer}
            setNewBuyer={setNewBuyer}
            universes={universes}
            createMutation={createMutation}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {[
          { key: 'all', label: 'All Buyers', count: tabCounts.all },
          { key: 'private_equity', label: 'Sponsors & Firms', count: tabCounts.private_equity },
          { key: 'corporate', label: 'Corporates', count: tabCounts.corporate },
          { key: 'needs_review', label: 'Needs Review', count: tabCounts.needs_review },
          { key: 'needs_agreements', label: 'Needs Agreements', count: tabCounts.needs_agreements },
          ...(tabCounts.needs_pe_link > 0
            ? [{ key: 'needs_pe_link', label: 'Needs PE Firm Link', count: tabCounts.needs_pe_link }]
            : []),
          { key: 'unsigned_agreements', label: 'Unsigned Agreements', count: tabCounts.unsigned_agreements, icon: true },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5',
              activeTab === tab.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.icon && <FileSignature className="h-3.5 w-3.5" />}
            {tab.label}
            <span className="text-xs text-muted-foreground">({tab.count})</span>
          </button>
        ))}
      </div>

      {/* KPI Stats Cards */}
      <BuyersKPICards
        totalBuyers={tabCounts.all}
        sponsorCount={tabCounts.private_equity}
        needsAgreements={tabCounts.needs_agreements}
        needsReview={tabCounts.needs_review}
      />

      {/* Buyer Enrichment Progress Bar */}
      {buyerEnrichmentProgress.isEnriching && (
        <EnrichmentProgressIndicator
          completedCount={buyerEnrichmentProgress.completedCount}
          totalCount={buyerEnrichmentProgress.totalCount}
          progress={buyerEnrichmentProgress.progress}
          estimatedTimeRemaining={buyerEnrichmentProgress.estimatedTimeRemaining}
          processingRate={buyerEnrichmentProgress.processingRate}
          itemLabel="buyers"
          successfulCount={
            buyerEnrichmentProgress.completedCount - buyerEnrichmentProgress.failedCount
          }
          failedCount={buyerEnrichmentProgress.failedCount}
          onCancel={cancelBuyerEnrichment}
        />
      )}

      {/* Filter Bar */}
      <FilterBar
        filterState={filterState}
        onFilterStateChange={setFilterState}
        fieldDefinitions={BUYER_UNIVERSE_FIELDS}
        dynamicOptions={dynamicOptions}
        totalCount={engineTotal}
        filteredCount={filteredCount}
      />

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <Button
              size="sm"
              variant="outline"
              disabled={enrichingIds.size > 0}
              onClick={async () => {
                const ids = Array.from(selectedIds);
                if (ids.length === 0) return;
                setEnrichingIds(new Set(ids));
                try {
                  const { queueBuyerEnrichment } =
                    await import('@/lib/remarketing/queueEnrichment');
                  await queueBuyerEnrichment(ids);
                  queryClient.invalidateQueries({ queryKey: ['remarketing', 'buyers'] });
                } catch {
                  toast.error('Failed to queue enrichment');
                } finally {
                  setEnrichingIds(new Set());
                }
              }}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />{' '}
              {enrichingIds.size > 0 ? 'Enriching\u2026' : 'Enrich Selected'}
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportCSV}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              Clear
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Unsigned Agreements Tab Content */}
      {activeTab === 'unsigned_agreements' ? (
        <Card>
          <CardContent className="p-0">
            {!unsignedAgreements || unsignedAgreements.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <FileSignature className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No unsigned agreements outstanding.</p>
              </div>
            ) : (
              <div className="divide-y">
                {unsignedAgreements.map((item) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="flex items-center justify-between px-4 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge
                        variant="outline"
                        className={
                          item.type === 'nda'
                            ? 'bg-indigo-50 text-indigo-700 border-indigo-200 text-xs shrink-0'
                            : 'bg-teal-50 text-teal-700 border-teal-200 text-xs shrink-0'
                        }
                      >
                        {item.type === 'nda' ? 'NDA' : 'Fee Agreement'}
                      </Badge>
                      <span className="text-sm font-medium truncate">
                        {item.primary_company_name}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 ml-4">
                      {item.sent_at
                        ? `Sent ${new Date(item.sent_at).toLocaleDateString()}`
                        : item.status || 'Sent'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Buyers Table */
        <BuyersTable
          activeTab={activeTab}
          buyersLoading={buyersLoading}
          filteredBuyers={filteredBuyers}
          pagedBuyers={pagedBuyers}
          currentPage={currentPage}
          selectedIds={selectedIds}
          buyers={buyers}
          platformCountsByFirm={platformCountsByFirm}
          buyerIdsWithTranscripts={buyerIdsWithTranscripts}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          toggleSelect={toggleSelect}
          toggleSelectAll={toggleSelectAll}
          handleSort={handleSort}
          handleEnrichBuyer={handleEnrichBuyer}
          deleteMutation={deleteMutation}
        />
      )}

      {/* Pagination */}
      {activeTab !== 'unsigned_agreements' && filteredBuyers.length > 0 && (
        <BuyersPagination
          filteredCount={filteredBuyers.length}
          totalBuyers={tabCounts.all}
          currentPage={currentPage}
          totalPages={totalPages}
          setCurrentPage={setCurrentPage}
        />
      )}
    </div>
  );
};

export default ReMarketingBuyers;
