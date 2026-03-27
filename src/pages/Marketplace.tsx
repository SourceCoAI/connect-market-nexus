import { useEffect, useCallback, useState } from 'react';
import { useSimplePagination } from '@/hooks/use-simple-pagination';
import { useSimpleListings, useListingMetadata } from '@/hooks/use-simple-listings';
import { useOnboarding } from '@/hooks/use-onboarding';
import ListingCard from '@/components/ListingCard';
import FilterPanel from '@/components/FilterPanel';
import OnboardingPopup from '@/components/onboarding/OnboardingPopup';
import { SearchSessionProvider } from '@/contexts/SearchSessionContext';
import { useSearchSession } from '@/hooks/use-search-session';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';


import { LayoutGrid, LayoutList, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useAllSavedListingIds } from '@/hooks/marketplace/use-saved-listings';
import { useAllConnectionStatuses } from '@/hooks/marketplace/use-connections';

import { MatchedDealsSection } from '@/components/marketplace/MatchedDealsSection';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination';
import { toast } from '@/hooks/use-toast';
import { useRealtime } from '@/components/realtime/RealtimeProvider';
import { useAuth } from '@/contexts/AuthContext';
import { Wifi } from 'lucide-react';
import { CreateDealAlertDialog } from '@/components/deal-alerts/CreateDealAlertDialog';

