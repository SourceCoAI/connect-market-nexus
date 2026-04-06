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

const ListingsManagementTabs = () => {
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<AdminListing | null>(null);
  const [activeTab, setActiveTab] = useState<ListingType>('ready_to_publish');

  const { useCreateListing, useUpdateListing } = useAdmin();
  const { mutateAsync: createListing, isPending: isCreating } = useCreateListing();
  const { mutateAsync: updateListing, isPending: isUpdating } = useUpdateListing();
  const { data: counts } = useListingTypeCounts();

  const handleFormSubmit = async (
    data: Record<string, unknown>,
    image?: File | null,
    sendDealAlerts?: boolean,
  ) => {
    try {
      if (editingListing) {
        await updateListing({
          id: editingListing.id,
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
    setEditingListing(null);
  };

  if (isCreateFormOpen || editingListing) {
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
              Ready to Publish
              {counts && (
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                  {counts.ready_to_publish || 0}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="live" className="gap-2">
              Live on Marketplace
              {counts && (
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                  {counts.live || 0}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="internal" className="gap-2">
              All Internal
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
              onEdit={setEditingListing}
              onCreateNew={() => setIsCreateFormOpen(true)}
            />
          </TabsContent>
          <TabsContent value="live">
            <ListingsTabContent
              type="live"
              onEdit={setEditingListing}
              onCreateNew={() => setIsCreateFormOpen(true)}
            />
          </TabsContent>
          <TabsContent value="internal">
            <ListingsTabContent
              type="internal"
              onEdit={setEditingListing}
              onCreateNew={() => setIsCreateFormOpen(true)}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ListingsManagementTabs;
