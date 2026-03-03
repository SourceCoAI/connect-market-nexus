import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useBuyerIntroductions } from '@/hooks/use-buyer-introductions';
import { useNewRecommendedBuyers, type BuyerScore } from '@/hooks/admin/use-new-recommended-buyers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Target,
  CheckCircle,
  ThumbsDown,
  Search,
  UserPlus,
  Calendar,
  Send,
  MapPin,
  FileCheck,
  ChevronRight,
  Zap,
  Star,
  HelpCircle,
  ExternalLink,
  X,
  Trash2,
  Globe,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type {
  BuyerIntroduction,
  IntroductionStatus,
  ScoreSnapshot,
} from '@/types/buyer-introductions';
import { AddBuyerIntroductionDialog } from './AddBuyerIntroductionDialog';
import { UpdateIntroductionStatusDialog } from './UpdateIntroductionStatusDialog';

interface BuyerIntroductionTrackerProps {
  listingId: string;
  listingTitle?: string;
}

const STATUS_CONFIG: Record<
  IntroductionStatus,
  { label: string; color: string; icon: typeof CheckCircle }
> = {
  outreach_initiated: {
    label: 'Outreach Initiated',
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    icon: Send,
  },
  meeting_scheduled: {
    label: 'Meeting Scheduled',
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: Calendar,
  },
  not_a_fit: {
    label: 'Not a Fit',
    color: 'bg-slate-100 text-slate-600 border-slate-200',
    icon: ThumbsDown,
  },
  fit_and_interested: {
    label: 'Fit & Interested',
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    icon: CheckCircle,
  },
};

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
    independent_sponsor: 'Ind. Sponsor',
    search_fund: 'Search Fund',
    individual_buyer: 'Individual',
  };
  return map[type] || type.replace('_', ' ');
}