const MarketplaceContent = () => {
  const { user, authChecked } = useAuth();
  
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { shouldShowOnboarding, completeOnboarding } = useOnboarding();
  const { listingsConnected } = useRealtime();

  const pagination = useSimplePagination();
  // Pass buyer tier for Tier 3 time-gating (admins bypass)
  const buyerTier = user?.is_admin ? null : (user?.buyer_tier ?? null);
  const { data: listingsData, isLoading, error } = useSimpleListings(pagination.state, buyerTier);
  const { data: metadata } = useListingMetadata();

  // Batch fetch saved & connection status (2 queries total instead of 40+)
  const { data: savedIds } = useAllSavedListingIds();
  const { data: connectionMap } = useAllConnectionStatuses();

  // Search session tracking for analytics
  const { startSearch, registerResults } = useSearchSession();

  const listings = listingsData?.listings || [];
  const totalItems = listingsData?.totalItems || 0;

  // Track search query changes
  useEffect(() => {
    if (pagination.state.search) {
      startSearch(pagination.state.search);
    }
  }, [pagination.state.search, startSearch]);

  // Register listing positions for click tracking
  useEffect(() => {
    if (listings.length > 0) {
      registerResults(listings.map((l) => l.id));
    }
  }, [listings, registerResults]);
  const categories = metadata?.categories || [];
  const locations = metadata?.locations || [];

  // Enhanced loading state that includes transitions
  const isPageTransitioning = isLoading;

  const totalPages = Math.ceil(totalItems / pagination.state.perPage);
  const [viewType, setViewType] = useState<'grid' | 'list'>('grid');

  // Welcome toast on first visit after approval
  useEffect(() => {
    if (user && authChecked && user.approval_status === 'approved') {
      const welcomeKey = `sourceco_shown_welcome_${user.id}`;
      const hasSeenWelcome = localStorage.getItem(welcomeKey);
      if (!hasSeenWelcome) {
        toast({
          title: 'Welcome to SourceCo',
          description:
            'Every deal here has been sourced and qualified by our team. Request an introduction when you find a fit — we handle the rest.',
        });
        localStorage.setItem(welcomeKey, 'true');
      }
    }
  }, [user, authChecked]);

  // Error handling with toast notification
  useEffect(() => {
    if (error) {
      console.error('❌ Error loading marketplace listings:', error);
      toast({
        variant: 'destructive',
        title: 'Error loading listings',
        description:
          'There was a problem loading the marketplace listings. Please try again later.',
      });
    }
  }, [error]);

  // Enhanced error recovery
  const handleRetry = useCallback(() => {
    window.location.reload();
  }, []);

  // Enhanced pagination with smooth page number generation
  const currentPage = pagination.state.page;

  const getPageNumbers = useCallback(() => {
    const delta = 2;

    if (totalPages <= 1) return [];

    const range = new Set<number>();

    // Always include first and last pages
    range.add(1);
    if (totalPages > 1) range.add(totalPages);

    // Add pages around current page
    for (
      let i = Math.max(1, currentPage - delta);
      i <= Math.min(totalPages, currentPage + delta);
      i++
    ) {
      range.add(i);
    }

    const pages = Array.from(range).sort((a, b) => a - b);
    const result: (number | string)[] = [];

    for (let i = 0; i < pages.length; i++) {
      const current = pages[i];
      const next = pages[i + 1];

      result.push(current);

      if (next && next - current > 1) {
        result.push('...');
      }
    }

    return result;
  }, [currentPage, totalPages]);

  // Only show loading while auth is being checked - don't let onboarding block the UI
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Profile completeness gate removed — users can browse freely.
  // Connection requests are gated by profile completeness in ConnectionButton.

  return (
    <div className="min-h-screen bg-background">
      {/* Onboarding Popup */}
      {shouldShowOnboarding && user && (
        <OnboardingPopup
          isOpen={shouldShowOnboarding}
          onClose={completeOnboarding}
          userId={user.id}
        />
      )}

      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">Off-Market, Founder-Led Deals</h1>
              {listingsConnected && (
                <div className="flex items-center gap-1 text-green-600 text-sm">
                  <Wifi className="h-4 w-4" />
                  <span>Live</span>
                </div>
              )}
            </div>
          </div>

          {/* Mobile filter button */}
          <div className="lg:hidden">
            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  Filters
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[300px] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                <div className="mt-4">
                  <FilterPanel
                    onFilterChange={(filters) => {
                      pagination.setFilters(filters);
                      setFiltersOpen(false);
                    }}
                    onResetFilters={() => {
                      pagination.resetFilters();
                      setFiltersOpen(false);
                    }}
                    totalListings={totalItems}
                    filteredCount={totalItems}
                    categories={categories}
                    locations={locations}
                    currentFilters={{
                      search: pagination.state.search,
                      category: pagination.state.category,
                      location: pagination.state.location,
                      revenueMin: pagination.state.revenueMin,
                      revenueMax: pagination.state.revenueMax,
                      ebitdaMin: pagination.state.ebitdaMin,
                      ebitdaMax: pagination.state.ebitdaMax,
                    }}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Filter sidebar - desktop only */}
            <div className="hidden lg:block col-span-1">
              <FilterPanel
                onFilterChange={pagination.setFilters}
                onResetFilters={pagination.resetFilters}
                totalListings={totalItems}
                filteredCount={totalItems}
                categories={categories}
                locations={locations}
                currentFilters={{
                  search: pagination.state.search,
                  category: pagination.state.category,
                  location: pagination.state.location,
                  revenueMin: pagination.state.revenueMin,
                  revenueMax: pagination.state.revenueMax,
                  ebitdaMin: pagination.state.ebitdaMin,
                  ebitdaMax: pagination.state.ebitdaMax,
                }}
              />
            </div>

            {/* Listings */}
            <div className="col-span-1 lg:col-span-3 flex flex-col gap-4 relative">
              {/* Matched Deals Feed */}
              {user && !user.is_admin && <MatchedDealsSection />}
              {/* View type and sorting */}
              <div className="flex flex-wrap justify-between items-center gap-4">
                <div className="text-sm text-muted-foreground">
                  {isLoading ? 'Loading listings...' : `${totalItems} listings found`}
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">View:</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setViewType(viewType === 'grid' ? 'list' : 'grid')}
                      disabled={isPageTransitioning}
                      className={cn(isPageTransitioning && 'opacity-50 cursor-not-allowed')}
                    >
                      {viewType === 'grid' ? (
                        <LayoutList className="h-4 w-4" />
                      ) : (
                        <LayoutGrid className="h-4 w-4" />
                      )}
                      {viewType === 'grid' ? 'List' : 'Grid'}
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm">Results per page:</span>
                    <Select
                      value={pagination.state.perPage.toString()}
                      onValueChange={(value) => pagination.setPerPage(parseInt(value))}
                      disabled={isPageTransitioning}
                    >
                      <SelectTrigger
                        className={cn(
                          'w-20',
                          isPageTransitioning && 'opacity-50 cursor-not-allowed',
                        )}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Transition Overlay */}
              {isPageTransitioning && (
                <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center">
                  <LoadingSpinner size="lg" message="Loading page..." showMessage />
                </div>
              )}

              {/* Loading State with Spinner */}
              {isLoading && !isPageTransitioning && (
                <div className="flex justify-center items-center py-8">
                  <LoadingSpinner />
                </div>
              )}

              {/* Listings grid/list */}
              {!isLoading && error ? (
                <div className="bg-muted/30 border border-border rounded-lg p-8 text-center">
                  <h3 className="text-lg font-medium mb-2">Failed to load listings</h3>
                  <p className="text-muted-foreground mb-4">
                    There was a problem loading the marketplace listings. Please try again later.
                  </p>
                  <p className="text-sm text-red-600 mb-4">
                    Error: {error?.message || 'Unknown error'}
                  </p>
                  <Button variant="outline" onClick={handleRetry}>
                    Refresh Page
                  </Button>
                </div>
              ) : !isLoading && listings.length === 0 ? (
                <div className="bg-muted/30 border border-border rounded-lg p-8 text-center">
                  <h3 className="text-lg font-medium mb-2">No listings found</h3>
                  <p className="text-muted-foreground mb-4">
                    Try adjusting your filters to see more results, or set up a deal alert to be
                    notified when matching opportunities become available.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Button
                      variant="outline"
                      onClick={pagination.resetFilters}
                      disabled={isLoading}
                    >
                      Clear all filters
                    </Button>
                    {user && (
                      <CreateDealAlertDialog
                        trigger={<Button variant="default">Get Deal Alerts</Button>}
                      />
                    )}
                  </div>
                </div>
              ) : (
                !isLoading && (
                  <div
                    className={cn(
                      viewType === 'grid'
                        ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6'
                        : 'flex flex-col gap-3',
                    )}
                  >
                    {listings.map((listing) => (
                      <ListingCard
                        key={listing.id}
                        listing={listing}
                        viewType={viewType}
                        savedIds={savedIds}
                        connectionMap={connectionMap}
                      />
                    ))}
                  </div>
                )
              )}

              {/* Pagination */}
              {totalPages > 1 && !isLoading && (
                <Pagination className="mt-8">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (currentPage > 1 && !isPageTransitioning) {
                            pagination.setPage(currentPage - 1);
                          }
                        }}
                        className={cn(
                          'transition-all duration-200',
                          currentPage <= 1 || isPageTransitioning
                            ? 'pointer-events-none opacity-50'
                            : 'cursor-pointer hover:bg-accent',
                        )}
                      />
                    </PaginationItem>
                    {getPageNumbers().map((pageNum, idx) =>
                      pageNum === '...' ? (
                        <PaginationItem key={`ellipsis-${idx}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={`page-${pageNum}`}>
                          <PaginationLink
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              if (pageNum !== currentPage && !isPageTransitioning) {
                                pagination.setPage(pageNum as number);
                              }
                            }}
                            isActive={pageNum === currentPage}
                            className={cn(
                              'transition-all duration-200',
                              isPageTransitioning
                                ? 'pointer-events-none opacity-50'
                                : 'cursor-pointer hover:bg-accent hover:scale-105',
                              pageNum === currentPage && 'bg-primary text-primary-foreground',
                            )}
                          >
                            {pageNum}
                          </PaginationLink>
                        </PaginationItem>
                      ),
                    )}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (currentPage < totalPages && !isPageTransitioning) {
                            pagination.setPage(currentPage + 1);
                          }
                        }}
                        className={cn(
                          'transition-all duration-200',
                          currentPage >= totalPages || isPageTransitioning
                            ? 'pointer-events-none opacity-50'
                            : 'cursor-pointer hover:bg-accent',
                        )}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Marketplace = () => {
  return (
    <SearchSessionProvider>
      <MarketplaceContent />
    </SearchSessionProvider>
  );
};

export default Marketplace;
