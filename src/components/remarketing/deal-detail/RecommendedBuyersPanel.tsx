import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useNewRecommendedBuyers, type BuyerScore } from '@/hooks/admin/use-new-recommended-buyers';
import { useSeedBuyers, type SeedBuyerResult } from '@/hooks/admin/use-seed-buyers';
import { useBuyerIntroductions } from '@/hooks/use-buyer-introductions';
import {
  RefreshCw,
  Users,
  AlertCircle,
  Zap,
  Star,
  HelpCircle,
  MapPin,
  FileCheck,
  Sparkles,
  Plus,
  Check,
  Copy,
  CheckCircle,
  X,
  Database,
  Globe,
  ChevronDown,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface RecommendedBuyersPanelProps {
  listingId: string;
  listingTitle?: string;
}

const PAGE_SIZE = 5;

const TIER_CONFIG: Record<BuyerScore['tier'], { label: string; color: string; icon: typeof Zap }> =
  {
    move_now: {
      label: 'Move Now',
      color: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      icon: Zap,
    },
    strong: { label: 'Strong', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: Star },
    speculative: {
      label: 'Speculative',
      color: 'bg-amber-100 text-amber-800 border-amber-200',
      icon: HelpCircle,
    },
  };

const SOURCE_BADGE: Record<BuyerScore['source'], { label: string; color: string }> = {
  ai_seeded: { label: 'AI Search', color: 'bg-purple-100 text-purple-700' },
  marketplace: { label: 'Marketplace', color: 'bg-blue-100 text-blue-700' },
  scored: { label: 'Buyer Pool', color: 'bg-gray-100 text-gray-600' },
};

function formatBuyerType(type: string | null): string {
  if (!type) return '';
  const map: Record<string, string> = {
    private_equity: 'PE Firm',
    corporate: 'Corporate',
    family_office: 'Family Office',
  };
  return map[type] || type.replace('_', ' ');
}

/** Internal = buyers from our platform (marketplace + buyer pool). External = AI-discovered buyers. */
function isInternal(buyer: BuyerScore): boolean {
  return buyer.source === 'marketplace' || buyer.source === 'scored';
}

function TierSummary({ buyers }: { buyers: BuyerScore[] }) {
  const moveNow = buyers.filter((b) => b.tier === 'move_now').length;
  const strong = buyers.filter((b) => b.tier === 'strong').length;
  const speculative = buyers.filter((b) => b.tier === 'speculative').length;

  return (
    <div className="flex items-center gap-4 text-sm">
      {moveNow > 0 && (
        <span className="flex items-center gap-1">
          <Zap className="h-3.5 w-3.5 text-emerald-600" />
          <span className="font-medium text-emerald-700">{moveNow}</span> Move Now
        </span>
      )}
      {strong > 0 && (
        <span className="flex items-center gap-1">
          <Star className="h-3.5 w-3.5 text-blue-600" />
          <span className="font-medium text-blue-700">{strong}</span> Strong
        </span>
      )}
      {speculative > 0 && (
        <span className="flex items-center gap-1">
          <HelpCircle className="h-3.5 w-3.5 text-amber-600" />
          <span className="font-medium text-amber-700">{speculative}</span> Speculative
        </span>
      )}
    </div>
  );
}

function BuyerCard({
  buyer,
  onAccept,
  onReject,
  isAccepting,
}: {
  buyer: BuyerScore;
  onAccept: (buyer: BuyerScore) => void;
  onReject: (buyer: BuyerScore) => void;
  isAccepting?: boolean;
}) {
  const tier = TIER_CONFIG[buyer.tier];
  const TierIcon = tier.icon;
  const sourceBadge = SOURCE_BADGE[buyer.source] || SOURCE_BADGE.scored;

  return (
    <div className="border rounded-lg px-3.5 py-3 hover:shadow-md transition-shadow shadow-sm">
      {/* Top row */}
      <div className="flex items-center gap-3">
        {/* Name + location */}
        <div className="shrink-0 min-w-[180px]">
          <div className="flex items-center gap-1.5">
            <Link to={`/admin/buyers/${buyer.buyer_id}`}>
              <span className="font-semibold text-[15px] hover:underline truncate">
                {buyer.company_name}
              </span>
            </Link>
            {buyer.pe_firm_name && (
              <>
                <span className="text-muted-foreground text-[13px]">/</span>
                {buyer.pe_firm_id ? (
                  <Link to={`/admin/buyers/pe-firms/${buyer.pe_firm_id}`}>
                    <span className="text-[13px] text-muted-foreground hover:underline hover:text-foreground truncate">
                      {buyer.pe_firm_name}
                    </span>
                  </Link>
                ) : (
                  <span className="text-[13px] text-muted-foreground truncate">
                    {buyer.pe_firm_name}
                  </span>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
            <MapPin className="h-3 w-3" />
            {buyer.hq_city && buyer.hq_state
              ? `${buyer.hq_city}, ${buyer.hq_state}`
              : buyer.hq_state || formatBuyerType(buyer.buyer_type) || ''}
            {buyer.has_fee_agreement && (
              <span className="flex items-center gap-0.5 text-green-600 ml-1">
                <FileCheck className="h-3 w-3" />
                Fee
              </span>
            )}
            {buyer.company_website && (
              <a
                href={buyer.company_website.startsWith('http') ? buyer.company_website : `https://${buyer.company_website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-0.5 text-blue-600 hover:text-blue-800 ml-1"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3" />
                Website
              </a>
            )}
          </div>
        </div>

        {/* Tags */}
        <div className="flex-1 flex flex-wrap gap-1 min-w-0">
          {buyer.fit_signals.slice(0, 3).map((signal, i) => (
            <span
              key={i}
              className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium whitespace-nowrap"
            >
              {signal}
            </span>
          ))}
        </div>

        {/* Source + Tier + Score + Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className={cn('text-[11px]', sourceBadge.color)}>
            {sourceBadge.label}
          </Badge>

          <Badge variant="outline" className={cn('text-xs gap-0.5', tier.color)}>
            <TierIcon className="h-3 w-3" />
            {tier.label}
          </Badge>

          <span
            className={cn(
              'text-base font-bold min-w-[26px] text-right tabular-nums',
              buyer.composite_score >= 70
                ? 'text-emerald-600'
                : buyer.composite_score >= 55
                  ? 'text-amber-600'
                  : 'text-muted-foreground',
            )}
          >
            {buyer.composite_score}
          </span>

          <div className="w-px h-5 bg-border mx-0.5" />

          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs gap-1 bg-green-50 border-green-300 text-green-700 hover:bg-green-100 hover:border-green-500"
            onClick={() => onAccept(buyer)}
            disabled={isAccepting}
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Accept
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs gap-1 bg-red-50 border-red-300 text-red-700 hover:bg-red-100 hover:border-red-500"
            onClick={() => onReject(buyer)}
          >
            <X className="h-3.5 w-3.5" />
            Reject
          </Button>
        </div>
      </div>

      {/* Why they're a good fit */}
      {buyer.fit_reason && (
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mt-2.5 pt-2.5 border-t">
          {buyer.fit_reason}
        </p>
      )}
    </div>
  );
}

const ACTION_CONFIG: Record<string, { label: string; color: string; icon: typeof Plus }> = {
  inserted: { label: 'New', color: 'bg-green-100 text-green-800', icon: Plus },
  enriched_existing: { label: 'Updated', color: 'bg-blue-100 text-blue-800', icon: Check },
  probable_duplicate: { label: 'Duplicate', color: 'bg-gray-100 text-gray-600', icon: Copy },
  cached: { label: 'Cached', color: 'bg-purple-100 text-purple-800', icon: Check },
};

function SeedResultsSummary({ results }: { results: SeedBuyerResult[] }) {
  const inserted = results.filter((r) => r.action === 'inserted').length;
  const enriched = results.filter((r) => r.action === 'enriched_existing').length;
  const dupes = results.filter((r) => r.action === 'probable_duplicate').length;
  const [isOpen, setIsOpen] = useState(true);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border rounded-lg bg-muted/30 p-3 space-y-2">
        <CollapsibleTrigger asChild>
          <button className="flex items-center justify-between w-full cursor-pointer hover:opacity-80 transition-opacity">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-purple-600" />
              AI Search Results
            </div>
            <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isOpen && 'rotate-180')} />
          </button>
        </CollapsibleTrigger>
        <div className="flex items-center gap-3 text-xs">
          {inserted > 0 && <span className="text-green-700">{inserted} new buyers added</span>}
          {enriched > 0 && <span className="text-blue-700">{enriched} existing updated</span>}
          {dupes > 0 && <span className="text-gray-500">{dupes} duplicates skipped</span>}
        </div>
        <CollapsibleContent>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {results.slice(0, 10).map((result) => {
              const config = ACTION_CONFIG[result.action] || ACTION_CONFIG.inserted;
              const Icon = config.icon;
              return (
                <div key={result.buyer_id} className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className={cn('text-[10px] shrink-0', config.color)}>
                    <Icon className="h-2.5 w-2.5 mr-0.5" />
                    {config.label}
                  </Badge>
                  <span className="truncate font-medium">{result.company_name}</span>
                </div>
              );
            })}
            {results.length > 10 && (
              <p className="text-[10px] text-muted-foreground">+{results.length - 10} more</p>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function RecommendedBuyersPanel({ listingId, listingTitle }: RecommendedBuyersPanelProps) {
  const { data, isLoading, isError, error, refresh } = useNewRecommendedBuyers(listingId);
  const seedMutation = useSeedBuyers();
  const { introductions, createIntroduction } = useBuyerIntroductions(listingId);
  const [refreshing, setRefreshing] = useState(false);
  const [seedResults, setSeedResults] = useState<SeedBuyerResult[] | null>(null);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());
  const [acceptingIds, setAcceptingIds] = useState<Set<string>>(new Set());
  const [internalVisible, setInternalVisible] = useState(PAGE_SIZE);
  const [externalVisible, setExternalVisible] = useState(PAGE_SIZE);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
      toast.success('Recommendations refreshed');
    } catch (err) {
      toast.error('Failed to refresh recommendations');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSeedBuyers = async () => {
    setSeedResults(null);
    try {
      // AI search always runs without buyerCategory filter — Opus finds the best buyers across all types
      const result = await seedMutation.mutateAsync({ listingId, forceRefresh: false });
      setSeedResults(result.seeded_buyers);
      if (result.cached) {
        toast.info(`Found ${result.total} cached AI-seeded buyers`);
      } else {
        toast.success(
          `AI seeded ${result.total} buyers: ${result.inserted || 0} new, ${result.enriched_existing || 0} updated`,
        );
      }
      // Auto-refresh scores with forceRefresh so newly seeded buyers appear
      // (the server-side 4h score cache would otherwise return stale data)
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to seed buyers');
    }
  };

  const handleAccept = async (buyer: BuyerScore) => {
    if (acceptingIds.has(buyer.buyer_id)) return; // prevent double-click
    setAcceptingIds((prev) => new Set([...prev, buyer.buyer_id]));
    try {
      await new Promise<void>((resolve, reject) => {
        createIntroduction(
          {
            remarketing_buyer_id: buyer.buyer_id,
            listing_id: listingId,
            buyer_name: buyer.company_name,
            buyer_firm_name: buyer.pe_firm_name || buyer.company_name,
            company_name: listingTitle || buyer.company_name,
            targeting_reason: buyer.fit_reason,
            score_snapshot: {
              composite_score: buyer.composite_score,
              service_score: buyer.service_score,
              geography_score: buyer.geography_score,
              size_score: buyer.size_score,
              bonus_score: buyer.bonus_score,
              fit_signals: buyer.fit_signals,
              fit_reason: buyer.fit_reason,
              tier: buyer.tier,
              source: buyer.source,
              buyer_type: buyer.buyer_type,
              hq_city: buyer.hq_city,
              hq_state: buyer.hq_state,
              has_fee_agreement: buyer.has_fee_agreement,
              pe_firm_name: buyer.pe_firm_name,
              pe_firm_id: buyer.pe_firm_id,
              acquisition_appetite: buyer.acquisition_appetite,
              company_website: buyer.company_website,
            },
          },
          {
            onSuccess: () => resolve(),
            onError: (err: Error) => reject(err),
          },
        );
      });
      setAcceptedIds((prev) => new Set([...prev, buyer.buyer_id]));
    } catch {
      // onError in the mutation already shows a toast — buyer stays visible for retry
    } finally {
      setAcceptingIds((prev) => {
        const next = new Set(prev);
        next.delete(buyer.buyer_id);
        return next;
      });
    }
  };

  const handleReject = (buyer: BuyerScore) => {
    setRejectedIds((prev) => new Set([...prev, buyer.buyer_id]));
    toast.info(`${buyer.company_name} removed from recommendations`);
  };

  // Build a set of buyer IDs that already have introductions (persisted in DB).
  // This ensures accepted buyers stay hidden even after refresh or new AI searches.
  // NOTE: Must be called before any early returns to satisfy React's Rules of Hooks.
  const introducedBuyerIds = useMemo(() => {
    const ids = new Set<string>();
    for (const intro of introductions) {
      if (intro.remarketing_buyer_id) ids.add(intro.remarketing_buyer_id);
      // Fallback: also check contact_id for legacy rows created before the migration
      else if (intro.contact_id) ids.add(intro.contact_id);
    }
    return ids;
  }, [introductions]);

  const allBuyers = data?.buyers || [];
  const available = allBuyers.filter(
    (b) =>
      !acceptedIds.has(b.buyer_id) &&
      !rejectedIds.has(b.buyer_id) &&
      !introducedBuyerIds.has(b.buyer_id),
  );
  const allInternal = available.filter(isInternal);
  const allExternal = available.filter((b) => !isInternal(b));
  const internalBuyers = allInternal.slice(0, internalVisible);
  const externalBuyers = allExternal.slice(0, externalVisible);
  const buyers = [...allInternal, ...allExternal];

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Recommended Buyers
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    const errorMsg = error instanceof Error ? error.message : 'Failed to load recommendations';
    const isAuthError =
      errorMsg.toLowerCase().includes('unauthorized') ||
      errorMsg.toLowerCase().includes('forbidden');
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Recommended Buyers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <AlertCircle className="h-8 w-8 text-destructive/60" />
            <p className="text-sm font-medium text-destructive">
              {isAuthError ? 'Access Denied' : 'Scoring Failed'}
            </p>
            <p className="text-xs text-muted-foreground max-w-md">{errorMsg}</p>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            Recommended Buyers
          </CardTitle>
          {buyers.length > 0 && <TierSummary buyers={buyers} />}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSeedBuyers}
            disabled={seedMutation.isPending}
          >
            <Sparkles
              className={cn('h-3.5 w-3.5 mr-1.5', seedMutation.isPending && 'animate-pulse')}
            />
            {seedMutation.isPending ? 'Searching...' : 'AI Search Buyers'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', refreshing && 'animate-spin')} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {seedResults && seedResults.length > 0 && (
          <div className="mb-4">
            <SeedResultsSummary results={seedResults} />
          </div>
        )}
        {buyers.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Users className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No buyer recommendations yet. Click Refresh to score buyers.
            </p>
          </div>
        ) : (
          <Tabs defaultValue="internal" className="w-full">
            <TabsList className="mb-3">
              <TabsTrigger value="internal" className="gap-1.5">
                <Database className="h-3.5 w-3.5" />
                Internal
                {allInternal.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-0.5">
                    {allInternal.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="external" className="gap-1.5">
                <Globe className="h-3.5 w-3.5" />
                External
                {allExternal.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-0.5">
                    {allExternal.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="internal" className="space-y-1.5 mt-0">
              {allInternal.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No matching buyers from your buyer pool
                </p>
              ) : (
                <>
                  {internalBuyers.map((buyer) => (
                    <BuyerCard
                      key={buyer.buyer_id}
                      buyer={buyer}
                      onAccept={handleAccept}
                      onReject={handleReject}
                      isAccepting={acceptingIds.has(buyer.buyer_id)}
                    />
                  ))}
                  {allInternal.length > internalVisible && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setInternalVisible((prev) => prev + PAGE_SIZE)}
                    >
                      Show More ({allInternal.length - internalVisible} remaining)
                    </Button>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="external" className="space-y-1.5 mt-0">
              {allExternal.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <Globe className="h-6 w-6 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    No AI-discovered buyers yet. Click "AI Search Buyers" to discover new matches.
                  </p>
                </div>
              ) : (
                <>
                  {externalBuyers.map((buyer) => (
                    <BuyerCard
                      key={buyer.buyer_id}
                      buyer={buyer}
                      onAccept={handleAccept}
                      onReject={handleReject}
                      isAccepting={acceptingIds.has(buyer.buyer_id)}
                    />
                  ))}
                  {allExternal.length > externalVisible && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setExternalVisible((prev) => prev + PAGE_SIZE)}
                    >
                      Show More ({allExternal.length - externalVisible} remaining)
                    </Button>
                  )}
                </>
              )}
            </TabsContent>

            {data?.cached && (
              <p className="text-[10px] text-muted-foreground text-right mt-2">
                Cached results from {new Date(data.scored_at).toLocaleString()}
              </p>
            )}
          </Tabs>
        )}
      </CardContent>
    </Card>
  );
}
