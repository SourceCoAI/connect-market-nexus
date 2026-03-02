import { useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useSimpleListings } from '@/hooks/use-simple-listings';
import { useAllSavedListingIds } from '@/hooks/marketplace/use-saved-listings';
import { useAllConnectionStatuses } from '@/hooks/marketplace/use-connections';
import ListingCard from '@/components/ListingCard';
import { Button } from '@/components/ui/button';
import { Sparkles, Settings2, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { computeMatchScore, extractBuyerCriteria } from '@/lib/match-scoring';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

export function MatchedDealsSection() {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();
  const { data: listingsData } = useSimpleListings({
    page: 1,
    perPage: 50,
    search: '',
    category: '',
    location: '',
    revenueMin: undefined,
    revenueMax: undefined,
    ebitdaMin: undefined,
    ebitdaMax: undefined,
  });
  const { data: savedIds } = useAllSavedListingIds();
  const { data: connectionMap } = useAllConnectionStatuses();

  const {
    buyerCategories,
    buyerLocations,
    revenueMin,
    revenueMax,
    ebitdaMin,
    ebitdaMax,
    dealIntent,
    criteriaCount,
  } = useMemo(() => extractBuyerCriteria(user ?? null), [user]);

  const matchedListings = useMemo(() => {
    if (!listingsData?.listings || criteriaCount < 2) return [];

    const scored = listingsData.listings
      .filter((listing) => {
        // Exclude already saved or connected listings
        const isSaved = savedIds?.has(listing.id);
        const isConnected = connectionMap?.has(listing.id);
        return !isSaved && !isConnected;
      })
      .map((listing) => ({
        listing,
        ...computeMatchScore(
          listing,
          buyerCategories,
          buyerLocations,
          revenueMin,
          revenueMax,
          ebitdaMin,
          ebitdaMax,
          dealIntent,
        ),
      }))
      .filter((item) => item.score >= 2)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    return scored;
  }, [
    listingsData?.listings,
    buyerCategories,
    buyerLocations,
    revenueMin,
    revenueMax,
    ebitdaMin,
    ebitdaMax,
    dealIntent,
    savedIds,
    connectionMap,
    criteriaCount,
  ]);

  if (!user || user.is_admin) return null;

  // Not enough criteria — show prompt
  if (criteriaCount < 2) {
    return (
      <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-lg">
        <div className="flex items-start gap-3">
          <Sparkles className="h-5 w-5 text-slate-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-slate-700">
              Complete your profile to see deals matched to your criteria
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Add your target sectors, geography, and deal size to get personalised deal
              recommendations.
            </p>
            <Link
              to="/welcome"
              className="text-xs font-medium text-slate-700 hover:text-slate-900 underline mt-2 inline-block"
            >
              Complete your profile →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (matchedListings.length === 0) return null;

  // Build criteria summary for header
  const criteriaSummary = [
    buyerCategories.length > 0 ? buyerCategories.slice(0, 2).join(', ') : null,
    buyerLocations.length > 0 ? (buyerLocations as string[]).slice(0, 2).join(', ') : null,
    user?.revenue_range_min || user?.revenue_range_max
      ? `$${user?.revenue_range_min || '0'}–$${user?.revenue_range_max || '∞'} revenue`
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <TooltipProvider>
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className={isOpen ? 'mb-8' : 'mb-4'}>
        <div className="flex items-center justify-between">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-2 group cursor-pointer">
              <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`} />
              <Sparkles className="h-4 w-4 text-purple-600" />
              <h2 className="text-lg font-semibold">Matched for You ({matchedListings.length})</h2>
              {!isOpen && criteriaSummary && (
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  — {criteriaSummary}
                </span>
              )}
            </button>
          </CollapsibleTrigger>
          <Link to="/profile">
            <Button variant="ghost" size="sm" className="text-xs gap-1.5 text-muted-foreground">
              <Settings2 className="h-3 w-3" />
              Update criteria
            </Button>
          </Link>
        </div>

        {isOpen && criteriaSummary && (
          <p className="text-xs text-muted-foreground mt-0.5 ml-10">
            Based on your acquisition profile — {criteriaSummary}
          </p>
        )}

        <CollapsibleContent className="mt-3">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {matchedListings.map(({ listing, reasons }) => (
              <div key={listing.id} className="relative">
                <ListingCard
                  listing={listing}
                  viewType="grid"
                  savedIds={savedIds}
                  connectionMap={connectionMap}
                />
                {reasons.length > 0 && (
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <button className="absolute top-2 right-2 bg-purple-100 text-purple-700 text-[10px] font-medium px-2 py-0.5 rounded-full hover:bg-purple-200 transition-colors z-10">
                        Why matched
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="left" className="max-w-xs p-3">
                      <p className="text-xs font-medium mb-1.5">Match reasons:</p>
                      <ul className="space-y-1">
                        {reasons.map((r, i) => (
                          <li key={i} className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{r.label}:</span> {r.detail}
                          </li>
                        ))}
                      </ul>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </TooltipProvider>
  );
}
