import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useMarketplace } from '@/hooks/use-marketplace';
import { FilterOptions, PaginationState } from '@/types';
import ListingCard from '@/components/ListingCard';
import { Button } from '@/components/ui/button';
import { LayoutGrid, LayoutList, ChevronLeft, ChevronRight, Lightbulb } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { useAllSavedListingIds } from '@/hooks/marketplace/use-saved-listings';
import { useAllConnectionStatuses } from '@/hooks/marketplace/use-connections';
import { SavedListingAnnotation } from '@/components/marketplace/SavedListingAnnotation';
import { SavedListingMessages } from '@/components/marketplace/SavedListingMessages';

const ANNOTATION_STORAGE_KEY = 'sourceco_saved_listing_notes';

function loadAnnotations(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(ANNOTATION_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveAnnotations(notes: Record<string, string>) {
  localStorage.setItem(ANNOTATION_STORAGE_KEY, JSON.stringify(notes));
}

const SavedListings = () => {
  // URL-persisted filter state (survives browser Back navigation)
  const [searchParams, setSearchParams] = useSearchParams();
  const [annotations, setAnnotations] = useState<Record<string, string>>(loadAnnotations);
  const filters: FilterOptions = useMemo(
    () => ({
      page: Number(searchParams.get('page')) || 1,
      perPage: Number(searchParams.get('perPage')) || 20,
    }),
    [searchParams],
  );
  const setFilters = useCallback(
    (updater: FilterOptions | ((prev: FilterOptions) => FilterOptions)) => {
      setSearchParams(
        (p) => {
          const cur: FilterOptions = {
            page: Number(p.get('page')) || 1,
            perPage: Number(p.get('perPage')) || 20,
          };
          const next = typeof updater === 'function' ? updater(cur) : updater;
          const n = new URLSearchParams(p);
          if (next.page && next.page > 1) n.set('page', String(next.page));
          else n.delete('page');
          if (next.perPage && next.perPage !== 20) n.set('perPage', String(next.perPage));
          else n.delete('perPage');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const viewType = (searchParams.get('view') as 'grid' | 'list') ?? 'grid';
  const setViewType = useCallback(
    (v: 'grid' | 'list') => {
      setSearchParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (v !== 'grid') n.set('view', v);
          else n.delete('view');
          return n;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const [pagination, setPagination] = useState<PaginationState>({
    currentPage: filters.page || 1,
    totalPages: 1,
    totalItems: 0,
    perPage: filters.perPage || 20,
  });

  const navigate = useNavigate();
  const { useSavedListings } = useMarketplace();
  const { data: listingsData, isLoading, error } = useSavedListings(filters);

  // Batch fetch (2 queries instead of N+1)
  const { data: savedIds } = useAllSavedListingIds();
  const { data: connectionMap } = useAllConnectionStatuses();

  const listings = listingsData?.listings || [];
  const totalItems = listingsData?.totalCount || 0;

  const handleSaveAnnotation = useCallback((listingId: string, note: string) => {
    setAnnotations((prev) => {
      const next = { ...prev };
      if (note) {
        next[listingId] = note;
      } else {
        delete next[listingId];
      }
      saveAnnotations(next);
      return next;
    });
  }, []);

  const handleDeleteAnnotation = useCallback((listingId: string) => {
    setAnnotations((prev) => {
      const next = { ...prev };
      delete next[listingId];
      saveAnnotations(next);
      return next;
    });
  }, []);

  // "More like this" — detect common categories among saved listings
  const moreLikeThisSuggestion = useMemo(() => {
    if (listings.length < 3) return null;
    const categoryCounts: Record<string, number> = {};
    for (const l of listings) {
      const cat = l.category;
      if (cat) categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
    const topCategory = Object.entries(categoryCounts)
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])[0];
    if (!topCategory) return null;
    return { category: topCategory[0], count: topCategory[1] };
  }, [listings]);

  // Update pagination whenever total count or filters change
  useEffect(() => {
    if (listingsData) {
      const perPage = filters.perPage || 20;
      const totalPages = Math.ceil(totalItems / perPage);

      setPagination({
        currentPage: filters.page || 1,
        totalPages,
        totalItems,
        perPage,
      });
    }
  }, [listingsData, totalItems, filters.page, filters.perPage]);

  // Error handling
  useEffect(() => {
    if (error) {
      console.error('Error loading saved listings:', error);
      toast({
        variant: 'destructive',
        title: 'Error loading saved listings',
        description: 'There was a problem loading your saved listings. Please try again later.',
      });
    }
  }, [error]);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.totalPages) return;

    setFilters((prev) => ({
      ...prev,
      page: newPage,
    }));
  };

  const handlePerPageChange = (value: string) => {
    const perPage = Number(value);
    setFilters((prev) => ({
      ...prev,
      perPage,
      page: 1, // Reset to first page when changing items per page
    }));
  };

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const { currentPage, totalPages } = pagination;
    const delta = 1; // Number of pages to show before and after current page

    const range = [];
    const rangeWithDots = [];

    if (totalPages <= 1) return [];

    // Always include first page
    range.push(1);

    // Calculate the range of pages to show
    for (
      let i = Math.max(2, currentPage - delta);
      i <= Math.min(totalPages - 1, currentPage + delta);
      i++
    ) {
      range.push(i);
    }

    // Always include last page if more than 1 page
    if (totalPages > 1) {
      range.push(totalPages);
    }

    // Add dots where needed
    let prev = 0;
    for (const i of range) {
      if (prev && i - prev === 2) {
        rangeWithDots.push(prev + 1);
      } else if (i - prev > 2) {
        rangeWithDots.push('...');
      }
      rangeWithDots.push(i);
      prev = i;
    }

    return rangeWithDots;
  };

  const renderSkeletons = () => {
    return Array(filters.perPage || 8)
      .fill(0)
      .map((_, index) => (
        <div
          key={`skeleton-${index}`}
          className="bg-white rounded-lg border border-border overflow-hidden h-full flex flex-col"
        >
          <div className="p-6">
            <div className="flex space-x-2 mb-2">
              <div className="h-6 w-16 bg-muted rounded skeleton"></div>
              <div className="h-6 w-20 bg-muted rounded skeleton"></div>
            </div>
            <div className="h-7 w-4/5 bg-muted rounded mb-4 skeleton"></div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="h-16 bg-muted rounded skeleton"></div>
              <div className="h-16 bg-muted rounded skeleton"></div>
            </div>
            <div className="space-y-2 mb-6">
              <div className="h-4 w-full bg-muted rounded skeleton"></div>
              <div className="h-4 w-11/12 bg-muted rounded skeleton"></div>
              <div className="h-4 w-4/5 bg-muted rounded skeleton"></div>
            </div>
            <div className="h-10 w-full bg-muted rounded skeleton"></div>
          </div>
        </div>
      ));
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <h1 className="text-3xl font-bold">Saved Listings</h1>
          </div>

          <div className="flex flex-col gap-4">
            {/* View type and sorting */}
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div className="text-sm text-muted-foreground">
                {isLoading
                  ? 'Loading saved listings...'
                  : `${totalItems} saved listings found, showing ${listings.length}`}
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm">Results per page:</span>
                  <Select value={String(filters.perPage || 20)} onValueChange={handlePerPageChange}>
                    <SelectTrigger className="w-[80px]">
                      <SelectValue placeholder="20" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm">View:</span>
                  <Tabs value={viewType} onValueChange={(v) => setViewType(v as 'grid' | 'list')}>
                    <TabsList>
                      <TabsTrigger value="grid">
                        <LayoutGrid className="h-4 w-4" />
                      </TabsTrigger>
                      <TabsTrigger value="list">
                        <LayoutList className="h-4 w-4" />
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </div>
            </div>

            {/* "More like this" suggestion */}
            {moreLikeThisSuggestion && !isLoading && (
              <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg flex items-center gap-3">
                <Lightbulb className="h-4 w-4 text-purple-600 shrink-0" />
                <p className="text-sm text-purple-800 flex-1">
                  You've saved {moreLikeThisSuggestion.count} {moreLikeThisSuggestion.category}{' '}
                  deals.{' '}
                  <Link
                    to={`/marketplace?category=${encodeURIComponent(moreLikeThisSuggestion.category)}`}
                    className="font-medium underline hover:text-purple-900"
                  >
                    See more like these →
                  </Link>
                </p>
              </div>
            )}

            {/* Listings grid/list */}
            {isLoading ? (
              <div
                className={
                  viewType === 'grid'
                    ? 'grid grid-cols-1 md:grid-cols-2 gap-4'
                    : 'flex flex-col gap-4'
                }
              >
                {renderSkeletons()}
              </div>
            ) : error ? (
              <div className="bg-muted/30 border border-border rounded-lg p-8 text-center">
                <h3 className="text-lg font-medium mb-2">Failed to load saved listings</h3>
                <p className="text-muted-foreground mb-4">
                  There was a problem loading your saved listings. Please try again later.
                </p>
                <Button variant="outline" onClick={() => window.location.reload()}>
                  Retry
                </Button>
              </div>
            ) : listings.length === 0 ? (
              <div className="bg-muted/30 border border-border rounded-lg p-8 text-center">
                <h3 className="text-lg font-medium mb-2">No saved listings found</h3>
                <p className="text-muted-foreground mb-4">
                  You haven't saved any listings yet. Browse the marketplace to save listings you're
                  interested in.
                </p>
                <Button variant="outline" onClick={() => navigate('/marketplace')}>
                  Browse Marketplace
                </Button>
              </div>
            ) : (
              <>
                <div
                  className={
                    viewType === 'grid'
                      ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6'
                      : 'flex flex-col gap-4'
                  }
                >
                  {listings.map((listing) => (
                    <div key={listing.id}>
                      <ListingCard
                        listing={listing}
                        viewType={viewType}
                        savedIds={savedIds}
                        connectionMap={connectionMap}
                      />
                      <SavedListingAnnotation
                        listingId={listing.id}
                        note={annotations[listing.id] || ''}
                        onSave={handleSaveAnnotation}
                        onDelete={handleDeleteAnnotation}
                      />
                    </div>
                  ))}
                </div>

                {/* Pagination controls */}
                {pagination.totalPages > 1 && (
                  <div className="flex items-center justify-center mt-8">
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(pagination.currentPage - 1)}
                        disabled={pagination.currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Previous
                      </Button>

                      {getPageNumbers().map((pageNum, idx) =>
                        pageNum === '...' ? (
                          <span key={`ellipsis-${idx}`} className="px-2">
                            ...
                          </span>
                        ) : (
                          <Button
                            key={`page-${pageNum}`}
                            variant={pagination.currentPage === pageNum ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handlePageChange(pageNum as number)}
                          >
                            {pageNum}
                          </Button>
                        ),
                      )}

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePageChange(pagination.currentPage + 1)}
                        disabled={pagination.currentPage === pagination.totalPages}
                      >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SavedListings;
