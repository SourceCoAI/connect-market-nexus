import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Building2 } from 'lucide-react';
import { AdminListingCard } from './AdminListingCard';
import { ViewSwitcher } from './ViewSwitcher';
import { AdminListing } from '@/types/admin';
import { useListingsByType, ListingType } from '@/hooks/admin/listings/use-listings-by-type';
import { useAdmin } from '@/hooks/use-admin';
import { FilterBar, ADMIN_LISTING_FIELDS } from '@/components/filters';
import { useFilterEngine } from '@/hooks/use-filter-engine';
import { useTimeframe } from '@/hooks/use-timeframe';
import { useSavedViews } from '@/hooks/use-saved-views';

interface ListingsTabContentProps {
  type: ListingType;
  onEdit: (listing: AdminListing) => void;
  onCreateNew: () => void;
}

export function ListingsTabContent({
  type,
  onEdit,
  onCreateNew: _onCreateNew,
}: ListingsTabContentProps) {
  const { data: listings = [], isLoading } = useListingsByType(type);
  const { useToggleListingStatus, useDeleteListing, useUpdateListing } = useAdmin();
  const { mutate: toggleStatus } = useToggleListingStatus();
  const { mutate: deleteListing } = useDeleteListing();
  const { mutateAsync: updateListing } = useUpdateListing();

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [selectedListings, setSelectedListings] = useState<Set<string>>(new Set());

  // Unified filter system
  const { timeframe, setTimeframe, isInRange } = useTimeframe('all_time');
  const { views: savedViews, addView, removeView } = useSavedViews(`admin-listings-${type}`);
  const {
    filteredItems: filteredByEngine,
    filterState,
    setFilterState,
    totalCount,
    dynamicOptions,
  } = useFilterEngine(listings, ADMIN_LISTING_FIELDS);

  // Apply timeframe on top of engine results
  const filteredAndSortedListings = useMemo(() => {
    return filteredByEngine.filter((listing) => isInRange(listing.created_at));
  }, [filteredByEngine, isInRange]);

  const handleBulkAction = (action: string) => {
    if (selectedListings.size === 0) return;

    switch (action) {
      case 'activate':
        selectedListings.forEach((id) => {
          const listing = listings.find((l) => l.id === id);
          if (listing && listing.status !== 'active') {
            toggleStatus({ id, status: 'active' });
          }
        });
        break;
      case 'deactivate':
        selectedListings.forEach((id) => {
          const listing = listings.find((l) => l.id === id);
          if (listing && listing.status !== 'inactive') {
            toggleStatus({ id, status: 'inactive' });
          }
        });
        break;
      case 'delete':
        if (
          window.confirm(
            `Are you sure you want to delete ${selectedListings.size} listing(s)? This action cannot be undone.`,
          )
        ) {
          selectedListings.forEach((id) => {
            deleteListing(id);
          });
        }
        break;
    }
    setSelectedListings(new Set());
  };

  const handleStatusTagChange = (listingId: string, statusTag: string | null) => {
    const listing = listings.find((l) => l.id === listingId);
    if (listing) {
      updateListing({
        id: listingId,
        listing: { ...listing, status_tag: statusTag },
      });
    }
  };

  const emptyStateContent = (() => {
    switch (type) {
      case 'ready_to_publish':
        return {
          icon: Building2,
          title: 'No Listings Waiting to Publish',
          description: 'Push deals from the Marketplace Queue to create listings ready for review.',
          actionLabel: 'Go to Queue',
        };
      case 'live':
        return {
          icon: Building2,
          title: 'No Live Listings',
          description: 'Publish listings from the "Ready to Publish" tab to make them visible to buyers.',
          actionLabel: 'View Ready',
        };
      case 'internal':
        return {
          icon: Building2,
          title: 'No Internal Deals',
          description: 'Internal deals from remarketing will appear here.',
          actionLabel: 'Create Listing',
        };
      default:
        return {
          icon: Building2,
          title: 'No Listings',
          description: 'No listings found. Create deals from the pipeline or marketplace queue.',
          actionLabel: 'Create Listing',
        };
    }
  })();

  const isFiltered = filterState.rules.length > 0 || filterState.search;

  return (
    <div className="space-y-6">
      {/* Unified Filter Bar */}
      <FilterBar
        filterState={filterState}
        onFilterStateChange={setFilterState}
        fieldDefinitions={ADMIN_LISTING_FIELDS}
        dynamicOptions={dynamicOptions}
        totalCount={totalCount}
        filteredCount={filteredAndSortedListings.length}
        timeframe={timeframe}
        onTimeframeChange={setTimeframe}
        savedViews={savedViews}
        onSaveView={(name, filters) => addView({ name, filters })}
        onDeleteView={removeView}
        onSelectView={(view) => setFilterState(view.filters)}
      >
        {/* Extra controls injected into the filter bar row */}
        <ViewSwitcher viewMode={viewMode} onViewChange={setViewMode} />

        {selectedListings.size > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-lg">
            <span className="text-sm font-medium text-primary">
              {selectedListings.size} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleBulkAction('activate')}
              className="h-7 px-2 text-xs"
            >
              Activate
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleBulkAction('deactivate')}
              className="h-7 px-2 text-xs"
            >
              Deactivate
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleBulkAction('delete')}
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
            >
              Delete
            </Button>
          </div>
        )}
      </FilterBar>

      {/* Listings Grid/Table */}
      {isLoading ? (
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6'
              : 'space-y-4'
          }
        >
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-card rounded-xl border border-border/40 p-6 animate-pulse">
              <div className="h-32 bg-muted rounded-lg mb-4"></div>
              <div className="h-5 bg-muted rounded mb-3"></div>
              <div className="h-4 bg-muted rounded w-2/3"></div>
            </div>
          ))}
        </div>
      ) : (
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6'
              : 'space-y-4'
          }
        >
          {filteredAndSortedListings.map((listing) => (
              <AdminListingCard
                key={listing.id}
                listing={listing}
                viewMode={viewMode}
                listingType={type}
                isSelected={selectedListings.has(listing.id)}
                onSelect={(selected) => {
                  const newSelected = new Set(selectedListings);
                  if (selected) {
                    newSelected.add(listing.id);
                  } else {
                    newSelected.delete(listing.id);
                  }
                  setSelectedListings(newSelected);
                }}
                onEdit={() => onEdit(listing)}
                onToggleStatus={() => {
                  const newStatus = listing.status === 'active' ? 'inactive' : 'active';
                  toggleStatus({ id: listing.id, status: newStatus });
                }}
                onDelete={() => {
                  if (window.confirm('Are you sure you want to delete this listing?')) {
                    deleteListing(listing.id);
                  }
                }}
                onStatusTagChange={handleStatusTagChange}
              />
          ))}

          {filteredAndSortedListings.length === 0 && (
            <div className="col-span-full">
              <div className="bg-card rounded-xl border border-border/40 p-12 text-center">
                <div className="mx-auto w-14 h-14 bg-muted/50 rounded-xl flex items-center justify-center mb-5">
                  <emptyStateContent.icon className="h-7 w-7 text-muted-foreground/60" />
                </div>
                <h3 className="text-lg font-medium mb-2 text-foreground">
                  {emptyStateContent.title}
                </h3>
                <p className="text-muted-foreground mb-6 max-w-sm mx-auto text-sm">
                  {isFiltered
                    ? 'Try adjusting your search or filter criteria.'
                    : emptyStateContent.description}
                </p>
                {/* Listings are created from the Marketplace Queue */}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
