import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ListingsTabContent } from './ListingsTabContent';
import { ListingForm } from './ListingForm';
import { AdminListing } from '@/types/admin';
import { useAdmin } from '@/hooks/use-admin';
import { useListingTypeCounts } from '@/hooks/admin/listings/use-listings-by-type';
import { ListingType } from '@/hooks/admin/listings/use-listings-by-type';
import { useAdminListingDetail } from '@/hooks/admin/listings/use-admin-listing-detail';
import { Loader2 } from 'lucide-react';

const ListingsManagementTabs = () => {
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [editingListingId, setEditingListingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ListingType>('ready_to_publish');

  const { useCreateListing, useUpdateListing } = useAdmin();
  const { mutateAsync: createListing, isPending: isCreating } = useCreateListing();
  const { mutateAsync: updateListing, isPending: isUpdating } = useUpdateListing();
  const { data: counts } = useListingTypeCounts();

  // Fetch full listing detail when editing
  const { data: editingListing, isLoading: isLoadingDetail } = useAdminListingDetail(editingListingId);

  const handleFormSubmit = async (
    data: Record<string, unknown>,
    image?: File | null,
    sendDealAlerts?: boolean,
  ) => {
    try {
      if (editingListingId && editingListing) {
        await updateListing({
          id: editingListingId,
          listing: data as Partial<Omit<AdminListing, 'id' | 'created_at' | 'updated_at'>>,
          image,
        });
      } else {
        await createListing({
          listing: data as Omit<AdminListing, 'id' | 'created_at' | 'updated_at'>,
          image,
          sendDealAlerts,
          targetType: 'marketplace',
        });
      }
      handleFormClose();
    } catch (error) {
      console.error('[FORM SUBMIT] Mutation failed:', error);
    }
  };

  const handleFormClose = () => {
    setIsCreateFormOpen(false);
    setEditingListingId(null);
  };

  const handleEditListing = (listing: AdminListing) => {
    // Store only the ID — full record will be fetched by useAdminListingDetail
    setEditingListingId(listing.id);
  };

  if (isCreateFormOpen || editingListingId) {
    // Show loading while fetching full listing detail for edit
    if (editingListingId && (isLoadingDetail || !editingListing)) {
      return (
        <div className="p-6 max-w-4xl mx-auto flex items-center justify-center min-h-[400px]">
          <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Loading listing details…</p>
          </div>
        </div>
      );
    }

    return (
      <div className="p-6 max-w-4xl mx-auto">
        <ListingForm
          listing={editingListing ?? undefined}
          onSubmit={handleFormSubmit}
          isLoading={isCreating || isUpdating}
          targetType="marketplace"
        />
        <div className="mt-6">
          <Button variant="outline" onClick={handleFormClose}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1600px] mx-auto px-2 sm:px-6 lg:px-10 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-light text-foreground tracking-tight">
              Listings Management
            </h1>
            <p className="text-sm text-muted-foreground">
              Review, publish, and manage marketplace listings
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ListingType)}>
          <TabsList>
            <TabsTrigger value="ready_to_publish" className="gap-2">
              <span className="sm:hidden">Ready</span>
              <span className="hidden sm:inline">Ready to Publish</span>
              {counts && (
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                  {counts.ready_to_publish || 0}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="live" className="gap-2">
              <span className="sm:hidden">Live</span>
              <span className="hidden sm:inline">Live on Marketplace</span>
              {counts && (
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                  {counts.live || 0}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="internal" className="gap-2">
              <span className="sm:hidden">Internal</span>
              <span className="hidden sm:inline">All Internal</span>
              {counts && (
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                  {counts.internal || 0}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="ready_to_publish">
            <ListingsTabContent
              type="ready_to_publish"
              onEdit={handleEditListing}
              onCreateNew={() => setIsCreateFormOpen(true)}
            />
          </TabsContent>
          <TabsContent value="live">
            <ListingsTabContent
              type="live"
              onEdit={handleEditListing}
              onCreateNew={() => setIsCreateFormOpen(true)}
            />
          </TabsContent>
          <TabsContent value="internal">
            <ListingsTabContent
              type="internal"
              onEdit={handleEditListing}
              onCreateNew={() => setIsCreateFormOpen(true)}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ListingsManagementTabs;