export function BuyerIntroductionTracker({
  listingId,
  listingTitle,
}: BuyerIntroductionTrackerProps) {
  const {
    introductions,
    notIntroduced,
    introducedAndPassed,
    isLoading,
    batchArchiveIntroductions,
    isBatchArchiving,
    sendBuyerToUniverse,
    isSendingToUniverse,
  } = useBuyerIntroductions(listingId);
  const { data: scoredData } = useNewRecommendedBuyers(listingId);

  // Fetch the deal's assigned buyer universe
  const { data: universeAssignment } = useQuery({
    queryKey: ['remarketing', 'deal-universe', listingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('remarketing_universe_deals')
        .select('id, universe_id, remarketing_buyer_universes(id, name)')
        .eq('listing_id', listingId)
        .eq('status', 'active')
        .maybeSingle();

      if (error) throw error;
      return data as { id: string; universe_id: string; remarketing_buyer_universes: { id: string; name: string } } | null;
    },
    enabled: !!listingId,
  });

  // Build a lookup map: buyer_id → BuyerScore (shares React Query cache with RecommendedBuyersPanel)
  const scoreMap = useMemo(() => {
    const map = new Map<string, BuyerScore>();
    if (scoredData?.buyers) {
      for (const b of scoredData.buyers) map.set(b.buyer_id, b);
    }
    return map;
  }, [scoredData]);

  const [searchQuery, setSearchQuery] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedBuyer, setSelectedBuyer] = useState<BuyerIntroduction | null>(null);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);

  // Checkbox selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Get names of selected buyers for the confirmation dialog
  const selectedBuyerNames = useMemo(() => {
    return introductions.filter((i) => selectedIds.has(i.id)).map((i) => i.buyer_name);
  }, [introductions, selectedIds]);

  const handleRemoveSelected = useCallback(() => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    batchArchiveIntroductions(ids, {
      onSuccess: () => {
        setSelectedIds(new Set());
        setConfirmRemoveOpen(false);
      },
    });
  }, [selectedIds, batchArchiveIntroductions]);

  const filteredNotIntroduced = useMemo(() => {
    if (!searchQuery) return notIntroduced;
    const q = searchQuery.toLowerCase();
    return notIntroduced.filter(
      (b) => b.buyer_name.toLowerCase().includes(q) || b.buyer_firm_name.toLowerCase().includes(q),
    );
  }, [notIntroduced, searchQuery]);

  const filteredIntroducedPassed = useMemo(() => {
    if (!searchQuery) return introducedAndPassed;
    const q = searchQuery.toLowerCase();
    return introducedAndPassed.filter(
      (b) => b.buyer_name.toLowerCase().includes(q) || b.buyer_firm_name.toLowerCase().includes(q),
    );
  }, [introducedAndPassed, searchQuery]);

  // Select-all helpers for each section
  const allNotIntroducedSelected =
    filteredNotIntroduced.length > 0 && filteredNotIntroduced.every((b) => selectedIds.has(b.id));
  const someNotIntroducedSelected = filteredNotIntroduced.some((b) => selectedIds.has(b.id));
  const toggleAllNotIntroduced = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allNotIntroducedSelected) {
        filteredNotIntroduced.forEach((b) => next.delete(b.id));
      } else {
        filteredNotIntroduced.forEach((b) => next.add(b.id));
      }
      return next;
    });
  }, [allNotIntroducedSelected, filteredNotIntroduced]);

  const allIntroducedSelected =
    filteredIntroducedPassed.length > 0 &&
    filteredIntroducedPassed.every((b) => selectedIds.has(b.id));
  const someIntroducedSelected = filteredIntroducedPassed.some((b) => selectedIds.has(b.id));
  const toggleAllIntroduced = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allIntroducedSelected) {
        filteredIntroducedPassed.forEach((b) => next.delete(b.id));
      } else {
        filteredIntroducedPassed.forEach((b) => next.add(b.id));
      }
      return next;
    });
  }, [allIntroducedSelected, filteredIntroducedPassed]);

  // Stats
  const stats = {
    total: introductions.length,
    notIntroduced: notIntroduced.length,
    fitAndInterested: introductions.filter((i) => i.introduction_status === 'fit_and_interested')
      .length,
    notAFit: introductions.filter((i) => i.introduction_status === 'not_a_fit').length,
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  return (
    <>
      {/* ─── Selection Action Bar ─── */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-20 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <Badge variant="secondary" className="text-xs font-semibold">
              {selectedIds.size} selected
            </Badge>
            <span className="text-sm text-blue-700">
              {selectedBuyerNames.slice(0, 3).join(', ')}
              {selectedBuyerNames.length > 3 && ` +${selectedBuyerNames.length - 3} more`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={clearSelection}
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setConfirmRemoveOpen(true)}
              disabled={isBatchArchiving}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove from Deal
            </Button>
          </div>
        </div>
      )}

      {/* ─── Section 1: Buyers to Introduce to Deal ─── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4" />
              Buyers to Introduce to Deal
              {filteredNotIntroduced.length > 0 && (
                <Badge variant="secondary" className="text-xs ml-1">
                  {filteredNotIntroduced.length}
                </Badge>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Buyers queued for introduction — click a buyer to update their status
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 w-48 text-xs"
              />
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => setAddDialogOpen(true)}>
              <UserPlus className="h-3.5 w-3.5" />
              Add Buyer
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {filteredNotIntroduced.length === 0 ? (
            <div className="py-8 text-center">
              <Target className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                {searchQuery
                  ? 'No buyers matching your search'
                  : 'No buyers in the introduction pipeline yet'}
              </p>
              {!searchQuery && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 gap-2"
                  onClick={() => setAddDialogOpen(true)}
                >
                  <UserPlus className="h-4 w-4" />
                  Add First Buyer
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Select all for this section */}
              <div className="flex items-center gap-2 pb-1">
                <Checkbox
                  checked={allNotIntroducedSelected}
                  ref={undefined}
                  onCheckedChange={toggleAllNotIntroduced}
                  className={cn(
                    'h-4 w-4',
                    someNotIntroducedSelected && !allNotIntroducedSelected && 'opacity-60',
                  )}
                />
                <span className="text-xs text-muted-foreground">Select all</span>
              </div>
              {filteredNotIntroduced.map((buyer) => (
                <IntroductionBuyerRow
                  key={buyer.id}
                  buyer={buyer}
                  score={(buyer.remarketing_buyer_id || buyer.contact_id) ? scoreMap.get((buyer.remarketing_buyer_id || buyer.contact_id)!) : undefined}
                  selected={selectedIds.has(buyer.id)}
                  onToggleSelect={toggleSelection}
                  onSelect={(b) => {
                    setSelectedBuyer(b);
                    setUpdateDialogOpen(true);
                  }}
                  universeAssignment={universeAssignment}
                  onSendToUniverse={sendBuyerToUniverse}
                  isSendingToUniverse={isSendingToUniverse}
                />
              ))}
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Section 2: Buyers Introduced ─── */}
      <Card>
        <CardHeader className="pb-4">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle className="h-4 w-4" />
              Buyers Introduced
              {filteredIntroducedPassed.length > 0 && (
                <Badge variant="secondary" className="text-xs ml-1">
                  {filteredIntroducedPassed.length}
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>Buyers that have been evaluated for this deal</span>
              {stats.fitAndInterested > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200"
                >
                  {stats.fitAndInterested} Fit & Interested
                </Badge>
              )}
              {stats.notAFit > 0 && (
                <Badge
                  variant="outline"
                  className="text-[10px] bg-slate-50 text-slate-600 border-slate-200"
                >
                  {stats.notAFit} Not a Fit
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {filteredIntroducedPassed.length === 0 ? (
            <div className="py-8 text-center">
              <CheckCircle className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                {searchQuery
                  ? 'No introduced buyers matching your search'
                  : 'No buyers have been introduced yet'}
              </p>
            </div>
          ) : (
            <>
              {/* Select all for this section */}
              <div className="flex items-center gap-2 pb-1">
                <Checkbox
                  checked={allIntroducedSelected}
                  ref={undefined}
                  onCheckedChange={toggleAllIntroduced}
                  className={cn(
                    'h-4 w-4',
                    someIntroducedSelected && !allIntroducedSelected && 'opacity-60',
                  )}
                />
                <span className="text-xs text-muted-foreground">Select all</span>
              </div>
              {filteredIntroducedPassed.map((buyer) => (
                <IntroducedBuyerRow
                  key={buyer.id}
                  buyer={buyer}
                  score={(buyer.remarketing_buyer_id || buyer.contact_id) ? scoreMap.get((buyer.remarketing_buyer_id || buyer.contact_id)!) : undefined}
                  selected={selectedIds.has(buyer.id)}
                  onToggleSelect={toggleSelection}
                  onSelect={(b) => {
                    setSelectedBuyer(b);
                    setUpdateDialogOpen(true);
                  }}
                  universeAssignment={universeAssignment}
                  onSendToUniverse={sendBuyerToUniverse}
                  isSendingToUniverse={isSendingToUniverse}
                />
              ))}
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AddBuyerIntroductionDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        listingId={listingId}
        listingTitle={listingTitle || 'This Deal'}
      />

      {selectedBuyer && (
        <UpdateIntroductionStatusDialog
          open={updateDialogOpen}
          onOpenChange={(open) => {
            setUpdateDialogOpen(open);
            if (!open) setSelectedBuyer(null);
          }}
          buyer={selectedBuyer}
          listingId={listingId}
        />
      )}

      {/* Confirm Remove Dialog */}
      <AlertDialog open={confirmRemoveOpen} onOpenChange={setConfirmRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {selectedIds.size} buyer{selectedIds.size === 1 ? '' : 's'} from deal?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the selected buyers from this deal's introduction pipeline. They will
              still exist in your buyer pool and can be re-added later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-32 overflow-y-auto text-sm text-muted-foreground px-1">
            {selectedBuyerNames.map((name, i) => (
              <div key={i} className="py-0.5">
                &bull; {name}
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBatchArchiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveSelected}
              disabled={isBatchArchiving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isBatchArchiving ? 'Removing...' : 'Remove from Deal'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface UniverseAssignmentData {
  id: string;
  universe_id: string;
  remarketing_buyer_universes: { id: string; name: string };
}

// ─── Introduction Buyer Row (matches RecommendedBuyersPanel BuyerCard style) ───
function IntroductionBuyerRow({
  buyer,
  score,
  selected,
  onToggleSelect,
  onSelect,
  universeAssignment,
  onSendToUniverse,
  isSendingToUniverse,
}: {
  buyer: BuyerIntroduction;
  score?: BuyerScore;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onSelect: (b: BuyerIntroduction) => void;
  universeAssignment?: UniverseAssignmentData | null;
  onSendToUniverse: (args: { buyer: BuyerIntroduction; universeId: string }) => void;
  isSendingToUniverse: boolean;
}) {
  const config = STATUS_CONFIG[buyer.introduction_status];
  const StatusIcon = config.icon;
  const snap = buyer.score_snapshot as ScoreSnapshot | null;

  // Use live score data → persisted snapshot → raw introduction data
  const displayName = score?.company_name || buyer.buyer_name;
  const firmName =
    score?.pe_firm_name ||
    snap?.pe_firm_name ||
    (buyer.buyer_firm_name !== buyer.buyer_name ? buyer.buyer_firm_name : null);
  const location = score
    ? score.hq_city && score.hq_state
      ? `${score.hq_city}, ${score.hq_state}`
      : score.hq_state || formatBuyerType(score.buyer_type)
    : snap
      ? snap.hq_city && snap.hq_state
        ? `${snap.hq_city}, ${snap.hq_state}`
        : snap.hq_state || formatBuyerType(snap.buyer_type)
      : buyer.internal_champion || '';
  const fitReason = score?.fit_reason || snap?.fit_reason || buyer.targeting_reason;
  const fitSignals = score?.fit_signals || snap?.fit_signals || [];
  const tierKey = score?.tier || snap?.tier;
  const tier = tierKey ? TIER_CONFIG[tierKey] : null;
  const sourceKey = score?.source || snap?.source;
  const sourceBadge = sourceKey ? SOURCE_BADGE[sourceKey] || SOURCE_BADGE.scored : null;
  const compositeScore = score?.composite_score ?? snap?.composite_score;
  const hasFeeAgreement = score?.has_fee_agreement ?? snap?.has_fee_agreement ?? false;
  const companyWebsite = score?.company_website || snap?.company_website || null;

  return (
    <div
      className={cn(
        'border rounded-lg px-3.5 py-3 hover:shadow-md transition-shadow shadow-sm',
        selected && 'ring-2 ring-blue-400 bg-blue-50/30',
      )}
    >
      {/* Top row — matches BuyerCard layout */}
      <div className="flex items-center gap-3">
        {/* Checkbox */}
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(buyer.id)}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 shrink-0"
        />

        {/* Name + firm */}
        <div className="shrink-0 min-w-[180px]">
          <div className="flex items-center gap-1.5">
            {(buyer.remarketing_buyer_id || buyer.contact_id) ? (
              <Link to={`/admin/buyers/${buyer.remarketing_buyer_id || buyer.contact_id}`}>
                <span className="font-semibold text-[15px] hover:underline truncate">
                  {displayName}
                </span>
              </Link>
            ) : (
              <span className="font-semibold text-[15px] truncate">{displayName}</span>
            )}
            {firmName &&
              (() => {
                const firmId = score?.pe_firm_id || snap?.pe_firm_id;
                return (
                  <>
                    <span className="text-muted-foreground text-[13px]">/</span>
                    {firmId ? (
                      <Link to={`/admin/buyers/pe-firms/${firmId}`}>
                        <span className="text-[13px] text-muted-foreground hover:underline hover:text-foreground truncate">
                          {firmName}
                        </span>
                      </Link>
                    ) : (
                      <span className="text-[13px] text-muted-foreground truncate">{firmName}</span>
                    )}
                  </>
                );
              })()}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
            {location && (
              <>
                <MapPin className="h-3 w-3" />
                {location}
              </>
            )}
            {hasFeeAgreement && (
              <span className="flex items-center gap-0.5 text-green-600 ml-1">
                <FileCheck className="h-3 w-3" />
                Fee
              </span>
            )}
            {companyWebsite && (
              <a
                href={
                  companyWebsite.startsWith('http') ? companyWebsite : `https://${companyWebsite}`
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

        {/* Fit signal tags */}
        <div className="flex-1 flex flex-wrap gap-1 min-w-0">
          {fitSignals.slice(0, 3).map((signal, i) => (
            <span
              key={i}
              className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium whitespace-nowrap"
            >
              {signal}
            </span>
          ))}
        </div>

        {/* Source + Tier + Score + Status + Action */}
        <div className="flex items-center gap-2 shrink-0">
          {sourceBadge && (
            <Badge variant="outline" className={cn('text-[11px]', sourceBadge.color)}>
              {sourceBadge.label}
            </Badge>
          )}

          {tier && (
            <Badge variant="outline" className={cn('text-xs gap-0.5', tier.color)}>
              <tier.icon className="h-3 w-3" />
              {tier.label}
            </Badge>
          )}

          {compositeScore != null && (
            <span
              className={cn(
                'text-base font-bold min-w-[26px] text-right tabular-nums',
                compositeScore >= 70
                  ? 'text-emerald-600'
                  : compositeScore >= 55
                    ? 'text-amber-600'
                    : 'text-muted-foreground',
              )}
            >
              {compositeScore}
            </span>
          )}

          <Badge variant="outline" className={cn('text-xs gap-0.5', config.color)}>
            <StatusIcon className="h-3 w-3" />
            {config.label}
          </Badge>

          <div className="w-px h-5 bg-border mx-0.5" />

          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs gap-1 hover:bg-blue-50 hover:border-blue-500 hover:text-blue-700"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(buyer);
            }}
          >
            <ChevronRight className="h-3.5 w-3.5" />
            Update
          </Button>

          {universeAssignment && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs gap-1 hover:bg-purple-50 hover:border-purple-500 hover:text-purple-700"
                  disabled={isSendingToUniverse}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSendToUniverse({ buyer, universeId: universeAssignment.universe_id });
                  }}
                >
                  {isSendingToUniverse ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Globe className="h-3.5 w-3.5" />
                  )}
                  Universe
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Send to {universeAssignment.remarketing_buyer_universes.name}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Fit reason line */}
      {fitReason && (
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mt-2.5 pt-2.5 border-t ml-7">
          {fitReason}
        </p>
      )}
    </div>
  );
}

// ─── Introduced & Passed Buyer Row (same BuyerCard style) ───
function IntroducedBuyerRow({
  buyer,
  score,
  selected,
  onToggleSelect,
  onSelect,
  universeAssignment,
  onSendToUniverse,
  isSendingToUniverse,
}: {
  buyer: BuyerIntroduction;
  score?: BuyerScore;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onSelect: (b: BuyerIntroduction) => void;
  universeAssignment?: UniverseAssignmentData | null;
  onSendToUniverse: (args: { buyer: BuyerIntroduction; universeId: string }) => void;
  isSendingToUniverse: boolean;
}) {
  const config = STATUS_CONFIG[buyer.introduction_status];
  const StatusIcon = config.icon;
  const snap = buyer.score_snapshot as ScoreSnapshot | null;

  const daysSinceIntroduction = buyer.introduction_date
    ? Math.floor((Date.now() - new Date(buyer.introduction_date).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Use live score data → persisted snapshot → raw introduction data
  const displayName = score?.company_name || buyer.buyer_name;
  const firmName =
    score?.pe_firm_name ||
    snap?.pe_firm_name ||
    (buyer.buyer_firm_name !== buyer.buyer_name ? buyer.buyer_firm_name : null);
  const location = score
    ? score.hq_city && score.hq_state
      ? `${score.hq_city}, ${score.hq_state}`
      : score.hq_state || formatBuyerType(score.buyer_type)
    : snap
      ? snap.hq_city && snap.hq_state
        ? `${snap.hq_city}, ${snap.hq_state}`
        : snap.hq_state || formatBuyerType(snap.buyer_type)
      : '';
  const fitReason = score?.fit_reason || snap?.fit_reason || buyer.targeting_reason;
  const fitSignals = score?.fit_signals || snap?.fit_signals || [];
  const tierKey = score?.tier || snap?.tier;
  const tier = tierKey ? TIER_CONFIG[tierKey] : null;
  const sourceKey = score?.source || snap?.source;
  const sourceBadge = sourceKey ? SOURCE_BADGE[sourceKey] || SOURCE_BADGE.scored : null;
  const compositeScore = score?.composite_score ?? snap?.composite_score;
  const hasFeeAgreement = score?.has_fee_agreement ?? snap?.has_fee_agreement ?? false;
  const companyWebsite = score?.company_website || snap?.company_website || null;

  return (
    <div
      className={cn(
        'border rounded-lg px-3.5 py-3 hover:shadow-md transition-shadow shadow-sm',
        selected && 'ring-2 ring-blue-400 bg-blue-50/30',
      )}
    >
      {/* Top row */}
      <div className="flex items-center gap-3">
        {/* Checkbox */}
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelect(buyer.id)}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 shrink-0"
        />

        {/* Name + firm */}
        <div className="shrink-0 min-w-[180px]">
          <div className="flex items-center gap-1.5">
            {(buyer.remarketing_buyer_id || buyer.contact_id) ? (
              <Link to={`/admin/buyers/${buyer.remarketing_buyer_id || buyer.contact_id}`}>
                <span className="font-semibold text-[15px] hover:underline truncate">
                  {displayName}
                </span>
              </Link>
            ) : (
              <span className="font-semibold text-[15px] truncate">{displayName}</span>
            )}
            {firmName &&
              (() => {
                const firmId = score?.pe_firm_id || snap?.pe_firm_id;
                return (
                  <>
                    <span className="text-muted-foreground text-[13px]">/</span>
                    {firmId ? (
                      <Link to={`/admin/buyers/pe-firms/${firmId}`}>
                        <span className="text-[13px] text-muted-foreground hover:underline hover:text-foreground truncate">
                          {firmName}
                        </span>
                      </Link>
                    ) : (
                      <span className="text-[13px] text-muted-foreground truncate">{firmName}</span>
                    )}
                  </>
                );
              })()}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
            {location ? (
              <>
                <MapPin className="h-3 w-3" />
                {location}
              </>
            ) : buyer.introduced_by ? (
              <>
                <MapPin className="h-3 w-3" />
                Intro by {buyer.introduced_by}
              </>
            ) : null}
            {hasFeeAgreement && (
              <span className="flex items-center gap-0.5 text-green-600 ml-1">
                <FileCheck className="h-3 w-3" />
                Fee
              </span>
            )}
            {companyWebsite && (
              <a
                href={
                  companyWebsite.startsWith('http') ? companyWebsite : `https://${companyWebsite}`
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
            {daysSinceIntroduction !== null && (
              <span className="ml-1">{daysSinceIntroduction}d in pipeline</span>
            )}
          </div>
        </div>

        {/* Fit signal tags + next step tags */}
        <div className="flex-1 flex flex-wrap gap-1 min-w-0">
          {fitSignals.slice(0, 3).map((signal, i) => (
            <span
              key={i}
              className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium whitespace-nowrap"
            >
              {signal}
            </span>
          ))}
          {buyer.next_step && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium whitespace-nowrap truncate max-w-[200px]">
              Next: {buyer.next_step}
            </span>
          )}
          {buyer.expected_next_step_date && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium whitespace-nowrap">
              <Calendar className="h-3 w-3 inline mr-0.5" />
              {format(new Date(buyer.expected_next_step_date), 'MMM d')}
            </span>
          )}
        </div>

        {/* Source + Tier + Score + Status + Action */}
        <div className="flex items-center gap-2 shrink-0">
          {sourceBadge && (
            <Badge variant="outline" className={cn('text-[11px]', sourceBadge.color)}>
              {sourceBadge.label}
            </Badge>
          )}

          {tier && (
            <Badge variant="outline" className={cn('text-xs gap-0.5', tier.color)}>
              <tier.icon className="h-3 w-3" />
              {tier.label}
            </Badge>
          )}

          {compositeScore != null && (
            <span
              className={cn(
                'text-base font-bold min-w-[26px] text-right tabular-nums',
                compositeScore >= 70
                  ? 'text-emerald-600'
                  : compositeScore >= 55
                    ? 'text-amber-600'
                    : 'text-muted-foreground',
              )}
            >
              {compositeScore}
            </span>
          )}

          <Badge variant="outline" className={cn('text-xs gap-0.5', config.color)}>
            <StatusIcon className="h-3 w-3" />
            {config.label}
          </Badge>

          <div className="w-px h-5 bg-border mx-0.5" />

          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs gap-1 hover:bg-blue-50 hover:border-blue-500 hover:text-blue-700"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(buyer);
            }}
          >
            <ChevronRight className="h-3.5 w-3.5" />
            Update
          </Button>

          {universeAssignment && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs gap-1 hover:bg-purple-50 hover:border-purple-500 hover:text-purple-700"
                  disabled={isSendingToUniverse}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSendToUniverse({ buyer, universeId: universeAssignment.universe_id });
                  }}
                >
                  {isSendingToUniverse ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Globe className="h-3.5 w-3.5" />
                  )}
                  Universe
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Send to {universeAssignment.remarketing_buyer_universes.name}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Fit reason or feedback line */}
      {(fitReason || buyer.buyer_feedback) && (
        <div className="mt-2.5 pt-2.5 border-t space-y-1.5 ml-7">
          {fitReason && (
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{fitReason}</p>
          )}
          {buyer.buyer_feedback && (
            <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed italic">
              &ldquo;{buyer.buyer_feedback}&rdquo;
            </p>
          )}
        </div>
      )}
    </div>
  );
}
