import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useNewRecommendedBuyers,
  type BuyerScore,
} from '@/hooks/admin/use-new-recommended-buyers';
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
  Briefcase,
  Landmark,
  Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface RecommendedBuyersPanelProps {
  listingId: string;
}

const MAX_BUYERS = 5;

const TIER_CONFIG: Record<BuyerScore['tier'], { label: string; color: string; icon: typeof Zap }> = {
  move_now: { label: 'Move Now', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: Zap },
  strong: { label: 'Strong', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: Star },
  speculative: { label: 'Speculative', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: HelpCircle },
};

const SOURCE_BADGE: Record<BuyerScore['source'], { label: string; color: string }> = {
  ai_seeded:   { label: 'AI Search',   color: 'bg-purple-100 text-purple-700' },
  marketplace: { label: 'Marketplace', color: 'bg-blue-100 text-blue-700' },
  scored:      { label: 'Buyer Pool',  color: 'bg-gray-100 text-gray-600' },
};

function formatBuyerType(type: string | null): string {
  if (!type) return '';
  const map: Record<string, string> = {
    pe_firm: 'PE Firm',
    platform: 'Platform',
    strategic: 'Strategic',
    family_office: 'Family Office',
  };
  return map[type] || type.replace('_', ' ');
}

/** Sponsors = PE firms, independent sponsors, family offices, search funds */
const SPONSOR_TYPES = new Set(['pe_firm', 'family_office', 'independent_sponsor', 'search_fund']);

/** Keywords in company name that indicate a sponsor/financial buyer */
const SPONSOR_NAME_KEYWORDS = /\b(capital|partners|equity|investment|ventures|advisors|fund|holdings|group)\b/i;

function isSponsor(buyer: BuyerScore): boolean {
  if (buyer.buyer_type && SPONSOR_TYPES.has(buyer.buyer_type)) return true;
  if (buyer.pe_firm_name) return true;
  if (SPONSOR_NAME_KEYWORDS.test(buyer.company_name)) return true;
  return false;
}

