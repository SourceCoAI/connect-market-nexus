import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Sparkles, MapPin, ArrowUpDown, Mail, Search } from 'lucide-react';
import { BuyerMatchCard, type OutreachStatus } from '@/components/remarketing';
import { AddToUniverseQuickAction } from '@/components/remarketing/AddToUniverseQuickAction';
import type { SortOption, FilterTab } from './types';

interface ScoreRecord {
  id: string;
  buyer_id: string;
  composite_score?: number;
  [key: string]: unknown;
}

interface MatchListProps {
  listing:
    | { location?: string | null; title?: string | null; category?: string | null }
    | undefined;
  listingId: string | undefined;
  scores: ScoreRecord[] | undefined;
  allScores: ScoreRecord[] | undefined;
  filteredScores: ScoreRecord[];
  scoresLoading: boolean;
  linkedUniverses: Array<{ id: string; name: string }> | undefined;
  selectedUniverse: string;
  stats: {
    total: number;
    approved: number;
    passed: number;
  };
  outreachCount: number;
  outreachRecords:
    | Array<{ score_id: string; status: string; contacted_at?: string; notes?: string }>
    | undefined;
  feeAgreementLookup: Map<string, { signed: boolean; signedAt: string | null }>;
  pipelineDealByBuyer: Map<string, string>;
  activeTab: FilterTab;
  setActiveTab: (v: FilterTab) => void;
  sortBy: SortOption;
  setSortBy: (v: SortOption) => void;
  sortDesc: boolean;
  setSortDesc: (v: boolean) => void;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  selectedIds: Set<string>;
  highlightedBuyerIds: string[];
  handleSelect: (id: string, selected: boolean) => void;
  handleApprove: (scoreId: string, scoreData?: any) => Promise<void>;
  handleOpenPassDialog: (scoreId: string, buyerName: string, scoreData?: any) => void;
  handleToggleInterested: (
    scoreId: string,
    interested: boolean,
    scoreData?: ScoreRecord,
  ) => Promise<void>;
  handleOutreachUpdate: (scoreId: string, status: OutreachStatus, notes: string) => Promise<void>;
  handleScoreViewed: (scoreId: string) => Promise<void>;
  handleMoveToPipeline: (
    scoreId: string,
    buyerId: string,
    targetListingId: string,
  ) => Promise<void>;
  updateScoreMutationIsPending: boolean;
  refetchLinkedUniverses: () => void;
}

export function MatchList({
  listing,
  listingId,
  scores,
  allScores,
  filteredScores,
  scoresLoading,
  linkedUniverses,
  selectedUniverse,
  stats,
  outreachCount,
  outreachRecords,
  feeAgreementLookup,
  pipelineDealByBuyer,
  activeTab,
  setActiveTab,
  sortBy,
  setSortBy,
  sortDesc,
  setSortDesc,
  searchQuery,
  setSearchQuery,
  selectedIds,
  highlightedBuyerIds,
  handleSelect,
  handleApprove,
  handleOpenPassDialog,
  handleToggleInterested,
  handleOutreachUpdate,
  handleScoreViewed,
  handleMoveToPipeline,
  updateScoreMutationIsPending,
  refetchLinkedUniverses,
}: MatchListProps) {
  return (
    <>
      {/* Search, Tabs & Sort Controls */}
      {scores && scores.length > 0 && (
        <div className="space-y-3">
          {/* Search Bar */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search buyers by name, firm, location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="flex items-center justify-between flex-wrap gap-4">
            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FilterTab)}>
              <TabsList>
                <TabsTrigger value="all">
                  All Buyers (
                  {filteredScores.length !== stats.total ? `${filteredScores.length}/` : ''}
                  {stats.total})
                </TabsTrigger>
                <TabsTrigger value="approved">Approved ({stats.approved})</TabsTrigger>
                <TabsTrigger value="passed">Passed ({stats.passed})</TabsTrigger>
                <TabsTrigger value="outreach">
                  <Mail className="h-3.5 w-3.5 mr-1" />
                  In Outreach ({outreachCount})
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Sort Controls */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Sort by:</span>
              <div className="flex gap-1">
                <Button
                  variant={sortBy === 'score' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setSortBy('score')}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  Score
                </Button>
                <Button
                  variant={sortBy === 'geography' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setSortBy('geography')}
                >
                  <MapPin className="h-3.5 w-3.5 mr-1" />
                  Geography
                </Button>
                <Button
                  variant={sortBy === 'score_geo' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setSortBy('score_geo')}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1" />
                  Score + Geo
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setSortDesc(!sortDesc)}
                >
                  <ArrowUpDown className={cn('h-4 w-4', !sortDesc && 'rotate-180')} />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Match Cards - Full Width */}
      <div className="space-y-3">
        {scoresLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        ) : (!linkedUniverses || linkedUniverses.length === 0) &&
          (!allScores || allScores.length === 0) ? (
          <AddToUniverseQuickAction
            listingId={listingId!}
            listingCategory={listing?.category}
            onUniverseAdded={() => {
              refetchLinkedUniverses();
            }}
          />
        ) : filteredScores.length === 0 && allScores && allScores.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Sparkles className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="font-semibold text-lg mb-1">No matches yet</h3>
              <p className="text-muted-foreground">
                Select a universe and click "Score Buyers" to find matches
              </p>
            </CardContent>
          </Card>
        ) : filteredScores.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No buyers match the current filters</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredScores.map((score: ScoreRecord) => {
              const outreach = outreachRecords?.find((o) => o.score_id === score.id);
              return (
                <BuyerMatchCard
                  key={score.id}
                  score={score as unknown as import('@/types/remarketing').ReMarketingScore}
                  dealLocation={listing?.location ?? undefined}
                  isSelected={selectedIds.has(score.id)}
                  isHighlighted={highlightedBuyerIds.includes(
                    (score.buyer as { id?: string } | undefined)?.id || '',
                  )}
                  onSelect={handleSelect}
                  onApprove={handleApprove}
                  onPass={handleOpenPassDialog}
                  onToggleInterested={handleToggleInterested}
                  onOutreachUpdate={handleOutreachUpdate}
                  onViewed={handleScoreViewed}
                  onMoveToPipeline={handleMoveToPipeline}
                  outreach={
                    outreach
                      ? {
                          status: outreach.status as OutreachStatus,
                          contacted_at: outreach.contacted_at ?? undefined,
                          notes: outreach.notes ?? undefined,
                        }
                      : undefined
                  }
                  isPending={updateScoreMutationIsPending}
                  universeName={
                    selectedUniverse === 'all'
                      ? (score.universe as { name?: string } | undefined)?.name
                      : undefined
                  }
                  firmFeeAgreement={feeAgreementLookup.get(score.id)}
                  pipelineDealId={
                    pipelineDealByBuyer.get(
                      (score.buyer as { id?: string } | undefined)?.id || '',
                    ) || null
                  }
                  listingId={listingId}
                />
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
