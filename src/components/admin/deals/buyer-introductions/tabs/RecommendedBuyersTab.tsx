import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useNewRecommendedBuyers, type BuyerScore } from '@/hooks/admin/use-new-recommended-buyers';
import { useSeedBuyers, type SeedBuyerResult } from '@/hooks/admin/use-seed-buyers';
import { useBuyerSearchJob } from '@/hooks/admin/use-buyer-search-job';
import { useBuyerIntroductions } from '@/hooks/use-buyer-introductions';
import { supabase } from '@/integrations/supabase/client';
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
  MoreHorizontal,
  ArrowRight,
  Ban,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface RecommendedBuyersTabProps {
  listingId: string;
  listingTitle?: string;
  listingIndustry?: string;
  listingCategories?: string[];
  pipelineBuyerIds: Set<string>;
}

const REJECTION_REASONS = [
  { value: 'wrong_industry', label: 'Wrong Industry' },
  { value: 'not_pe_backed', label: 'Not PE-Backed' },
  { value: 'pe_firm_not_platform', label: 'PE Firm, Not Platform' },
  { value: 'too_small', label: 'Too Small' },
  { value: 'too_large', label: 'Too Large' },
  { value: 'wrong_geography', label: 'Wrong Geography' },
  { value: 'no_longer_active', label: 'No Longer Active' },
  { value: 'already_contacted', label: 'Already Contacted' },
  { value: 'not_a_fit_other', label: 'Other' },
] as const;

/** Record buyer discovery feedback to the database for the feedback loop */
async function recordFeedback(params: {
  listingId: string;
  buyer: BuyerScore;
  action: 'accepted' | 'rejected';
  reason?: string;
  reasonCategory?: string;
  nicheCategory: string;
  dealIndustry?: string;
  dealCategories?: string[];
}) {
  try {
    await (supabase as any).from('buyer_discovery_feedback').upsert(
      {
        listing_id: params.listingId,
        buyer_id: params.buyer.buyer_id,
        buyer_name: params.buyer.company_name,
        pe_firm_name: params.buyer.pe_firm_name,
        action: params.action,
        reason: params.reason || null,
        reason_category: params.reasonCategory || null,
        niche_category: params.nicheCategory,
        deal_industry: params.dealIndustry || null,
        deal_categories: params.dealCategories || null,
        buyer_type: params.buyer.buyer_type,
        buyer_source: params.buyer.source,
        composite_score: params.buyer.composite_score,
        service_score: params.buyer.service_score,
      },
      { onConflict: 'listing_id,buyer_id,action' },
    );
  } catch (err) {
    console.error('Failed to record buyer feedback (non-fatal):', err);
  }
}

const PAGE_SIZE = 5;

