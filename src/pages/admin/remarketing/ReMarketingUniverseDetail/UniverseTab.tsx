import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  BuyerTableEnhanced,
  UniverseDealsTable,
  BuyerTableToolbar,
  EnrichmentProgressIndicator,
} from "@/components/remarketing";
import { FilterBar, BUYER_UNIVERSE_FIELDS } from "@/components/filters";
import { useFilterEngine } from "@/hooks/use-filter-engine";
import {
  Users,
  Plus,
  Sparkles,
  Loader2,
  Unlink,
  Briefcase,
  TrendingUp,
  Upload,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { UseUniverseDataReturn } from "./useUniverseData";

interface UniverseTabProps {
  data: UseUniverseDataReturn;
  handlers: {
    handleRemoveBuyersFromUniverse: (buyerIds: string[]) => Promise<void>;
    handleEnrichSingleBuyer: (buyerId: string) => Promise<void>;
    handleDeleteBuyer: (buyerId: string) => Promise<void>;
    handleToggleFeeAgreement: (buyerId: string, currentStatus: boolean) => Promise<void>;
    handleRemoveSelectedBuyers: () => Promise<void>;
  };
}

export function UniverseTab({ data, handlers }: UniverseTabProps) {
  const {
    id,
    queryClient,
    buyers,
    buyerIdsWithTranscripts,
    universeDeals,
    dealEngagementStats,
    setAddBuyerDialogOpen,
    setImportBuyersDialogOpen,
    setShowBuyerEnrichDialog,
    setAddDealDialogOpen,
    setAddDealDefaultTab,
    setImportDealsDialogOpen,
    isScoringAllDeals, setIsScoringAllDeals,
    selectedBuyerIds, setSelectedBuyerIds,
    isRemovingSelected,
    queueProgress,
    cancelQueueEnrichment,
    resetQueueEnrichment,
    resetAlignmentScoring,
    scoreAlignmentBuyers,
    cancelAlignmentScoring,
    isScoringAlignment,
    alignmentProgress,
    refetchBuyers,
    refetchDeals,
    dealQueueProgress,
    cancelDealQueueEnrichment,
    pauseDealEnrichment,
    resumeDealEnrichment,
    dealEnrichmentProgress,
    enrichDeals,
    cancelDealEnrichment,
    resetDealEnrichment,
    selectedDealIds,
    setSelectedDealIds,
    isRemovingSelectedDeals,
    setIsRemovingSelectedDeals,
  } = data;

  const {
    handleRemoveBuyersFromUniverse,
    handleEnrichSingleBuyer,
    handleDeleteBuyer,
    handleToggleFeeAgreement,
    handleRemoveSelectedBuyers,
  } = handlers;

  // Use the filter engine for advanced filtering
  const {
    filteredItems: filteredBuyers,
    filterState,
    setFilterState,
    totalCount,
    filteredCount,
    dynamicOptions,
  } = useFilterEngine(buyers || [], BUYER_UNIVERSE_FIELDS);

  return (
    <Tabs defaultValue="buyers" className="space-y-4">
      <TabsList>
        <TabsTrigger value="buyers">
          <Users className="mr-2 h-4 w-4" />
          Buyers ({buyers?.length || 0})
        </TabsTrigger>
        <TabsTrigger value="deals">
          <Briefcase className="mr-2 h-4 w-4" />
          Deals ({universeDeals?.length || 0})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="buyers">
        {/* Filter Bar */}
        <FilterBar
          filterState={filterState}
          onFilterStateChange={setFilterState}
          fieldDefinitions={BUYER_UNIVERSE_FIELDS}
          dynamicOptions={dynamicOptions}
          totalCount={totalCount}
          filteredCount={filteredCount}
          compact
          className="mb-4"
        />

        <Card>
          <CardHeader className="pb-4">
            <BuyerTableToolbar
              buyerCount={filteredBuyers.length}
              searchValue=""
              onSearchChange={() => {}}
              hideSearch
              onAddBuyer={() => setAddBuyerDialogOpen(true)}
              onImportCSV={() => setImportBuyersDialogOpen(true)}
              onEnrichAll={() => setShowBuyerEnrichDialog(true)}
              onCancelEnrichment={cancelQueueEnrichment}
              onResetQueue={async () => {
                await resetQueueEnrichment();
                toast.success('Enrichment queue reset');
              }}
              onScoreAlignment={async () => {
                if (!buyers?.length) {
                  toast.error('No buyers to score');
                  return;
                }
                resetAlignmentScoring();
                await scoreAlignmentBuyers(
                  buyers.map(b => ({
                    id: b.id,
                    company_name: b.company_name,
                    alignment_score: b.alignment_score ?? null
                  })),
                  () => refetchBuyers()
                );
              }}
              onCancelAlignment={cancelAlignmentScoring}
              isEnriching={queueProgress.isRunning}
              isScoringAlignment={isScoringAlignment}
              enrichmentProgress={{
                current: queueProgress.completed + queueProgress.failed,
                total: queueProgress.total,
                successful: queueProgress.completed,
                failed: queueProgress.failed,
                creditsDepleted: false,
                rateLimited: queueProgress.rateLimited > 0,
                resetTime: queueProgress.rateLimitResetAt
              }}
              alignmentProgress={{
                current: alignmentProgress.current,
                total: alignmentProgress.total,
                successful: alignmentProgress.successful,
                failed: alignmentProgress.failed,
                creditsDepleted: alignmentProgress.creditsDepleted
              }}
              selectedCount={selectedBuyerIds.length}
              onRemoveSelected={handleRemoveSelectedBuyers}
              isRemovingSelected={isRemovingSelected}
            />
          </CardHeader>
          <CardContent className="p-0">
            <BuyerTableEnhanced
              buyers={filteredBuyers as unknown as { id: string; company_name: string; [key: string]: unknown }[]}
              showPEColumn={true}
              buyerIdsWithTranscripts={buyerIdsWithTranscripts}
              selectable={true}
              onRemoveFromUniverse={handleRemoveBuyersFromUniverse}
              onEnrich={handleEnrichSingleBuyer}
              onDelete={handleDeleteBuyer}
              onToggleFeeAgreement={handleToggleFeeAgreement}
              onSelectionChange={setSelectedBuyerIds}
              universeId={id}
            />
          </CardContent>
        </Card>

        {/* Always-visible bulk action button (requested) */}
        <div className="fixed bottom-6 right-6 z-50">
          <Button
            variant="outline"
            onClick={handleRemoveSelectedBuyers}
            disabled={selectedBuyerIds.length === 0 || isRemovingSelected}
            className="bg-background/95 backdrop-blur border shadow-sm text-destructive border-destructive/30 hover:bg-destructive/10"
          >
            {isRemovingSelected ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Unlink className="h-4 w-4 mr-2" />
            )}
            Remove Selected{selectedBuyerIds.length ? ` (${selectedBuyerIds.length})` : ""}
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="deals">
        {/* Deal Enrichment Progress Bar — uses queue-based tracking for real-time updates */}
        {(dealQueueProgress.isEnriching || dealQueueProgress.isPaused) && (
          <div className="mb-4">
            <EnrichmentProgressIndicator
              completedCount={dealQueueProgress.completedCount}
              totalCount={dealQueueProgress.totalCount}
              progress={dealQueueProgress.progress}
              estimatedTimeRemaining={dealQueueProgress.estimatedTimeRemaining}
              processingRate={dealQueueProgress.processingRate}
              itemLabel="deals"
              successfulCount={dealQueueProgress.successfulCount}
              failedCount={dealQueueProgress.failedCount}
              isPaused={dealQueueProgress.isPaused}
              onPause={pauseDealEnrichment}
              onResume={resumeDealEnrichment}
              onCancel={cancelDealQueueEnrichment}
            />
          </div>
        )}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {universeDeals?.length || 0} deals
                </span>
                {(() => {
                  const unenrichedCount = universeDeals?.filter((d) => !(d.listing as Record<string, unknown> | null)?.enriched_at).length || 0;
                  return unenrichedCount > 0 ? (
                    <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50 dark:bg-orange-950/30">
                      {unenrichedCount} unenriched
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30">
                      All enriched
                    </Badge>
                  );
                })()}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!universeDeals?.length) {
                      toast.error('No deals to score');
                      return;
                    }
                    setIsScoringAllDeals(true);
                    try {
                      const listingIds = universeDeals.filter((d) => (d.listing as Record<string, unknown> | null)?.id).map((d) => (d.listing as { id: string }).id);
                      const { queueDealScoring } = await import("@/lib/remarketing/queueScoring");
                      await queueDealScoring({ universeId: id!, listingIds });
                      toast.success(`Queued ${listingIds.length} deals for scoring`);
                      queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal-engagement', id] });
                    } catch (error) {
                      toast.error('Failed to score deals');
                    } finally {
                      setIsScoringAllDeals(false);
                    }
                  }}
                  disabled={isScoringAllDeals || !universeDeals?.length}
                >
                  {isScoringAllDeals ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <TrendingUp className="h-4 w-4 mr-1" />
                  )}
                  Score All Deals
                </Button>
                {(dealQueueProgress.isEnriching || dealQueueProgress.isPaused) ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={cancelDealQueueEnrichment}
                  >
                    Cancel Enrichment
                  </Button>
                ) : dealEnrichmentProgress.isRunning ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={cancelDealEnrichment}
                  >
                    Cancel Enrichment
                  </Button>
                ) : (
                  (() => {
                    const unenrichedDeals = universeDeals?.filter((d) => {
                      const listing = d.listing as Record<string, unknown> | null;
                      return listing?.id && !listing.enriched_at;
                    }) || [];
                    return unenrichedDeals.length > 0 ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          resetDealEnrichment();

                          const dealsToEnrich = unenrichedDeals.map((d) => {
                            const listing = d.listing as { id: string; enriched_at: string | null };
                            return {
                              id: d.id,
                              listingId: listing.id,
                              enrichedAt: listing.enriched_at
                            };
                          });

                          await enrichDeals(dealsToEnrich);
                          refetchDeals();
                        }}
                      >
                        <Sparkles className="h-4 w-4 mr-1" />
                        Enrich {unenrichedDeals.length} Unenriched
                      </Button>
                    ) : null;
                  })()
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setImportDealsDialogOpen(true)}
                >
                  <Upload className="h-4 w-4 mr-1" />
                  Import Deals
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setAddDealDefaultTab('existing');
                    setAddDealDialogOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Deal
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <UniverseDealsTable
              deals={(universeDeals || []) as unknown as { id: string; added_at: string; status: string; listing: { id: string; title: string; [key: string]: unknown }; }[]}
              engagementStats={dealEngagementStats || {}}
              universeId={id}
              selectedDealIds={selectedDealIds}
              onSelectionChange={setSelectedDealIds}
              onRemoveDeal={async (dealId, _listingId) => {
                try {
                  await supabase
                    .from('remarketing_universe_deals')
                    .update({ status: 'archived' })
                    .eq('id', dealId);
                  toast.success('Deal removed from universe');
                  refetchDeals();
                } catch (error) {
                  toast.error('Failed to remove deal');
                }
              }}
              onScoreDeal={async (listingId) => {
                try {
                  const { queueDealScoring } = await import("@/lib/remarketing/queueScoring");
                  await queueDealScoring({ universeId: id!, listingIds: [listingId] });
                  queryClient.invalidateQueries({ queryKey: ['remarketing', 'deal-engagement', id] });
                } catch (error) {
                  toast.error('Failed to score deal');
                }
              }}
              onEnrichDeal={async (listingId) => {
                try {
                  const { queueDealEnrichment } = await import("@/lib/remarketing/queueEnrichment");
                  await queueDealEnrichment([listingId]);
                  refetchDeals();
                } catch (error) {
                  toast.error('Failed to queue enrichment');
                }
              }}
            />
          </CardContent>
        </Card>

        {/* Bulk remove selected deals */}
        {selectedDealIds.length > 0 && (
          <div className="fixed bottom-6 right-6 z-50">
            <Button
              variant="outline"
              onClick={async () => {
                setIsRemovingSelectedDeals(true);
                try {
                  await supabase
                    .from('remarketing_universe_deals')
                    .update({ status: 'archived' })
                    .in('id', selectedDealIds);
                  toast.success(`Removed ${selectedDealIds.length} deal${selectedDealIds.length > 1 ? 's' : ''} from universe`);
                  setSelectedDealIds([]);
                  refetchDeals();
                } catch (error) {
                  toast.error('Failed to remove deals');
                } finally {
                  setIsRemovingSelectedDeals(false);
                }
              }}
              disabled={isRemovingSelectedDeals}
              className="bg-background/95 backdrop-blur border shadow-sm text-destructive border-destructive/30 hover:bg-destructive/10"
            >
              {isRemovingSelectedDeals ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Remove Selected{` (${selectedDealIds.length})`}
            </Button>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
