import { useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Sparkles, AlertTriangle, Activity, Loader2 } from 'lucide-react';
import {
  BuyerMatchCard,
  ScoringInstructionsPanel,
  PassConfirmDialog,
  BulkEmailDialog,
} from '@/components/remarketing';

import { MatchingHeader } from './MatchingHeader';
import { MatchingControls } from './MatchingControls';
import { useMatchingData } from './useMatchingData';
import { useMatchingActions } from './useMatchingActions';

export default function ReMarketingDealMatching() {
  const { listingId } = useParams<{ listingId: string }>();

  const data = useMatchingData(listingId);
  const actions = useMatchingActions({
    listingId,
    scores: data.scores as Parameters<typeof useMatchingActions>[0]['scores'],
    selectedUniverse: data.selectedUniverse,
    linkedUniverses: data.linkedUniverses,
    setIsScoring: data.setIsScoring,
    setScoringProgress: data.setScoringProgress,
    // @ts-expect-error customInstructions may not exist on data type
    customInstructions: data.customInstructions,
    setCustomInstructions: data.setCustomInstructions,
    refetchOutreach: data.refetchOutreach,
    listing: data.listing,
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <MatchingHeader
        listing={data.listing ?? null}
        listingLoading={data.listingLoading}
        listingId={listingId!}
        totalScores={data.stats.total}
        isScoring={data.isScoring}
        onScore={() => actions.handleBulkScore()}
      />

      {/* Stats Cards */}
      {data.stats.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-3">
              <div className="text-2xl font-bold">{data.stats.total}</div>
              <div className="text-xs text-muted-foreground">Total Scored</div>
            </CardContent>
          </Card>
          <Card className="border-green-200 bg-green-50/50">
            <CardContent className="p-3">
              <div className="text-2xl font-bold text-green-600">{data.stats.qualified}</div>
              <div className="text-xs text-muted-foreground">Qualified</div>
            </CardContent>
          </Card>
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="p-3">
              <div className="text-2xl font-bold text-blue-600">{data.stats.strong}</div>
              <div className="text-xs text-muted-foreground">Strong (80+)</div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50/50">
            <CardContent className="p-3">
              <div className="text-2xl font-bold text-amber-600">{data.stats.approved}</div>
              <div className="text-xs text-muted-foreground">Approved</div>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50/50">
            <CardContent className="p-3">
              <div className="text-2xl font-bold text-red-500">{data.stats.disqualified}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                DQ'd{' '}
                {data.stats.disqualificationReason && (
                  <span className="text-[10px]">({data.stats.disqualificationReason})</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Background scoring progress */}
      {data.backgroundScoring.isScoring && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-4 flex items-center gap-4">
            <Activity className="h-5 w-5 text-blue-600 animate-pulse" />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium">Scoring in progress...</p>
                <span className="text-xs text-muted-foreground">
                  {data.backgroundScoring.currentCount}/{data.backgroundScoring.expectedCount}
                </span>
              </div>
              <Progress
                value={
                  (data.backgroundScoring.currentCount /
                    Math.max(data.backgroundScoring.expectedCount, 1)) *
                  100
                }
                className="h-2"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scoring Progress */}
      {data.isScoring && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm font-medium">Scoring buyers...</span>
            </div>
            <Progress value={data.scoringProgress} className="h-2" />
          </CardContent>
        </Card>
      )}

      {/* Custom Instructions */}
      <ScoringInstructionsPanel
        customInstructions={data.customInstructions}
        onInstructionsChange={data.setCustomInstructions}
        onApplyAndRescore={actions.handleApplyAndRescore}
        onReset={actions.handleReset}
        isScoring={data.isScoring}
      />

      {/* Controls */}
      <MatchingControls
        linkedUniverses={data.linkedUniverses}
        selectedUniverse={data.selectedUniverse}
        onUniverseChange={data.setSelectedUniverse}
        universeMatchCounts={data.universeMatchCounts}
        activeTab={data.activeTab}
        onTabChange={data.setActiveTab}
        stats={data.stats}
        outreachCount={data.outreachCount}
        sortBy={data.sortBy}
        sortDesc={data.sortDesc}
        onSortChange={data.setSortBy}
        onSortDescToggle={() => data.setSortDesc(!data.sortDesc)}
        searchQuery={data.searchQuery}
        onSearchChange={data.setSearchQuery}
        hideDisqualified={data.hideDisqualified}
        onHideDisqualifiedToggle={() => data.setHideDisqualified(!data.hideDisqualified)}
        selectedCount={actions.selectedIds.size}
        onBulkApprove={actions.handleBulkApprove}
        onBulkPassOpen={() => actions.setPassDialogOpen(true)}
        onExportCSV={actions.handleExportCSV}
        onEmailDialogOpen={() => actions.setEmailDialogOpen(true)}
      />

      {/* Results */}
      {data.scoresLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : data.filteredScores.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" /> No Buyer Matches Yet
            </CardTitle>
            <CardDescription>
              {data.stats.total > 0
                ? 'No matches found for the selected filters. Try adjusting your filter or sort settings.'
                : "Click 'Score Buyers' to find matching buyers for this deal. Make sure you have linked a buyer universe first."}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.filteredScores.map((score) => {
            const outreach = data.outreachRecords?.find((o) => o.score_id === score.id);
            const feeAgreement = data.feeAgreementLookup.get(score.id);
            return (
              <BuyerMatchCard
                key={score.id}
                score={score as unknown as React.ComponentProps<typeof BuyerMatchCard>['score']}
                listingId={listingId}
                outreach={outreach as React.ComponentProps<typeof BuyerMatchCard>['outreach']}
                firmFeeAgreement={
                  feeAgreement
                    ? {
                        signed: feeAgreement.signed || false,
                        signedAt: feeAgreement.signedAt || null,
                      }
                    : undefined
                }
                isSelected={actions.selectedIds.has(score.id)}
                isHighlighted={actions.highlightedBuyerIds?.includes(score.buyer_id)}
                onSelect={actions.handleSelect}
                onApprove={(id) => actions.handleApprove(id, score as any)}
                onPass={(id) =>
                  actions.handleOpenPassDialog(
                    id,
                    (score as any).buyer?.company_name || 'Unknown',
                    score as any,
                  )
                }
                onToggleInterested={(id, interested) =>
                  actions.handleToggleInterested(id, interested, score as any)
                }
                onOutreachUpdate={actions.handleOutreachUpdate}
                onViewed={actions.handleScoreViewed}
                onMoveToPipeline={actions.handleMoveToPipeline}
                pipelineDealId={
                  score.buyer_id ? data.pipelineDealByBuyer.get(score.buyer_id) : undefined
                }
              />
            );
          })}

          {/* Summary footer */}
          <div className="text-center text-sm text-muted-foreground py-4">
            Showing {data.filteredScores.length} of {data.stats.total} scored buyers
            {data.hideDisqualified && data.stats.disqualified > 0 && (
              <span> ({data.stats.disqualified} disqualified hidden)</span>
            )}
          </div>
        </div>
      )}

      {/* Dialogs */}
      <PassConfirmDialog
        open={actions.passDialogOpen}
        onOpenChange={actions.setPassDialogOpen}
        buyerName={actions.selectedBuyerForPass?.name || ''}
        onConfirm={actions.handleConfirmPass}
        isBulk={actions.selectedBuyerForPass === null && actions.selectedIds.size > 0}
        bulkCount={actions.selectedIds.size}
        onBulkConfirm={actions.handleBulkPass}
      />

      {actions.emailDialogOpen && (
        <BulkEmailDialog
          open={actions.emailDialogOpen}
          onOpenChange={actions.setEmailDialogOpen}
          scores={
            (data.scores?.filter((s) => actions.selectedIds.has(s.id)) ||
              []) as React.ComponentProps<typeof BulkEmailDialog>['scores']
          }
          listing={data.listing as React.ComponentProps<typeof BulkEmailDialog>['listing']}
          onSent={(buyerIds: string[]) => {
            actions.setHighlightedBuyerIds(buyerIds);
            setTimeout(() => actions.setHighlightedBuyerIds([]), 5000);
          }}
        />
      )}
    </div>
  );
}