function TierSummary({ buyers }: { buyers: BuyerScore[] }) {
  const moveNow = buyers.filter(b => b.tier === 'move_now').length;
  const strong = buyers.filter(b => b.tier === 'strong').length;
  const speculative = buyers.filter(b => b.tier === 'speculative').length;

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
        {/* Icon */}
        <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
        </div>

        {/* Name + location */}
        <div className="shrink-0 min-w-[160px]">
          <div className="flex items-center gap-1.5">
            <Link to={`/admin/buyers/${buyer.buyer_id}`}>
              <span className="font-semibold text-[13.5px] hover:underline truncate">
                {buyer.company_name}
              </span>
            </Link>
            {buyer.pe_firm_name && (
              <>
                <span className="text-muted-foreground text-xs">/</span>
                {buyer.pe_firm_id ? (
                  <Link to={`/admin/buyers/pe-firms/${buyer.pe_firm_id}`}>
                    <span className="text-xs text-muted-foreground hover:underline truncate">
                      {buyer.pe_firm_name}
                    </span>
                  </Link>
                ) : (
                  <span className="text-xs text-muted-foreground truncate">{buyer.pe_firm_name}</span>
                )}
              </>
            )}
          </div>
          <div className="flex items-center gap-1 text-[11.5px] text-muted-foreground mt-0.5">
            <MapPin className="h-2.5 w-2.5" />
            {buyer.hq_city && buyer.hq_state
              ? `${buyer.hq_city}, ${buyer.hq_state}`
              : buyer.hq_state || buyer.buyer_type
                ? formatBuyerType(buyer.buyer_type)
                : ''}
            {buyer.has_fee_agreement && (
              <span className="flex items-center gap-0.5 text-green-600 ml-1">
                <FileCheck className="h-2.5 w-2.5" />
                Fee
              </span>
            )}
          </div>
        </div>

        {/* Tags */}
        <div className="flex-1 flex flex-wrap gap-1 min-w-0">
          {buyer.fit_signals.slice(0, 3).map((signal, i) => (
            <span
              key={i}
              className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium whitespace-nowrap"
            >
              {signal}
            </span>
          ))}
        </div>

        {/* Source + Tier + Score + Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className={cn('text-[10px]', sourceBadge.color)}>
            {sourceBadge.label}
          </Badge>

          <Badge variant="outline" className={cn('text-[11px] gap-0.5', tier.color)}>
            <TierIcon className="h-3 w-3" />
            {tier.label}
          </Badge>

          <span className={cn(
            'text-[15px] font-bold min-w-[26px] text-right tabular-nums',
            buyer.composite_score >= 70 ? 'text-emerald-600' :
            buyer.composite_score >= 55 ? 'text-amber-600' : 'text-muted-foreground',
          )}>
            {buyer.composite_score}
          </span>

          <div className="w-px h-5 bg-border mx-0.5" />

          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs gap-1 hover:bg-green-50 hover:border-green-500 hover:text-green-700"
            onClick={() => onAccept(buyer)}
            disabled={isAccepting}
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Accept
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs gap-1 hover:bg-red-50 hover:border-red-400 hover:text-red-600"
            onClick={() => onReject(buyer)}
          >
            <X className="h-3.5 w-3.5" />
            Reject
          </Button>
        </div>
      </div>

      {/* Why they're a good fit */}
      {buyer.fit_reason && (
        <p className="text-xs text-muted-foreground leading-relaxed mt-2.5 pt-2.5 border-t pl-11">
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
  const inserted = results.filter(r => r.action === 'inserted').length;
  const enriched = results.filter(r => r.action === 'enriched_existing').length;
  const dupes = results.filter(r => r.action === 'probable_duplicate').length;

  return (
    <div className="border rounded-lg bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="h-4 w-4 text-purple-600" />
        AI Search Results
      </div>
      <div className="flex items-center gap-3 text-xs">
        {inserted > 0 && (
          <span className="text-green-700">{inserted} new buyers added</span>
        )}
        {enriched > 0 && (
          <span className="text-blue-700">{enriched} existing updated</span>
        )}
        {dupes > 0 && (
          <span className="text-gray-500">{dupes} duplicates skipped</span>
        )}
      </div>
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
    </div>
  );
}

export function RecommendedBuyersPanel({ listingId }: RecommendedBuyersPanelProps) {
  const { data, isLoading, isError, error, refresh } = useNewRecommendedBuyers(listingId);
  const seedMutation = useSeedBuyers();
  const { createIntroduction } = useBuyerIntroductions(listingId);
  const [refreshing, setRefreshing] = useState(false);
  const [seedResults, setSeedResults] = useState<SeedBuyerResult[] | null>(null);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());
  const [acceptingIds, setAcceptingIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'sponsors' | 'operating'>('sponsors');

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
    const buyerCategory = activeTab === 'sponsors' ? 'sponsors' as const : 'operating_companies' as const;
    try {
      const result = await seedMutation.mutateAsync({ listingId, forceRefresh: false, buyerCategory });
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
    setAcceptingIds(prev => new Set([...prev, buyer.buyer_id]));
    try {
      await new Promise<void>((resolve, reject) => {
        createIntroduction(
          {
            listing_id: listingId,
            buyer_name: buyer.company_name,
            buyer_firm_name: buyer.pe_firm_name || '',
            company_name: buyer.company_name,
            targeting_reason: buyer.fit_reason,
          },
          {
            onSuccess: () => resolve(),
            onError: (err: Error) => reject(err),
          },
        );
      });
      setAcceptedIds(prev => new Set([...prev, buyer.buyer_id]));
    } catch {
      // onError in the mutation already shows a toast — buyer stays visible for retry
    } finally {
      setAcceptingIds(prev => {
        const next = new Set(prev);
        next.delete(buyer.buyer_id);
        return next;
      });
    }
  };

  const handleReject = (buyer: BuyerScore) => {
    setRejectedIds(prev => new Set([...prev, buyer.buyer_id]));
    toast.info(`${buyer.company_name} removed from recommendations`);
  };

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
    const isAuthError = errorMsg.toLowerCase().includes('unauthorized') || errorMsg.toLowerCase().includes('forbidden');
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
            <p className="text-xs text-muted-foreground max-w-md">
              {errorMsg}
            </p>
            <Button variant="outline" size="sm" onClick={handleRefresh}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const allBuyers = data?.buyers || [];
  const available = allBuyers.filter(b => !acceptedIds.has(b.buyer_id) && !rejectedIds.has(b.buyer_id));
  const sponsors = available.filter(isSponsor).slice(0, MAX_BUYERS);
  const operatingCos = available.filter(b => !isSponsor(b)).slice(0, MAX_BUYERS);
  const buyers = [...sponsors, ...operatingCos];

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
            <Sparkles className={cn('h-3.5 w-3.5 mr-1.5', seedMutation.isPending && 'animate-pulse')} />
            {seedMutation.isPending ? 'Searching...' : activeTab === 'sponsors' ? 'AI Search Sponsors' : 'AI Search Operating Cos'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
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
          <Tabs defaultValue="sponsors" className="w-full" onValueChange={(v) => setActiveTab(v as 'sponsors' | 'operating')}>
            <TabsList className="mb-3">
              <TabsTrigger value="sponsors" className="gap-1.5">
                <Landmark className="h-3.5 w-3.5" />
                Sponsors
                {sponsors.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-0.5">
                    {sponsors.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="operating" className="gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                Operating Companies
                {operatingCos.length > 0 && (
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-0.5">
                    {operatingCos.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="sponsors" className="space-y-1.5 mt-0">
              {sponsors.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No sponsors found</p>
              ) : (
                sponsors.map(buyer => (
                  <BuyerCard
                    key={buyer.buyer_id}
                    buyer={buyer}
                    onAccept={handleAccept}
                    onReject={handleReject}
                    isAccepting={acceptingIds.has(buyer.buyer_id)}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="operating" className="space-y-1.5 mt-0">
              {operatingCos.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No operating companies found</p>
              ) : (
                operatingCos.map(buyer => (
                  <BuyerCard
                    key={buyer.buyer_id}
                    buyer={buyer}
                    onAccept={handleAccept}
                    onReject={handleReject}
                    isAccepting={acceptingIds.has(buyer.buyer_id)}
                  />
                ))
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