const TIER_CONFIG: Record<BuyerScore['tier'], { label: string; color: string; icon: typeof Zap }> = {
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
  onDismiss,
  isAccepting,
  isInPipeline,
  isSelected,
  onToggleSelect,
}: {
  buyer: BuyerScore;
  onAccept: (buyer: BuyerScore) => void;
  onDismiss: (buyer: BuyerScore) => void;
  isAccepting?: boolean;
  isInPipeline?: boolean;
  isSelected: boolean;
  onToggleSelect: (buyerId: string) => void;
}) {
  const tier = TIER_CONFIG[buyer.tier];
  const TierIcon = tier.icon;
  const sourceBadge = SOURCE_BADGE[buyer.source] || SOURCE_BADGE.scored;

  return (
    <div
      className={cn(
        'border rounded-lg px-3.5 py-3 hover:shadow-md transition-shadow shadow-sm',
        isSelected && 'ring-2 ring-blue-400 bg-blue-50/30',
        isInPipeline && 'opacity-70',
      )}
    >
      <div className="flex items-center gap-3">
        {/* Checkbox */}
        {!isInPipeline && (
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect(buyer.buyer_id)}
            className="h-4 w-4 shrink-0"
          />
        )}

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
            {isInPipeline && (
              <Badge
                variant="outline"
                className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 gap-0.5"
              >
                <CheckCircle className="h-2.5 w-2.5" />
                In Pipeline
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
            <MapPin className="h-3 w-3" />
            {buyer.hq_city && buyer.hq_state
              ? `${buyer.hq_city}, ${buyer.hq_state}`
              : buyer.hq_state || ''}
            {buyer.has_fee_agreement && (
              <span className="flex items-center gap-0.5 text-green-600 ml-1">
                <FileCheck className="h-3 w-3" />
                Fee
              </span>
            )}
            {buyer.company_website && (
              <a
                href={
                  buyer.company_website.startsWith('http')
                    ? buyer.company_website
                    : `https://${buyer.company_website}`
                }
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

          {isInPipeline ? (
            <span className="text-xs text-muted-foreground px-2">Already added</span>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs gap-1 bg-green-50 border-green-300 text-green-700 hover:bg-green-100 hover:border-green-500"
                onClick={() => onAccept(buyer)}
                disabled={isAccepting}
              >
                <Check className="h-3.5 w-3.5" />
                Approve Introduction
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs gap-1 bg-red-50 border-red-300 text-red-700 hover:bg-red-100 hover:border-red-500"
                onClick={() => onDismiss(buyer)}
              >
                <Ban className="h-3.5 w-3.5" />
                Not a Fit
              </Button>

              {/* Overflow menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link to={`/admin/buyers/${buyer.buyer_id}`}>
                      <ExternalLink className="h-3.5 w-3.5 mr-2" />
                      View Profile
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      {/* Why they're a good fit */}
      {buyer.fit_reason && (
        <p className="text-sm text-gray-700 leading-relaxed mt-2.5 pt-2.5 border-t">
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
          <button className="flex items-center justify-between w-full cursor-pointer hover:opacity-80">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-purple-600" />
              AI Search Results
            </div>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-muted-foreground transition-transform',
                isOpen && 'rotate-180',
              )}
            />
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

export function RecommendedBuyersTab({
  listingId,
  listingTitle,
  listingIndustry,
  listingCategories,
  pipelineBuyerIds,
}: RecommendedBuyersTabProps) {
  const { data, isLoading, isError, error, refresh } = useNewRecommendedBuyers(listingId);
  const seedMutation = useSeedBuyers();
  const { job, createJob, dismiss: dismissJob } = useBuyerSearchJob(listingId);
  const { createIntroduction } = useBuyerIntroductions(listingId);
  const [refreshing, setRefreshing] = useState(false);
  const [seedResults, setSeedResults] = useState<SeedBuyerResult[] | null>(null);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [acceptingIds, setAcceptingIds] = useState<Set<string>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(`dismissed-buyers-${listingId}`);
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
    } catch {
      return new Set();
    }
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [internalPage, setInternalPage] = useState(0);
  const [externalPage, setExternalPage] = useState(0);
  // Rejection dialog state
  const [rejectingBuyer, setRejectingBuyer] = useState<BuyerScore | null>(null);

  const nicheCategory = listingIndustry || listingCategories?.[0] || 'general';

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
      toast.success('Recommendations refreshed');
    } catch {
      toast.error('Failed to refresh recommendations');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSeedBuyers = async () => {
    setSeedResults(null);
    try {
      // Create a job for progress tracking
      const jobId = await createJob(listingTitle);

      // forceRefresh: true ensures clicking this button always runs a fresh Claude search instead
      // of returning stale cached results from a previous run.
      const result = await seedMutation.mutateAsync({ listingId, forceRefresh: true, jobId });
      setSeedResults(result.seeded_buyers);
      if (result.cached) {
        toast.info(`Found ${result.total} cached AI-seeded buyers`);
      } else {
        toast.success(
          `AI seeded ${result.total} buyers: ${result.inserted || 0} new, ${result.enriched_existing || 0} updated`,
        );
      }
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to seed buyers');
    }
  };

  const handleAccept = useCallback(
    async (buyer: BuyerScore) => {
      if (acceptingIds.has(buyer.buyer_id)) return;
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
                is_publicly_traded: buyer.is_publicly_traded ?? null,
                is_pe_backed: buyer.is_pe_backed ?? false,
              },
            },
            {
              onSuccess: () => resolve(),
              onError: (err: Error) => reject(err),
            },
          );
        });
        setAcceptedIds((prev) => new Set([...prev, buyer.buyer_id]));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(buyer.buyer_id);
          return next;
        });
        // Record acceptance feedback for the feedback loop
        recordFeedback({
          listingId,
          buyer,
          action: 'accepted',
          nicheCategory,
          dealIndustry: listingIndustry,
          dealCategories: listingCategories,
        });
      } catch {
        // toast already shown by mutation
      } finally {
        setAcceptingIds((prev) => {
          const next = new Set(prev);
          next.delete(buyer.buyer_id);
          return next;
        });
      }
    },
    [acceptingIds, createIntroduction, listingId, listingTitle, nicheCategory, listingIndustry, listingCategories],
  );

  const handleBatchAdd = async () => {
    const buyersToAdd = (data?.buyers || []).filter(
      (b) =>
        selectedIds.has(b.buyer_id) &&
        !pipelineBuyerIds.has(b.buyer_id) &&
        !acceptedIds.has(b.buyer_id),
    );
    let successCount = 0;
    for (const buyer of buyersToAdd) {
      try {
        await handleAccept(buyer);
        successCount++;
      } catch {
        // individual error already handled in handleAccept
      }
    }
    setSelectedIds(new Set());
    if (successCount > 0) {
      toast.success(`Added ${successCount} buyer${successCount === 1 ? '' : 's'} to pipeline`);
    }
  };

  const handleDismissClick = useCallback(
    (buyer: BuyerScore) => {
      setRejectingBuyer(buyer);
    },
    [],
  );

  const handleDismissConfirm = useCallback(
    (reasonCategory?: string, reason?: string) => {
      if (!rejectingBuyer) return;
      const buyer = rejectingBuyer;
      setDismissedIds((prev) => {
        const next = new Set([...prev, buyer.buyer_id]);
        try {
          localStorage.setItem(`dismissed-buyers-${listingId}`, JSON.stringify([...next]));
        } catch {
          // localStorage full or unavailable
        }
        return next;
      });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(buyer.buyer_id);
        return next;
      });
      // Record rejection feedback for the feedback loop
      recordFeedback({
        listingId,
        buyer,
        action: 'rejected',
        reason,
        reasonCategory,
        nicheCategory,
        dealIndustry: listingIndustry,
        dealCategories: listingCategories,
      });
      toast.success(`${buyer.company_name} marked as not a fit`);
      setRejectingBuyer(null);
    },
    [rejectingBuyer, listingId, nicheCategory, listingIndustry, listingCategories],
  );

  const toggleSelect = useCallback((buyerId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(buyerId)) next.delete(buyerId);
      else next.add(buyerId);
      return next;
    });
  }, []);

  const allBuyers = data?.buyers || [];
  const available = allBuyers.filter(
    (b) => !acceptedIds.has(b.buyer_id) && !dismissedIds.has(b.buyer_id),
  );
  const allInternal = available.filter(isInternal);
  const allExternal = available.filter((b) => !isInternal(b));
  const internalBuyers = allInternal.slice(internalPage * PAGE_SIZE, (internalPage + 1) * PAGE_SIZE);
  const externalBuyers = allExternal.slice(externalPage * PAGE_SIZE, (externalPage + 1) * PAGE_SIZE);
  const internalTotalPages = Math.max(1, Math.ceil(allInternal.length / PAGE_SIZE));
  const externalTotalPages = Math.max(1, Math.ceil(allExternal.length / PAGE_SIZE));
  const buyers = [...allInternal, ...allExternal];

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    const errorMsg = error instanceof Error ? error.message : 'Failed to load recommendations';
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertCircle className="h-8 w-8 text-destructive/60" />
        <p className="text-sm font-medium text-destructive">Scoring Failed</p>
        <p className="text-xs text-muted-foreground max-w-md">{errorMsg}</p>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" />
              Recommended Buyers
            </h3>
            {buyers.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {buyers.length}
              </Badge>
            )}
          </div>
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
      </div>

      {/* AI Search Progress Bar */}
      {job && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {job.status === 'failed' ? (
                <AlertCircle className="h-4 w-4 text-destructive" />
              ) : job.status === 'completed' ? (
                <CheckCircle className="h-4 w-4 text-emerald-600" />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              )}
              <span className="text-sm font-medium text-foreground">
                {job.status === 'completed'
                  ? 'Search Complete'
                  : job.status === 'failed'
                    ? 'Search Failed'
                    : 'AI Buyer Search'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{job.progress_pct}%</span>
              {(job.status === 'completed' || job.status === 'failed') && (
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={dismissJob}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
          <Progress value={job.progress_pct} className="h-1.5" />
          {job.progress_message && (
            <p className="text-xs text-muted-foreground">{job.progress_message}</p>
          )}
          {job.error && (
            <p className="text-xs text-destructive">{job.error}</p>
          )}
          {job.status === 'completed' && job.buyers_found > 0 && (
            <p className="text-xs text-emerald-600">
              Found {job.buyers_found} buyers ({job.buyers_inserted} new, {job.buyers_updated} updated)
            </p>
          )}
        </div>
      )}

      {seedResults && seedResults.length > 0 && <SeedResultsSummary results={seedResults} />}

      {/* Batch action bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-20 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 flex items-center justify-between shadow-sm">
          <span className="text-sm text-green-700 font-medium">
            {selectedIds.size} buyer{selectedIds.size === 1 ? '' : 's'} selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Clear
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700"
              onClick={handleBatchAdd}
            >
              <ArrowRight className="h-3.5 w-3.5" />
              Approve {selectedIds.size} Selected
            </Button>
          </div>
        </div>
      )}

      {buyers.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
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
                    onDismiss={handleDismissClick}
                    isAccepting={acceptingIds.has(buyer.buyer_id)}
                    isInPipeline={pipelineBuyerIds.has(buyer.buyer_id)}
                    isSelected={selectedIds.has(buyer.buyer_id)}
                    onToggleSelect={toggleSelect}
                  />
                ))}
                {internalTotalPages > 1 && (
                  <div className="flex items-center justify-between pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setInternalPage((p) => p - 1)}
                      disabled={internalPage === 0}
                    >
                      Previous
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Page {internalPage + 1} of {internalTotalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setInternalPage((p) => p + 1)}
                      disabled={internalPage >= internalTotalPages - 1}
                    >
                      Next
                    </Button>
                  </div>
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
                    onDismiss={handleDismissClick}
                    isAccepting={acceptingIds.has(buyer.buyer_id)}
                    isInPipeline={pipelineBuyerIds.has(buyer.buyer_id)}
                    isSelected={selectedIds.has(buyer.buyer_id)}
                    onToggleSelect={toggleSelect}
                  />
                ))}
                {externalTotalPages > 1 && (
                  <div className="flex items-center justify-between pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setExternalPage((p) => p - 1)}
                      disabled={externalPage === 0}
                    >
                      Previous
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      Page {externalPage + 1} of {externalTotalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setExternalPage((p) => p + 1)}
                      disabled={externalPage >= externalTotalPages - 1}
                    >
                      Next
                    </Button>
                  </div>
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

      {/* Rejection Reason Dialog */}
      <Dialog open={!!rejectingBuyer} onOpenChange={(open) => !open && setRejectingBuyer(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              Why isn't {rejectingBuyer?.company_name} a fit?
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 py-3">
            {REJECTION_REASONS.map((reason) => (
              <Button
                key={reason.value}
                variant="outline"
                size="sm"
                className="h-9 text-xs justify-start"
                onClick={() => handleDismissConfirm(reason.value, reason.label)}
              >
                {reason.label}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => handleDismissConfirm()}
            >
              Skip — just dismiss
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
