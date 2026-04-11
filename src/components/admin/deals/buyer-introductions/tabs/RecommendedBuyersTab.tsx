import { useState, useCallback, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
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
import { useNewRecommendedBuyers, type BuyerScore, type BuyerLookupResult } from '@/hooks/admin/use-new-recommended-buyers';
import { useSeedBuyers, type SeedBuyerResult } from '@/hooks/admin/use-seed-buyers';
import { useBuyerSearchJob } from '@/hooks/admin/use-buyer-search-job';
import { BuyerSearchSummaryDialog } from '@/components/admin/deals/buyer-introductions/BuyerSearchSummaryDialog';
import { useBuyerIntroductions } from '@/hooks/use-buyer-introductions';
import { untypedFrom } from '@/integrations/supabase/client';
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
  Mic,
  Filter,
  Search,
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
    await untypedFrom('buyer_discovery_feedback').upsert(
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
  const navigate = useNavigate();
  const location = useLocation();

  const websiteUrl = buyer.platform_website || buyer.company_website;

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
            {buyer.pe_firm_name ? (
              <>
                {buyer.pe_firm_id ? (
                  <Link to={`/admin/buyers/pe-firms/${buyer.pe_firm_id}`}>
                    <span className="font-semibold text-[15px] hover:underline truncate">
                      {buyer.pe_firm_name}
                    </span>
                  </Link>
                ) : (
                  <span className="font-semibold text-[15px] truncate">
                    {buyer.pe_firm_name}
                  </span>
                )}
                <span className="text-muted-foreground text-[13px]">/</span>
                <span
                  className="text-[13px] text-muted-foreground hover:underline hover:text-foreground truncate cursor-pointer"
                  onClick={() => navigate(`/admin/buyers/${buyer.buyer_id}`, { state: { from: location.pathname } })}
                >
                  {buyer.company_name}
                </span>
              </>
            ) : (
              <span
                className="font-semibold text-[15px] hover:underline truncate cursor-pointer"
                onClick={() => navigate(`/admin/buyers/${buyer.buyer_id}`, { state: { from: location.pathname } })}
              >
                {buyer.company_name}
              </span>
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
            {websiteUrl && (
              <a
                href={websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`}
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
                  <DropdownMenuItem onClick={() => navigate(`/admin/buyers/${buyer.buyer_id}`, { state: { from: location.pathname } })}>
                    <ExternalLink className="h-3.5 w-3.5 mr-2" />
                    View Profile
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

      {/* Transcript-extracted insights */}
      {buyer.transcript_summary && (
        <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-dashed">
          <Mic className="h-3.5 w-3.5 text-indigo-500 mt-0.5 shrink-0" />
          <p className="text-xs text-indigo-700 italic leading-relaxed">
            {buyer.transcript_summary}
          </p>
        </div>
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
  const { data, isLoading, isError, error, refresh, lookupBuyer } = useNewRecommendedBuyers(listingId);
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
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  const [internalPage, setInternalPage] = useState(0);
  const [externalPage, setExternalPage] = useState(0);
  // Rejection dialog state
  const [rejectingBuyer, setRejectingBuyer] = useState<BuyerScore | null>(null);
  // Search summary dialog state
  const [summaryDialogOpen, setSummaryDialogOpen] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryCached, setSummaryCached] = useState(false);
  // Buyer mode toggle: 'platforms' shows only PE-backed, 'all' shows everything
  const [buyerMode, setBuyerMode] = useState<'platforms' | 'all'>('platforms');
  // "Why Not?" buyer lookup state
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResult, setLookupResult] = useState<BuyerLookupResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

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

  const handleLookupBuyer = async () => {
    if (!lookupQuery.trim()) return;
    setLookupLoading(true);
    setLookupResult(null);
    try {
      // Search for buyer by name in the database
      const { data: matchingBuyers } = await untypedFrom('buyers')
        .select('id, company_name')
        .ilike('company_name', `%${lookupQuery.trim()}%`)
        .eq('archived', false)
        .limit(1);

      if (!matchingBuyers || matchingBuyers.length === 0) {
        toast.error(`No buyer found matching "${lookupQuery}"`);
        return;
      }

      const result = await lookupBuyer(matchingBuyers[0].id);
      setLookupResult(result);
    } catch {
      toast.error('Failed to look up buyer');
    } finally {
      setLookupLoading(false);
    }
  };

  const handleSeedBuyers = async () => {
    setSeedResults(null);
    setSummaryError(null);
    setSummaryCached(false);
    try {
      // Create a job for progress tracking
      const jobId = await createJob(listingTitle);

      // forceRefresh: true ensures clicking this button always runs a fresh Claude search instead
      // of returning stale cached results from a previous run.
      // When in "All Buyers" mode, pass 'all_types' to expand AI search beyond PE-backed platforms.
      const result = await seedMutation.mutateAsync({
        listingId,
        forceRefresh: true,
        jobId,
        buyerCategory: buyerMode === 'all' ? 'all_types' : undefined,
      });
      setSeedResults(result.seeded_buyers);
      setSummaryCached(!!result.cached);
      setSummaryDialogOpen(true);
      // Reset pagination so user sees newly seeded buyers
      setInternalPage(0);
      setExternalPage(0);
      await refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to seed buyers';
      setSummaryError(msg);
      setSummaryDialogOpen(true);
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
                platform_website: buyer.platform_website,
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
    [
      acceptingIds,
      createIntroduction,
      listingId,
      listingTitle,
      nicheCategory,
      listingIndustry,
      listingCategories,
    ],
  );

  const handleBatchAdd = async () => {
    const buyersToAdd = (data?.buyers || []).filter(
      (b) =>
        selectedIds.has(b.buyer_id) &&
        !pipelineBuyerIds.has(b.buyer_id) &&
        !acceptedIds.has(b.buyer_id),
    );
    if (buyersToAdd.length === 0) return;
    let successCount = 0;
    setBulkProgress({ current: 0, total: buyersToAdd.length });
    for (let i = 0; i < buyersToAdd.length; i++) {
      try {
        await handleAccept(buyersToAdd[i]);
        successCount++;
      } catch {
        // individual error already handled in handleAccept
      }
      setBulkProgress({ current: i + 1, total: buyersToAdd.length });
    }
    setSelectedIds(new Set());
    setBulkProgress(null);
    if (successCount > 0) {
      toast.success(`Added ${successCount} buyer${successCount === 1 ? '' : 's'} to pipeline`);
    }
  };

  const handleDismissClick = useCallback((buyer: BuyerScore) => {
    setRejectingBuyer(buyer);
  }, []);

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

  // Auto-deselect buyers that are already in the pipeline or were just accepted
  useEffect(() => {
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of prev) {
        if (pipelineBuyerIds.has(id) || acceptedIds.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pipelineBuyerIds, acceptedIds]);

  const allBuyers = data?.buyers || [];
  const available = allBuyers.filter(
    (b) => !acceptedIds.has(b.buyer_id) && !dismissedIds.has(b.buyer_id),
  );
  // Apply platform/all filter: in "platforms" mode, only show PE-backed buyers in internal tab
  const isPlatformBuyer = (b: BuyerScore) => b.is_pe_backed || b.buyer_type === 'private_equity';
  const allInternalUnfiltered = available.filter(isInternal);
  const allInternal = buyerMode === 'platforms'
    ? allInternalUnfiltered.filter(isPlatformBuyer)
    : allInternalUnfiltered;
  const allExternal = available.filter((b) => !isInternal(b));
  const platformCount = allInternalUnfiltered.filter(isPlatformBuyer).length;
  const allCount = allInternalUnfiltered.length;
  const internalBuyers = allInternal.slice(
    internalPage * PAGE_SIZE,
    (internalPage + 1) * PAGE_SIZE,
  );
  const externalBuyers = allExternal.slice(
    externalPage * PAGE_SIZE,
    (externalPage + 1) * PAGE_SIZE,
  );
  const internalTotalPages = Math.max(1, Math.ceil(allInternal.length / PAGE_SIZE));
  const externalTotalPages = Math.max(1, Math.ceil(allExternal.length / PAGE_SIZE));
  const buyers = [...allInternal, ...allExternal];
  const selectableBuyers = buyers.filter(
    (b) => !pipelineBuyerIds.has(b.buyer_id) && !acceptedIds.has(b.buyer_id),
  );
  const allSelected = selectableBuyers.length > 0 && selectableBuyers.every((b) => selectedIds.has(b.buyer_id));

  const handleToggleSelectAll = useCallback(() => {
    setSelectedIds(() => {
      if (allSelected) {
        return new Set();
      }
      return new Set(selectableBuyers.map((b) => b.buyer_id));
    });
  }, [allSelected, selectableBuyers]);

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
          {selectableBuyers.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleToggleSelectAll}
              className="text-xs"
            >
              <Checkbox
                checked={allSelected}
                className="h-3.5 w-3.5 mr-1.5 pointer-events-none"
                tabIndex={-1}
              />
              {allSelected ? 'Deselect All' : 'Select All'}
            </Button>
          )}
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
          {job.status === 'failed' && job.progress_message && (
            <p className="text-xs text-destructive">{job.progress_message}</p>
          )}
          {job.status !== 'failed' && job.progress_message && (
            <p className="text-xs text-muted-foreground">{job.progress_message}</p>
          )}
          {job.status === 'completed' && job.buyers_found > 0 && (
            <p className="text-xs text-emerald-600">
              Found {job.buyers_found} buyers ({job.buyers_inserted} new, {job.buyers_updated}{' '}
              updated)
            </p>
          )}
        </div>
      )}

      {seedResults && seedResults.length > 0 && <SeedResultsSummary results={seedResults} />}

      {/* Batch action bar */}
      {(selectedIds.size > 0 || bulkProgress) && (
        <div className="sticky top-0 z-20 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 space-y-2 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm text-green-700 font-medium">
              {bulkProgress
                ? `Adding ${bulkProgress.current} of ${bulkProgress.total}...`
                : `${selectedIds.size} buyer${selectedIds.size === 1 ? '' : 's'} selected`}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setSelectedIds(new Set())}
                disabled={!!bulkProgress}
              >
                <X className="h-3.5 w-3.5 mr-1" />
                Clear Selection
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700"
                onClick={handleBatchAdd}
                disabled={!!bulkProgress}
              >
                {bulkProgress ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ArrowRight className="h-3.5 w-3.5" />
                )}
                {bulkProgress ? 'Adding...' : `Add Selected to Pipeline`}
              </Button>
            </div>
          </div>
          {bulkProgress && (
            <Progress
              value={(bulkProgress.current / bulkProgress.total) * 100}
              className="h-1.5"
            />
          )}
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
        <>
        {/* Platform / All Buyers toggle */}
        <div className="flex items-center gap-1 mb-3">
          <Filter className="h-3.5 w-3.5 text-muted-foreground mr-1" />
          <Button
            variant={buyerMode === 'platforms' ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => { setBuyerMode('platforms'); setInternalPage(0); }}
          >
            Platforms ({platformCount})
          </Button>
          <Button
            variant={buyerMode === 'all' ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs"
            onClick={() => { setBuyerMode('all'); setInternalPage(0); }}
          >
            All Buyers ({allCount})
          </Button>
        </div>

        {/* "Why Not?" Buyer Lookup */}
        <Collapsible className="mb-3">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer">
              <Search className="h-3 w-3" />
              Why isn't a buyer showing up?
              <ChevronDown className="h-3 w-3" />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search buyer by name..."
                value={lookupQuery}
                onChange={(e) => setLookupQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLookupBuyer()}
                className="h-8 text-xs flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={handleLookupBuyer}
                disabled={lookupLoading || !lookupQuery.trim()}
              >
                {lookupLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                Lookup
              </Button>
            </div>
            {lookupResult && (
              <div className="mt-2 border rounded-lg p-3 bg-muted/30 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    {lookupResult.score?.company_name || lookupResult.buyer_id}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={() => setLookupResult(null)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <p className="text-muted-foreground font-medium">{lookupResult.status}</p>
                {lookupResult.score && (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-1 border-t">
                    <span>Service score:</span>
                    <span className="font-medium">{lookupResult.score.service_score}/100</span>
                    <span>Geography score:</span>
                    <span className="font-medium">{lookupResult.score.geography_score}/100</span>
                    <span>Composite:</span>
                    <span className="font-bold">{lookupResult.score.composite_score}</span>
                    <span>Tier:</span>
                    <span className="font-medium">{lookupResult.score.tier}</span>
                    {lookupResult.score.fit_signals.length > 0 && (
                      <>
                        <span className="col-span-2 pt-1 border-t text-muted-foreground">
                          Signals: {lookupResult.score.fit_signals.join(' · ')}
                        </span>
                      </>
                    )}
                  </div>
                )}
                {lookupResult.was_rejected && (
                  <p className="text-red-600 font-medium">Rejected on this deal (hard excluded)</p>
                )}
                {lookupResult.was_niche_rejected && (
                  <p className="text-amber-600 font-medium">Rejected on a similar deal (-15 penalty)</p>
                )}
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

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
        </>
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

      {/* AI Search Summary Dialog */}
      <BuyerSearchSummaryDialog
        open={summaryDialogOpen}
        onOpenChange={setSummaryDialogOpen}
        results={seedResults}
        cached={summaryCached}
        error={summaryError}
      />
    </div>
  );
}
